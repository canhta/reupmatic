import { parseProcessingRecipe, parseModelFingerprints } from '../processing/recipe.js';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../storage/current-schema.js';
import type { BatchJob, BatchJobInput, BatchOutput, BatchState, FileIdentity } from './batch-types.js';
import { RemoteError } from '../worker/remote-error.js';

const MAX_JOBS = 2000; // Bounded integration queue, not a Free/Plus product limit.
const SHA = /^[a-f0-9]{64}$/;
function validFile(value: FileIdentity): boolean {
  return !!value && typeof value.path === 'string' && path.isAbsolute(value.path)
    && value.path.length <= 32768 && !value.path.includes('\0')
    && typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 1024
    && typeof value.sha256 === 'string' && SHA.test(value.sha256);
}
export function validateBatchInput(value: BatchJobInput): void {
  if (value?.processing !== undefined) {
    const recipe = parseProcessingRecipe(value.processing, Boolean(value.subtitle));
    parseModelFingerprints(value.processing_models, recipe);
  } else if (value?.processing_models !== undefined) throw new RemoteError('INVALID_PROCESSING_MODELS');
  if (!value || (value.library_id !== undefined
    && (typeof value.library_id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value.library_id)))
    || !validFile(value.video) || (value.subtitle !== undefined && !validFile(value.subtitle))
    || typeof value.output_dir !== 'string' || !path.isAbsolute(value.output_dir)
    || value.output_dir.includes('\0') || value.output_dir.length > 32768 || value.encoding !== 'review') {
    throw new RemoteError('INVALID_REQUEST');
  }
}

/** One local coordinator owns this journal. Open only after acquiring the app lock.
 * node:sqlite avoids an extra native-addon build; packaged Electron support is a gate.
 * Media and large progress payloads never enter SQLite. No DB on a network share.
 */
export class BatchStore {
  private readonly db: DatabaseSync;
  private closed = false;
  constructor(filename: string) {
    this.db = openCurrentDatabase(filename, {
      version: 1, tables: ['batch_groups', 'batch_jobs'],
      sql: `
        CREATE TABLE batch_groups (
          id TEXT PRIMARY KEY, signature TEXT NOT NULL, created_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE batch_jobs (
          id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batch_groups(id), position INTEGER NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('queued','running','cancelling','interrupted','complete','failed','cancelled')),
          attempt INTEGER NOT NULL DEFAULT 0, input_json TEXT NOT NULL, output_json TEXT,
          error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          UNIQUE(batch_id, position)
        ) STRICT;
        CREATE INDEX batch_jobs_dispatch ON batch_jobs(state, created_at, position);
      `,
    }, new RemoteError('QUEUE_VERSION'));
  }

  close(): void { if (!this.closed) { this.closed = true; this.db.close(); } }
  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private decode(row: Record<string, unknown>): BatchJob {
    const input = JSON.parse(String(row.input_json)) as BatchJobInput;
    validateBatchInput(input);
    return {
      id: String(row.id), batch_id: String(row.batch_id), position: Number(row.position),
      state: String(row.state) as BatchState, attempt: Number(row.attempt), input,
      output: row.output_json ? JSON.parse(String(row.output_json)) as BatchOutput : null,
      error_code: row.error_code ? String(row.error_code) : null,
      created_at: Number(row.created_at), updated_at: Number(row.updated_at),
    };
  }
  list(): BatchJob[] {
    return this.db.prepare('SELECT * FROM batch_jobs ORDER BY created_at, rowid').all().map(row => this.decode(row));
  }
  get(id: string): BatchJob {
    const row = this.db.prepare('SELECT * FROM batch_jobs WHERE id=?').get(id);
    if (!row) throw new RemoteError('UNKNOWN_JOB');
    return this.decode(row);
  }
  findRequest(requestId: string): BatchJob[] {
    return this.db.prepare('SELECT * FROM batch_jobs WHERE batch_id=? ORDER BY position').all(requestId).map(row => this.decode(row));
  }
  enqueue(requestId: string, inputs: BatchJobInput[]): BatchJob[] {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId)
      || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) throw new RemoteError('INVALID_REQUEST');
    inputs.forEach(validateBatchInput);
    // Canonicalize known fields: an acknowledgement retry does not create another batch.
    const snapshots = inputs.map(input => ({
      video: { path: input.video.path, sha256: input.video.sha256, name: input.video.name },
      ...(input.subtitle ? { subtitle: { path: input.subtitle.path, sha256: input.subtitle.sha256, name: input.subtitle.name } } : {}),
      output_dir: input.output_dir, encoding: input.encoding,
      ...(input.library_id ? { library_id: input.library_id } : {}),
      ...(input.processing ? { processing: parseProcessingRecipe(input.processing),
        processing_models: parseModelFingerprints(input.processing_models, input.processing) } : {}),
    }));
    const signature = createHash('sha256').update(JSON.stringify(snapshots)).digest('hex');
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT signature FROM batch_groups WHERE id=?').get(requestId);
      if (existing) {
        if (existing.signature !== signature) throw new RemoteError('DUPLICATE_REQUEST');
        return this.db.prepare('SELECT * FROM batch_jobs WHERE batch_id=? ORDER BY position').all(requestId).map(row => this.decode(row));
      }
      const count = Number(this.db.prepare('SELECT count(*) AS n FROM batch_jobs').get()?.n);
      if (count + snapshots.length > MAX_JOBS) throw new RemoteError('QUEUE_FULL');
      const now = Date.now();
      this.db.prepare('INSERT INTO batch_groups VALUES (?, ?, ?)').run(requestId, signature, now);
      const insert = this.db.prepare(`INSERT INTO batch_jobs
        (id,batch_id,position,state,attempt,input_json,created_at,updated_at) VALUES (?,?,?,'queued',0,?,?,?)`);
      snapshots.forEach((input, position) => insert.run(randomUUID(), requestId, position, JSON.stringify(input), now, now));
      return this.db.prepare('SELECT * FROM batch_jobs WHERE batch_id=? ORDER BY position').all(requestId).map(row => this.decode(row));
    });
  }
  recover(): number {
    return this.transaction(() => {
      const now = Date.now();
      const interrupted = this.db.prepare("UPDATE batch_jobs SET state='interrupted',error_code='INTERRUPTED',updated_at=? WHERE state='running'").run(now);
      const cancelled = this.db.prepare("UPDATE batch_jobs SET state='cancelled',error_code='CANCELLED',updated_at=? WHERE state='cancelling'").run(now);
      return Number(interrupted.changes) + Number(cancelled.changes);
    });
  }
  claim(): BatchJob | null {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT id FROM batch_jobs WHERE state='queued' ORDER BY created_at,rowid LIMIT 1").get();
      if (!row) return null;
      this.db.prepare("UPDATE batch_jobs SET state='running',attempt=attempt+1,error_code=NULL,updated_at=? WHERE id=? AND state='queued'").run(Date.now(), row.id!);
      return this.get(String(row.id));
    });
  }
  finish(id: string, state: 'complete' | 'failed' | 'cancelled' | 'interrupted', error: string | null = null, output: BatchOutput | null = null): void {
    if (state === 'complete' && (!output || !SHA.test(output.sha256) || !path.isAbsolute(output.path))) throw new RemoteError('INVALID_WORKER_RESPONSE');
    const result = this.db.prepare(`UPDATE batch_jobs SET state=?,error_code=?,output_json=?,updated_at=?
      WHERE id=? AND state IN ('running','cancelling')`).run(state, error, output ? JSON.stringify(output) : null, Date.now(), id);
    if (!result.changes) throw new RemoteError('JOB_STATE');
  }
  cancel(id: string): BatchJob {
    const job = this.get(id);
    if (job.state === 'queued' || job.state === 'interrupted') {
      this.db.prepare("UPDATE batch_jobs SET state='cancelled',error_code='CANCELLED',updated_at=? WHERE id=?").run(Date.now(), id);
    } else if (job.state === 'running') {
      this.db.prepare("UPDATE batch_jobs SET state='cancelling',updated_at=? WHERE id=?").run(Date.now(), id);
    }
    return this.get(id);
  }
  retry(id: string): void {
    const result = this.db.prepare(`UPDATE batch_jobs SET state='queued',error_code=NULL,updated_at=?
      WHERE id=? AND state IN ('failed','cancelled','interrupted')`).run(Date.now(), id);
    if (!result.changes) throw new RemoteError('JOB_STATE');
  }
}
