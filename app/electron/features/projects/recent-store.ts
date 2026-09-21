import { readFile, writeFile } from 'node:fs/promises';
import {
  parseRecentEntries,
  type RecentEntry,
  withRecentEntry,
} from '../../../core/projects/recent.js';

/**
 * A small JSON file, not SQLite: at most 8 entries, no querying beyond "the whole list, newest
 * first" — the same proportionate-persistence call the recovery store's own SQLite makes for a
 * genuinely relational need this file never has.
 */
export class RecentStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<RecentEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return parseRecentEntries(JSON.parse(raw));
    } catch {
      // Missing file (first run) or a corrupt/foreign one — a convenience list starts empty
      // rather than failing the switcher that reads it.
      return [];
    }
  }

  async record(entry: RecentEntry): Promise<RecentEntry[]> {
    const next = withRecentEntry(await this.list(), entry);
    await writeFile(this.filePath, JSON.stringify(next), 'utf8');
    return next;
  }
}
