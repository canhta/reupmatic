import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildClonedVoiceMeta,
  type ClonedVoiceData,
  type ClonedVoiceMeta,
  newClonedVoiceId,
  parseClonedVoiceData,
  parseClonedVoiceId,
  parseClonedVoiceMeta,
  parseVoiceCloneRequest,
  parseVoiceName,
} from '../../../core/speech/voices.js';
import { RemoteError } from '../../../core/worker/remote-error.js';

const FILE_LIMIT = 8 * 1024 ** 2;
const META_LIMIT = 256 * 1024;

interface StoredFile {
  voices: ClonedVoiceMeta[];
}

/** App-owned store for cloned voices; never written inside a hash-verified model bundle. */
export class ClonedVoiceStore {
  readonly #directory: string;
  readonly #file: string;

  constructor(directory: string) {
    this.#directory = directory;
    this.#file = path.join(directory, 'voices.json');
  }

  #dataPath(id: string): string {
    return path.join(this.#directory, `${id}.voice.json`);
  }

  async #read(): Promise<StoredFile> {
    let raw: string;
    try {
      raw = await readFile(this.#file, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { voices: [] };
      throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
    }
    if (Buffer.byteLength(raw) > META_LIMIT) throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
    try {
      const value = JSON.parse(raw) as { voices?: unknown[] };
      if (!value || typeof value !== 'object' || !Array.isArray(value.voices)) throw new Error();
      const voices = value.voices.map((voice) => parseClonedVoiceMeta(voice));
      if (new Set(voices.map((voice) => voice.id)).size !== voices.length) throw new Error();
      return { voices };
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
    }
  }

  async #write(value: StoredFile): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const temp = path.join(this.#directory, `.voices-${Date.now()}-${Math.random()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(value, null, 2), 'utf-8');
      await rename(temp, this.#file);
    } finally {
      await rm(temp, { force: true });
    }
  }

  async #readData(id: string): Promise<ClonedVoiceData> {
    let raw: string;
    try {
      raw = await readFile(this.#dataPath(id), 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new RemoteError('SPEECH_VOICE_NOT_FOUND');
      throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
    }
    if (Buffer.byteLength(raw) > FILE_LIMIT) throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
    try {
      return parseClonedVoiceData(JSON.parse(raw));
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
    }
  }

  list(): Promise<ClonedVoiceMeta[]> {
    return this.#read().then((stored) => this.#present(stored));
  }

  #present(stored: StoredFile): ClonedVoiceMeta[] {
    return stored.voices
      .map((voice) => structuredClone(voice))
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  /** Creates a cloned voice and persists it with the attestation timestamp the write took. */
  async create(draft: unknown, data: unknown): Promise<ClonedVoiceMeta> {
    const request = parseVoiceCloneRequest(draft);
    const voiceData = parseClonedVoiceData(data);
    const stored = await this.#read();
    const id = newClonedVoiceId();
    const meta = buildClonedVoiceMeta(request, id);
    await writeFile(this.#dataPath(id), JSON.stringify(voiceData), 'utf-8').catch(() => {
      throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
    });
    try {
      await this.#write({ voices: [...stored.voices, meta] });
    } catch (error) {
      await rm(this.#dataPath(id), { force: true });
      throw error;
    }
    return structuredClone(meta);
  }

  async rename(id: unknown, name: unknown): Promise<ClonedVoiceMeta> {
    const voiceId = parseClonedVoiceId(id);
    const value = parseVoiceName(name);
    const stored = await this.#read();
    const existing = stored.voices.find((voice) => voice.id === voiceId);
    if (!existing) throw new RemoteError('SPEECH_VOICE_NOT_FOUND');
    const updated: ClonedVoiceMeta = { ...existing, name: value };
    await this.#write({
      voices: stored.voices.map((voice) => (voice.id === voiceId ? updated : voice)),
    });
    return structuredClone(updated);
  }

  async remove(id: unknown): Promise<void> {
    const voiceId = parseClonedVoiceId(id);
    const stored = await this.#read();
    if (!stored.voices.some((voice) => voice.id === voiceId))
      throw new RemoteError('SPEECH_VOICE_NOT_FOUND');
    await this.#write({ voices: stored.voices.filter((voice) => voice.id !== voiceId) });
    await rm(this.#dataPath(voiceId), { force: true });
  }

  /** Resolves the numeric payload for a worker job; the renderer never receives this. */
  data(id: unknown): Promise<ClonedVoiceData> {
    return this.#readData(parseClonedVoiceId(id));
  }

  /** Every stored voice file, so a caller can assert nothing stray was left behind. */
  async entries(): Promise<string[]> {
    return readdir(this.#directory).catch(() => []);
  }
}
