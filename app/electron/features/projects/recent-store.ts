import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import {
  parseRecentEntries,
  type RecentEntry,
  withRecentEntry,
} from '../../../core/projects/recent.js';

export class RecentStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  /** Serialises read-modify-write so two records never lose one another. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async list(): Promise<RecentEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return parseRecentEntries(JSON.parse(raw));
    } catch {
      // Missing or corrupt file: start empty rather than fail the switcher.
      return [];
    }
  }

  record(entry: RecentEntry): Promise<RecentEntry[]> {
    return this.enqueue(async () => {
      const next = withRecentEntry(await this.list(), entry);
      await this.write(next);
      return next;
    });
  }

  remove(id: string): Promise<RecentEntry[]> {
    return this.enqueue(async () => {
      const next = (await this.list()).filter((item) => item.id !== id);
      await this.write(next);
      return next;
    });
  }

  /** Write beside the target and rename, so a crash never leaves a half-written list. */
  private async write(entries: RecentEntry[]): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(entries), { encoding: 'utf8', mode: 0o644 });
      await rename(temporary, this.filePath);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}
