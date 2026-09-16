import { randomUUID } from 'node:crypto';
import { mkdir, open, realpath, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Preferences } from './settings-types.js';

function parse(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SETTINGS_INVALID');
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new Error('SETTINGS_VERSION');
  if (Object.keys(record).sort().join(',') !== 'default_output_dir,revision,version'
    || !Number.isSafeInteger(record.revision) || Number(record.revision) < 0
    || (record.default_output_dir !== null && (typeof record.default_output_dir !== 'string'
      || !path.isAbsolute(record.default_output_dir) || record.default_output_dir.includes('\0')
      || record.default_output_dir.length > 32768))) throw new Error('SETTINGS_INVALID');
  return structuredClone(record) as unknown as Preferences;
}

export class PreferencesStore {
  private pending: Promise<unknown> = Promise.resolve();

  private constructor(private readonly filename: string, private value: Preferences) {}

  static async open(filename: string): Promise<PreferencesStore> {
    let value: Preferences = { version: 1, revision: 0, default_output_dir: null };
    const file = await open(filename, 'r').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw new Error('SETTINGS_UNAVAILABLE');
    });
    if (file) {
      try {
        const data = Buffer.alloc(65537);
        let length = 0;
        while (length < data.length) {
          const { bytesRead } = await file.read(data, length, data.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        if (length > 65536) throw new Error('SETTINGS_INVALID');
        let raw: unknown;
        try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, length))); }
        catch { throw new Error('SETTINGS_INVALID'); }
        value = parse(raw);
      } finally { await file.close(); }
    }
    return new PreferencesStore(filename, value);
  }

  snapshot(): Preferences {
    return structuredClone(this.value);
  }

  setOutputDirectory(directory: string | null): Promise<Preferences> {
    const next = this.pending.then(async () => {
      let canonical: string | null = null;
      if (directory !== null) {
        if (typeof directory !== 'string' || !path.isAbsolute(directory)
          || directory.includes('\0')) throw new Error('INVALID_REQUEST');
        canonical = await realpath(directory).catch(() => { throw new Error('OUTPUT_DIRECTORY_MISSING'); });
        if (!(await stat(canonical)).isDirectory()) throw new Error('OUTPUT_DIRECTORY_MISSING');
      }
      const updated = parse({ version: 1, revision: this.value.revision + 1, default_output_dir: canonical });
      await mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      try {
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(`${JSON.stringify(updated, null, 2)}\n`);
          await file.sync();
        } finally { await file.close(); }
        await rename(temporary, this.filename);
      } finally { await unlink(temporary).catch(() => undefined); }
      this.value = updated;
      return this.snapshot();
    });
    this.pending = next.catch(() => undefined);
    return next;
  }
}
