import { parseProcessingRecipe, parseModelFingerprints } from '../processing/recipe.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../storage/current-schema.js';
import type { FolderConfig, FolderEntry, FolderRule } from './folder-types.js';
import { RemoteError } from '../worker/remote-error.js';

/** Config + intake receipts, not a second processing queue. The batch journal
 * owns jobs. Deterministic admission IDs recover a crash between the two commits.
 */
export class FolderStore {
  private readonly db: DatabaseSync;
  private closed = false;
  constructor(filename: string) {
    this.db = openCurrentDatabase(filename, {
      version: 1, tables: ['folder_rules', 'folder_baseline', 'folder_receipts'],
      sql: `
        CREATE TABLE folder_rules (
          id TEXT PRIMARY KEY, config_json TEXT NOT NULL, initialized INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE folder_baseline (
          rule_id TEXT NOT NULL REFERENCES folder_rules(id), path TEXT NOT NULL,
          fingerprint TEXT NOT NULL, PRIMARY KEY(rule_id,path)
        ) STRICT;
        CREATE TABLE folder_receipts (
          rule_id TEXT NOT NULL REFERENCES folder_rules(id), sha256 TEXT NOT NULL,
          job_id TEXT NOT NULL, PRIMARY KEY(rule_id,sha256)
        ) STRICT;
      `,
    }, new RemoteError('WATCH_VERSION'));
  }

  close(): void { if (!this.closed) { this.closed = true; this.db.close(); } }
  list(): FolderRule[] {
    return this.db.prepare('SELECT * FROM folder_rules ORDER BY created_at,rowid').all().map(row => ({
      ...this.parseConfig(JSON.parse(String(row.config_json)) as FolderConfig),
      id: String(row.id), initialized: !!row.initialized, created_at: Number(row.created_at),
    }));
  }
  get(id: string): FolderRule {
    const rule = this.list().find(value => value.id === id);
    if (!rule) throw new RemoteError('UNKNOWN_WATCH');
    return rule;
  }
  add(config: FolderConfig): FolderRule {
    config = this.parseConfig(config);
    if (this.list().length >= 25) throw new RemoteError('WATCH_LIMIT'); // Exercise bound, not entitlement.
    if (this.list().some(rule => rule.source_dir === config.source_dir && rule.output_dir === config.output_dir)) throw new RemoteError('WATCH_EXISTS');
    const id = randomUUID();
    this.db.prepare('INSERT INTO folder_rules(id,config_json,created_at) VALUES(?,?,?)').run(id, JSON.stringify(config), Date.now());
    return this.get(id);
  }
  private parseConfig(config: FolderConfig): FolderConfig {
    if (config?.processing !== undefined) {
      const processing = parseProcessingRecipe(config.processing);
      config = { ...config, processing, processing_models: parseModelFingerprints(config.processing_models, processing) };
    } else if (config?.processing_models !== undefined) throw new RemoteError('INVALID_PROCESSING_MODELS');
    if (!config || !path.isAbsolute(config.source_dir) || !path.isAbsolute(config.output_dir)
      || config.source_dir.includes('\0') || config.output_dir.includes('\0')
      || typeof config.include_existing !== 'boolean' || typeof config.recursive !== 'boolean') {
      throw new RemoteError('INVALID_REQUEST');
    }
    return config;
  }
  initialize(id: string, entries: FolderEntry[]): void {
    if (this.get(id).initialized) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const insert = this.db.prepare('INSERT INTO folder_baseline VALUES(?,?,?)');
      for (const entry of entries) insert.run(id, entry.path, entry.fingerprint);
      this.db.prepare('UPDATE folder_rules SET initialized=1 WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  baseline(id: string): Map<string, string> {
    return new Map(this.db.prepare('SELECT path,fingerprint FROM folder_baseline WHERE rule_id=?').all(id)
      .map(row => [String(row.path), String(row.fingerprint)]));
  }
  seen(id: string, sha256: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM folder_receipts WHERE rule_id=? AND sha256=?').get(id, sha256);
  }
  acknowledge(id: string, sha256: string, jobId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO folder_receipts VALUES(?,?,?)').run(id, sha256, jobId);
  }
  count(id: string): number {
    return Number(this.db.prepare('SELECT count(*) AS n FROM folder_receipts WHERE rule_id=?').get(id)?.n ?? 0);
  }
}
