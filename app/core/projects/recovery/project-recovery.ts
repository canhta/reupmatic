import { Buffer } from 'node:buffer';
import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../../storage/current-schema.js';
import { type ProjectFile, parseProject } from '../project.js';
import type { RecoverySummary } from './recovery-contracts.js';

const MAX_DRAFTS = 100;
const MAX_BYTES = 2 * 1024 * 1024;
const COLUMNS = ['id', 'revision', 'updated_at', 'source_sha256', 'project_path', 'document'];
const SQL = `CREATE TABLE editor_drafts (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL, project_path TEXT, document TEXT NOT NULL
);`;

export interface RecoverySaveOptions {
  project_path?: string | null;
  /** A draft this save supersedes and drops in the same transaction. */
  source_id?: string | null;
}

function identity(id: string, revision: number): void {
  if (
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(id) ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    throw new Error('INVALID_RECOVERY');
  }
}

export class ProjectRecovery {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = openCurrentDatabase(
      filename,
      { tables: ['editor_drafts'], sql: SQL },
      new Error('RECOVERY_VERSION'),
    );
    const columns = this.db
      .prepare("SELECT name FROM pragma_table_info('editor_drafts') ORDER BY cid")
      .all()
      .map((row) => String(row.name));
    if (columns.length !== COLUMNS.length || columns.some((name, i) => name !== COLUMNS[i])) {
      this.db.close();
      throw new Error('RECOVERY_VERSION');
    }
  }

  list(): RecoverySummary[] {
    return this.db
      .prepare('SELECT * FROM editor_drafts ORDER BY updated_at DESC, id')
      .all()
      .map((row) => {
        let source_name = '',
          cue_count = 0,
          error: string | null = null;
        try {
          const project = parseProject(JSON.parse(String(row.document)));
          source_name = project.name;
          cue_count = project.cues.length;
        } catch {
          error = 'RECOVERY_CORRUPT';
        }
        return {
          id: String(row.id),
          revision: Number(row.revision),
          updated_at: Number(row.updated_at),
          source_name,
          cue_count,
          error,
        };
      });
  }

  load(id: string, revision: number): ProjectFile {
    identity(id, revision);
    const row = this.db.prepare('SELECT * FROM editor_drafts WHERE id=?').get(id);
    if (!row) throw new Error('RECOVERY_MISSING');
    if (row.revision !== revision) throw new Error('RECOVERY_CONFLICT');
    try {
      return parseProject(JSON.parse(String(row.document)));
    } catch {
      throw new Error('RECOVERY_CORRUPT');
    }
  }

  save(
    id: string,
    expectedRevision: number,
    input: ProjectFile,
    options: RecoverySaveOptions = {},
  ): { revision: number; updated_at: number } {
    identity(id, expectedRevision);
    const project = parseProject(input);
    const document = JSON.stringify(project);
    if (Buffer.byteLength(document) > MAX_BYTES) throw new Error('PROJECT_TOO_LARGE');
    const projectPath = options.project_path ?? null;
    if (
      projectPath !== null &&
      (typeof projectPath !== 'string' ||
        !projectPath ||
        projectPath.length > 4096 ||
        projectPath.includes('\0'))
    ) {
      throw new Error('INVALID_RECOVERY');
    }
    const sourceId = options.source_id ?? null;
    if (sourceId !== null) identity(sourceId, expectedRevision);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db
        .prepare('SELECT revision, source_sha256 FROM editor_drafts WHERE id=?')
        .get(id);
      if ((row ? Number(row.revision) : 0) !== expectedRevision)
        throw new Error('RECOVERY_CONFLICT');
      if (row && row.source_sha256 !== project.source.sha256)
        throw new Error('RECOVERY_SOURCE_CONFLICT');
      if (!row) {
        const count = Number(
          this.db.prepare('SELECT count(*) AS count FROM editor_drafts').get()?.count,
        );
        // At the cap, evict the oldest drafts instead of refusing the new one.
        if (count >= MAX_DRAFTS) {
          this.db
            .prepare(
              `DELETE FROM editor_drafts WHERE id IN (
                SELECT id FROM editor_drafts ORDER BY updated_at ASC, id ASC LIMIT ?
              )`,
            )
            .run(count - MAX_DRAFTS + 1);
        }
      }
      const revision = expectedRevision + 1,
        updated_at = Date.now();
      this.db
        .prepare(`INSERT INTO editor_drafts(id, revision, updated_at, source_sha256, project_path, document)
          VALUES(?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, updated_at=excluded.updated_at,
          project_path=excluded.project_path, document=excluded.document`)
        .run(id, revision, updated_at, project.source.sha256, projectPath, document);
      // The superseded draft dies with the save that carried its work forward.
      if (sourceId && sourceId !== id)
        this.db.prepare('DELETE FROM editor_drafts WHERE id=?').run(sourceId);
      this.db.exec('COMMIT');
      return { revision, updated_at };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** The project file path recorded with a draft, or null when it was never saved. */
  projectPath(id: string, revision: number): string | null {
    identity(id, revision);
    const row = this.db
      .prepare('SELECT revision, project_path FROM editor_drafts WHERE id=?')
      .get(id);
    if (!row) throw new Error('RECOVERY_MISSING');
    if (Number(row.revision) !== revision) throw new Error('RECOVERY_CONFLICT');
    return typeof row.project_path === 'string' && row.project_path ? row.project_path : null;
  }

  discard(id: string, expectedRevision: number): void {
    identity(id, expectedRevision);
    const result = this.db
      .prepare('DELETE FROM editor_drafts WHERE id=? AND revision=?')
      .run(id, expectedRevision);
    if (result.changes !== 1) throw new Error('RECOVERY_CONFLICT');
  }

  close(): void {
    this.db.close();
  }
}
