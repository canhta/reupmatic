import { lstat, open, readdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hashFile, saveChosenExport } from '../../media/files.js';
import { RemoteError } from '../../worker/remote-error.js';
import {
  SYNTHESIS_PARAMS_KEYS,
  type SynthesisInput,
  type SynthesisResult,
  validateSynthesisResult,
} from './contracts.js';

interface Artifact {
  result: SynthesisResult;
  input: SynthesisInput;
}
export type SynthesisExportKind = 'wav' | 'receipt';

/** What a saved project records about one generated artifact: its identity and its content
 *  hash. Verification never trusts this reference alone; it is the thing the on-disk pair
 *  must agree with. */
export interface ArtifactReference {
  artifact_id: string;
  sha256: string;
}

const ARTIFACT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** Grants only queue-produced, verified WAV/receipt pairs, never a renderer path. The admitted
 *  map is a per-session cache in front of the durable artifact directory: a saved project's
 *  reference can be rediscovered and re-verified after a relaunch, but only through the same
 *  header/size/hash/self-consistency inspection a live draft passes. */
export class SynthesisArtifacts {
  private readonly admitted = new Map<string, Artifact>();
  private readonly modelSources = new Set<string>();
  constructor(private readonly workspace: string) {}

  async admit(value: unknown, input: SynthesisInput): Promise<SynthesisResult> {
    const result = validateSynthesisResult(value, input);
    if (this.admitted.has(result.artifact_id)) throw new RemoteError('DUPLICATE_ARTIFACT');
    if (this.admitted.size >= 256) throw new RemoteError('SYNTHESIS_ARTIFACT_LIMIT');
    const record = { result, input: structuredClone(input) };
    await this.inspect(record);
    await this.rememberConfiguredFiles();
    this.admitted.set(result.artifact_id, record);
    return structuredClone(result);
  }

  async verify(id: string, kind: SynthesisExportKind = 'wav'): Promise<string> {
    const record = this.admitted.get(id);
    if (!record) throw new RemoteError('UNKNOWN_ARTIFACT');
    const directory = await this.inspect(record);
    return path.join(directory, kind === 'wav' ? 'speech.wav' : 'receipt.json');
  }

  /** Rediscover and re-verify an artifact a saved project references. Missing audio reports
   *  itself as missing; anything present but inconsistent, substituted or hash-mismatched is
   *  altered. Never grants a caller-supplied path — only the recorded artifact identity is
   *  looked up below the workspace's own `speech/` directory. */
  async reopen(reference: ArtifactReference): Promise<SynthesisResult> {
    const existing = this.admitted.get(reference.artifact_id);
    if (existing) {
      if (existing.result.sha256 !== reference.sha256)
        throw new RemoteError('SYNTHESIS_ARTIFACT_ALTERED');
      try {
        await this.inspect(existing);
      } catch {
        throw new RemoteError('SYNTHESIS_ARTIFACT_ALTERED');
      }
      return structuredClone(existing.result);
    }
    const record = await this.readRecord(reference);
    this.admitted.set(reference.artifact_id, record);
    return structuredClone(record.result);
  }

  /** The verified WAV path for a saved project's artifact, through the identical inspection the
   *  save dialog uses. The render path admits audio here, not by trusting a filesystem path. */
  async verifyReference(reference: ArtifactReference, kind: SynthesisExportKind = 'wav') {
    await this.reopen(reference);
    return this.verify(reference.artifact_id, kind);
  }

  /** Remove generated artifacts no project references any more. A directory that is not a
   *  well-formed owned pair is left alone rather than deleted, so a substitution is never
   *  destroyed as if it were ours. */
  async collect(referenced: Iterable<string>): Promise<string[]> {
    const keep = new Set(referenced);
    let entries: string[];
    try {
      const workspace = await realpath(this.workspace);
      entries = await readdir(path.join(workspace, 'speech'));
    } catch {
      return [];
    }
    const removed: string[] = [];
    for (const name of entries) {
      if (keep.has(name) || !ARTIFACT_ID.test(name)) continue;
      const directory = path.join(await realpath(this.workspace), 'speech', name);
      try {
        const info = await lstat(directory);
        if (
          !info.isDirectory() ||
          info.isSymbolicLink() ||
          (await realpath(directory)) !== directory
        )
          continue;
        const files = await readdir(directory);
        if (files.length !== 2 || !files.includes('speech.wav') || !files.includes('receipt.json'))
          continue;
        await rm(directory, { recursive: true });
        this.admitted.delete(name);
        removed.push(name);
      } catch {}
    }
    return removed.sort();
  }

  private async readRecord(reference: ArtifactReference): Promise<Artifact> {
    const fail = (code: string): never => {
      throw new RemoteError(code);
    };
    if (!ARTIFACT_ID.test(reference.artifact_id)) return fail('SYNTHESIS_ARTIFACT_MISSING');
    let workspace: string;
    try {
      workspace = await realpath(this.workspace);
    } catch {
      return fail('SYNTHESIS_ARTIFACT_MISSING');
    }
    const receipt = path.join(workspace, 'speech', reference.artifact_id, 'receipt.json');
    let raw: string;
    try {
      const info = await lstat(receipt);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 100000)
        return fail('SYNTHESIS_ARTIFACT_ALTERED');
      raw = await readFile(receipt, 'utf8');
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return fail('SYNTHESIS_ARTIFACT_MISSING');
      return fail('SYNTHESIS_ARTIFACT_ALTERED');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail('SYNTHESIS_ARTIFACT_ALTERED');
    }
    const params = Object.fromEntries(
      SYNTHESIS_PARAMS_KEYS.map((key) => [key, (parsed as Record<string, unknown>)?.[key]]),
    );
    const input = {
      request_id: reference.artifact_id,
      revision: 0,
      params,
    } as unknown as SynthesisInput;
    let result: SynthesisResult;
    try {
      result = validateSynthesisResult(parsed, input);
    } catch {
      return fail('SYNTHESIS_ARTIFACT_ALTERED');
    }
    if (result.artifact_id !== reference.artifact_id || result.sha256 !== reference.sha256)
      return fail('SYNTHESIS_ARTIFACT_ALTERED');
    const record: Artifact = { result, input };
    try {
      await this.inspect(record);
    } catch {
      return fail('SYNTHESIS_ARTIFACT_ALTERED');
    }
    return record;
  }

  async save(
    id: string,
    kind: SynthesisExportKind,
    destination: string,
    originals: Iterable<string>,
    check: () => void = () => undefined,
  ): Promise<void> {
    const source = await this.verify(id, kind);
    check();
    // Protect every live generated file as well as imported originals. Saving must
    // not overwrite another draft or its receipt through a native dialog.
    await this.rememberConfiguredFiles();
    const protectedPaths = [
      ...originals,
      ...this.modelSources,
      path.join(this.workspace, 'local-synthesis.json'),
    ];
    for (const key of this.admitted.keys()) {
      protectedPaths.push(
        path.join(this.workspace, 'speech', key, 'speech.wav'),
        path.join(this.workspace, 'speech', key, 'receipt.json'),
      );
    }
    await saveChosenExport(source, destination, protectedPaths, check);
  }

  async discard(id: string): Promise<void> {
    const record = this.admitted.get(id);
    if (!record) return;
    // Refuse deletion of a substituted directory; it is no longer our artifact.
    const directory = await this.inspect(record);
    this.admitted.delete(id);
    await rm(directory, { recursive: true });
  }

  private async rememberConfiguredFiles(): Promise<void> {
    // This is an overwrite guard, not a second model validator. Include all
    // conservatively confined file references, including previous session models.
    const filename = path.join(this.workspace, 'local-synthesis.json');
    let data: Buffer;
    try {
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536)
        throw new Error('SYNTHESIS_MANIFEST_INVALID');
      data = await readFile(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const config = JSON.parse(data.toString('utf8'));
    if (
      !config ||
      typeof config.directory !== 'string' ||
      !path.isAbsolute(config.directory) ||
      !config.files ||
      typeof config.files !== 'object' ||
      Array.isArray(config.files)
    ) {
      throw new Error('SYNTHESIS_MANIFEST_INVALID');
    }
    for (const name of Object.keys(config.files)) {
      if (
        !name ||
        name.includes('\\') ||
        name.split('/').some((part) => !part || part === '..' || part === '.') ||
        path.isAbsolute(name)
      )
        throw new Error('SYNTHESIS_MANIFEST_INVALID');
      this.modelSources.add(path.join(config.directory, name));
    }
  }

  private async inspect(record: Artifact): Promise<string> {
    const fail = (): never => {
      throw new RemoteError('SYNTHESIS_ARTIFACT_INVALID');
    };
    try {
      const workspace = await realpath(this.workspace);
      const root = path.join(workspace, 'speech');
      const directory = path.join(root, record.result.artifact_id);
      for (const name of [root, directory]) {
        const info = await lstat(name);
        if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(name)) !== name)
          return fail();
      }
      const entries = await readdir(directory);
      if (
        entries.length !== 2 ||
        !entries.includes('speech.wav') ||
        !entries.includes('receipt.json')
      )
        return fail();
      const wav = path.join(directory, 'speech.wav'),
        receipt = path.join(directory, 'receipt.json');
      const [audioInfo, receiptInfo] = await Promise.all([lstat(wav), lstat(receipt)]);
      if (
        !audioInfo.isFile() ||
        audioInfo.isSymbolicLink() ||
        audioInfo.size !== 44 + record.result.frames * 2 ||
        !receiptInfo.isFile() ||
        receiptInfo.isSymbolicLink() ||
        receiptInfo.size > 100000
      )
        return fail();
      const metadata = validateSynthesisResult(
        JSON.parse(await readFile(receipt, 'utf8')),
        record.input,
      );
      if (!isDeepStrictEqual(metadata, record.result)) return fail();
      const handle = await open(wav, 'r');
      try {
        const header = Buffer.alloc(44);
        if (
          (await handle.read(header, 0, 44, 0)).bytesRead !== 44 ||
          header.toString('ascii', 0, 4) !== 'RIFF' ||
          header.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
          header.readUInt32LE(4) !== audioInfo.size - 8 ||
          header.readUInt32LE(16) !== 16 ||
          header.readUInt16LE(20) !== 1 ||
          header.readUInt16LE(22) !== 1 ||
          header.readUInt32LE(24) !== record.result.sample_rate ||
          header.readUInt32LE(28) !== record.result.sample_rate * 2 ||
          header.readUInt16LE(32) !== 2 ||
          header.readUInt16LE(34) !== 16 ||
          header.toString('ascii', 36, 40) !== 'data' ||
          header.readUInt32LE(40) !== record.result.frames * 2
        )
          return fail();
      } finally {
        await handle.close();
      }
      if ((await hashFile(wav)) !== record.result.sha256) return fail();
      return directory;
    } catch {
      return fail();
    }
  }
}
