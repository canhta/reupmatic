import { Buffer } from 'node:buffer';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../../storage/current-schema.js';
import { parseProject, type ProjectFile } from '../project.js';
import type { RecoverySummary } from './recovery-types.js';

const MAX_DRAFTS = 100;
const MAX_BYTES = 2 * 1024 * 1024;
const SQL = `CREATE TABLE editor_drafts (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL, document TEXT NOT NULL
);`;

function identity(id: string, revision: number): void {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(id) || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('INVALID_RECOVERY');
  }
}

export class RecoveryStore {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = openCurrentDatabase(filename, { version: 1, tables: ['editor_drafts'], sql: SQL },
      new Error('RECOVERY_VERSION'));
  }

  list(): RecoverySummary[] {
    return this.db.prepare('SELECT * FROM editor_drafts ORDER BY updated_at DESC, id').all().map(row => {
      let source_name = '', cue_count = 0, error: string | null = null;
      try {
        const project = parseProject(JSON.parse(String(row.document)));
        source_name = path.basename(project.source.path);
        cue_count = project.cues.length;
      } catch { error = 'RECOVERY_CORRUPT'; }
      return { id: String(row.id), revision: Number(row.revision), updated_at: Number(row.updated_at),
        source_name, cue_count, error };
    });
  }

  load(id: string, revision: number): ProjectFile {
    identity(id, revision);
    const row = this.db.prepare('SELECT * FROM editor_drafts WHERE id=?').get(id);
    if (!row) throw new Error('RECOVERY_MISSING');
    if (row.revision !== revision) throw new Error('RECOVERY_CONFLICT');
    try { return parseProject(JSON.parse(String(row.document))); }
    catch { throw new Error('RECOVERY_CORRUPT'); }
  }

  save(id: string, expectedRevision: number, input: ProjectFile): { revision: number; updated_at: number } {
    identity(id, expectedRevision);
    const project = parseProject(input);
    const document = JSON.stringify(project);
    if (Buffer.byteLength(document) > MAX_BYTES) throw new Error('PROJECT_TOO_LARGE');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT revision, source_sha256 FROM editor_drafts WHERE id=?').get(id);
      if ((row ? Number(row.revision) : 0) !== expectedRevision) throw new Error('RECOVERY_CONFLICT');
      if (row && row.source_sha256 !== project.source.sha256) throw new Error('RECOVERY_SOURCE_CONFLICT');
      if (!row && Number(this.db.prepare('SELECT count(*) AS count FROM editor_drafts').get()?.count) >= MAX_DRAFTS) {
        throw new Error('RECOVERY_LIMIT');
      }
      const revision = expectedRevision + 1, updated_at = Date.now();
      this.db.prepare(`INSERT INTO editor_drafts VALUES(?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, updated_at=excluded.updated_at,
        document=excluded.document`).run(id, revision, updated_at, project.source.sha256, document);
      this.db.exec('COMMIT');
      return { revision, updated_at };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  discard(id: string, expectedRevision: number): void {
    identity(id, expectedRevision);
    const result = this.db.prepare('DELETE FROM editor_drafts WHERE id=? AND revision=?').run(id, expectedRevision);
    if (result.changes !== 1) throw new Error('RECOVERY_CONFLICT');
  }

  close(): void { this.db.close(); }
}
