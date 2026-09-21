import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { parseDiagnosticLine } from '../diagnostics/diagnostic-record.js';
import { type DiagnosticRecorder, silentRecorder } from '../diagnostics/recorder.js';
import { workerErrorCode } from './error-codes.js';
import { type OperationName, type OperationResult, operations } from './operations.js';
import { RemoteError } from './remote-error.js';

export interface Envelope {
  v: 1;
  id: string;
  revision: number;
  event: 'progress' | 'result' | 'error';
  data: Record<string, unknown>;
}
export interface Ticket<T> {
  id: string;
  result: Promise<T>;
  cancel(): Promise<{ requested: boolean }>;
}
interface Pending {
  method: OperationName;
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  revision: number;
}

/** Node-only adapter, reused by Electron and the integration batch harness.
 * It is not a durable workflow scheduler; accepted jobs do not survive host exit.
 */
export class WorkerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, Pending>();
  private closed = false;
  private exited = false;
  private diagnostics: DiagnosticRecorder;
  constructor(
    python: string,
    workerPath: string,
    workspace: string,
    // D-61: the worker's structured stderr records are forwarded here, and every rejection this
    // client decides a code for leaves one of its own.
    diagnostics: DiagnosticRecorder = silentRecorder,
  ) {
    super();
    this.diagnostics = diagnostics;
    this.child = spawn(python, ['-u', workerPath, '--workspace', workspace], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      if (Buffer.byteLength(line, 'utf8') > 16 * 1024 * 1024) {
        this.fail(new RemoteError('INVALID_WORKER_RESPONSE'));
        this.child.kill();
        return;
      }
      try {
        const msg = JSON.parse(line) as Envelope;
        if (
          msg.v !== 1 ||
          typeof msg.id !== 'string' ||
          !Number.isInteger(msg.revision) ||
          !['progress', 'result', 'error'].includes(msg.event) ||
          !msg.data ||
          typeof msg.data !== 'object'
        )
          throw new Error('protocol');
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        if (msg.revision !== pending.revision) throw new Error('revision');
        this.emit('message', msg);
        if (msg.event === 'progress') return;
        this.pending.delete(msg.id);
        if (msg.event === 'error') {
          pending.reject(this.rejection(workerErrorCode(msg.data), pending, msg.id));
          return;
        }
        try {
          pending.resolve(operations[pending.method].validate(msg.data));
        } catch (error) {
          const code = error instanceof RemoteError ? error.code : 'INVALID_WORKER_RESPONSE';
          pending.reject(this.rejection(code, pending, msg.id));
        }
      } catch {
        this.fail(new RemoteError('INVALID_WORKER_RESPONSE'));
        this.child.kill();
      }
    });
    // Raw stderr never reaches the renderer, the protocol or the Diagnostic log: each line is
    // parsed and validated as a Diagnostic record first, and a malformed one is dropped without
    // disturbing the stream (D-61).
    createInterface({ input: this.child.stderr }).on('line', (line) => {
      const record = parseDiagnosticLine(line);
      if (record) this.diagnostics.record(record);
    });
    this.child.stdin.on('error', () => this.fail(new RemoteError('WORKER_EXITED')));
    this.child.on('error', () => this.fail(new RemoteError('WORKER_START_FAILED')));
    this.child.on('exit', () => {
      this.exited = true;
      this.fail(new RemoteError('WORKER_EXITED'));
    });
  }
  request<M extends OperationName>(
    method: M,
    params: Record<string, unknown>,
    revision = 0,
  ): Ticket<OperationResult<M>> {
    const id = randomUUID();
    const result = new Promise<OperationResult<M>>((resolve, reject) => {
      if (this.closed || this.exited) {
        reject(new RemoteError('WORKER_EXITED'));
        return;
      }
      const payload = `${JSON.stringify({ v: 1, id, revision, method, params })}\n`;
      if (Buffer.byteLength(payload, 'utf8') > 2 * 1024 * 1024) {
        reject(new RemoteError('PAYLOAD_TOO_LARGE'));
        return;
      }
      // The pending table is type-erased across requests of differing result types; each
      // resolver is only ever invoked with this request's own worker response, validated
      // against its own method's registry entry (see the message handler).
      this.pending.set(id, {
        method,
        resolve: resolve as (data: unknown) => void,
        reject,
        revision,
      });
      this.child.stdin.write(payload, 'utf8', (error) => {
        if (error) {
          this.pending.delete(id);
          reject(new RemoteError('WORKER_EXITED'));
        }
      });
    });
    return {
      id,
      result,
      cancel: () => this.request('cancel', { request_id: id }).result,
    };
  }
  /** Every coded rejection this client decides owes a record, at the boundary that decides it. */
  private rejection(code: string, pending: Pending, job: string): RemoteError {
    this.diagnostics.record({
      level: 'error',
      source: { process: 'core', module: 'worker' },
      event: 'worker.request-failed',
      code,
      correlation: { job },
      detail: { method: pending.method },
    });
    return new RemoteError(code);
  }
  private fail(error: Error): void {
    for (const [id, pending] of this.pending)
      pending.reject(
        error instanceof RemoteError ? this.rejection(error.code, pending, id) : error,
      );
    this.pending.clear();
  }
  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end(); // EOF asks worker to cancel bounded work and reap FFmpeg.
    if (this.exited) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill();
        resolve();
      }, 15000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
