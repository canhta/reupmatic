import { lstat, open, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hashFile, saveChosenExport } from '../../media/files.js';
import { RemoteError } from '../../worker/remote-error.js';
import { validateSynthesisResult, type SynthesisInput, type SynthesisResult } from './contracts.js';

interface Artifact { result: SynthesisResult; input: SynthesisInput }
export type SynthesisExportKind = 'wav' | 'receipt';

/** Grants only queue-produced, verified WAV/receipt pairs, never a renderer path. */
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

  async save(id: string, kind: SynthesisExportKind, destination: string,
    originals: Iterable<string>, check: () => void = () => undefined): Promise<void> {
    const source = await this.verify(id, kind);
    check();
    // Protect every live generated file as well as imported originals. Saving must
    // not overwrite another draft or its receipt through a native dialog.
    await this.rememberConfiguredFiles();
    const protectedPaths = [...originals, ...this.modelSources, path.join(this.workspace, 'local-synthesis.json')];
    for (const key of this.admitted.keys()) {
      protectedPaths.push(path.join(this.workspace, 'speech', key, 'speech.wav'),
        path.join(this.workspace, 'speech', key, 'receipt.json'));
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
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('SYNTHESIS_MANIFEST_INVALID');
      data = await readFile(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const config = JSON.parse(data.toString('utf8'));
    if (!config || typeof config.directory !== 'string' || !path.isAbsolute(config.directory)
      || !config.files || typeof config.files !== 'object' || Array.isArray(config.files)) {
      throw new Error('SYNTHESIS_MANIFEST_INVALID');
    }
    for (const name of Object.keys(config.files)) {
      if (!name || name.includes('\\') || name.split('/').some(part => !part || part === '..' || part === '.')
        || path.isAbsolute(name)) throw new Error('SYNTHESIS_MANIFEST_INVALID');
      this.modelSources.add(path.join(config.directory, name));
    }
  }

  private async inspect(record: Artifact): Promise<string> {
    const fail = (): never => { throw new RemoteError('SYNTHESIS_ARTIFACT_INVALID'); };
    try {
      const workspace = await realpath(this.workspace);
      const root = path.join(workspace, 'speech');
      const directory = path.join(root, record.result.artifact_id);
      for (const name of [root, directory]) {
        const info = await lstat(name);
        if (!info.isDirectory() || info.isSymbolicLink() || await realpath(name) !== name) return fail();
      }
      const entries = await readdir(directory);
      if (entries.length !== 2 || !entries.includes('speech.wav') || !entries.includes('receipt.json')) return fail();
      const wav = path.join(directory, 'speech.wav'), receipt = path.join(directory, 'receipt.json');
      const [audioInfo, receiptInfo] = await Promise.all([lstat(wav), lstat(receipt)]);
      if (!audioInfo.isFile() || audioInfo.isSymbolicLink() || audioInfo.size !== 44 + record.result.frames * 2
        || !receiptInfo.isFile() || receiptInfo.isSymbolicLink() || receiptInfo.size > 100000) return fail();
      const metadata = validateSynthesisResult(JSON.parse(await readFile(receipt, 'utf8')), record.input);
      if (!isDeepStrictEqual(metadata, record.result)) return fail();
      const handle = await open(wav, 'r');
      try {
        const header = Buffer.alloc(44);
        if ((await handle.read(header, 0, 44, 0)).bytesRead !== 44 || header.toString('ascii', 0, 4) !== 'RIFF'
          || header.toString('ascii', 8, 16) !== 'WAVEfmt ' || header.readUInt32LE(4) !== audioInfo.size - 8
          || header.readUInt32LE(16) !== 16 || header.readUInt16LE(20) !== 1 || header.readUInt16LE(22) !== 1
          || header.readUInt32LE(24) !== 48000 || header.readUInt32LE(28) !== 96000
          || header.readUInt16LE(32) !== 2 || header.readUInt16LE(34) !== 16
          || header.toString('ascii', 36, 40) !== 'data' || header.readUInt32LE(40) !== record.result.frames * 2) return fail();
      } finally { await handle.close(); }
      if (await hashFile(wav) !== record.result.sha256) return fail();
      return directory;
    } catch { return fail(); }
  }
}
