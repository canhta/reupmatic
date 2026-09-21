import { readFile, writeFile } from 'node:fs/promises';
import {
  parseRecentEntries,
  type RecentEntry,
  withRecentEntry,
} from '../../../core/projects/recent.js';

export class RecentStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<RecentEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return parseRecentEntries(JSON.parse(raw));
    } catch {
      // Missing or corrupt file: start empty rather than fail the switcher.
      return [];
    }
  }

  async record(entry: RecentEntry): Promise<RecentEntry[]> {
    const next = withRecentEntry(await this.list(), entry);
    await writeFile(this.filePath, JSON.stringify(next), 'utf8');
    return next;
  }
}
