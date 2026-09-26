import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import path from 'node:path';
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

/** Node-only adapter; accepted jobs do not survive host exit. */
export class WorkerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, Pending>();
  private closed = false;
  private exited = false;
  private started = false;
  private diagnostics: DiagnosticRecorder;
  private readonly launch: () => ChildProcessWithoutNullStreams;
  constructor(
    python: string,
    workerPath: string,
    workspace: string,
    diagnostics: DiagnosticRecorder = silentRecorder,
    pythonPath: readonly string[] = [],
  ) {
    super();
    this.diagnostics = diagnostics;
    const searchPath = [...pythonPath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    this.launch = () =>
      spawn(python, ['-u', workerPath, '--workspace', workspace], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          ...(searchPath ? { PYTHONPATH: searchPath } : {}),
        },
      });
    this.child = this.attach(this.launch());
  }

  /** Wires one child's streams; a crashed child is replaced by the next request. */
  private attach(child: ChildProcessWithoutNullStreams): ChildProcessWithoutNullStreams {
    this.exited = false;
    this.started = false;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (Buffer.byteLength(line, 'utf8') > 16 * 1024 * 1024) {
        this.fail(child, new RemoteError('INVALID_WORKER_RESPONSE'));
        child.kill();
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
        if (this.child === child) this.started = true;
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
        this.fail(child, new RemoteError('INVALID_WORKER_RESPONSE'));
        child.kill();
      }
    });
    // Raw stderr never reaches the renderer; each line is validated as a Diagnostic first.
    createInterface({ input: child.stderr }).on('line', (line) => {
      const record = parseDiagnosticLine(line);
      if (record) this.diagnostics.record(record);
    });
    child.stdin.on('error', () => this.fail(child, new RemoteError('WORKER_EXITED')));
    child.on('error', () => this.fail(child, new RemoteError('WORKER_START_FAILED')));
    child.on('exit', () => {
      if (this.child !== child) return;
      this.exited = true;
      this.fail(child, new RemoteError('WORKER_EXITED'));
      this.emit('exit');
    });
    return child;
  }

  /** A worker that died after starting is replaced on the next request. */
  private respawn(): RemoteError | null {
    if (!this.exited) return null;
    // A child that never answered was broken on import, not crashed; respawning it per request
    // would spawn-storm the status polls. Fail until the app restarts.
    if (!this.started) return new RemoteError('WORKER_EXITED');
    try {
      this.child = this.attach(this.launch());
    } catch {
      return new RemoteError('WORKER_START_FAILED');
    }
    this.diagnostics.record({
      level: 'warn',
      source: { process: 'core', module: 'worker' },
      event: 'worker.restarted',
    });
    return null;
  }
  request<M extends OperationName>(
    method: M,
    params: Record<string, unknown>,
    revision = 0,
  ): Ticket<OperationResult<M>> {
    const id = randomUUID();
    const result = new Promise<OperationResult<M>>((resolve, reject) => {
      if (this.closed) {
        reject(new RemoteError('WORKER_EXITED'));
        return;
      }
      const restartFailure = this.respawn();
      if (restartFailure) {
        reject(restartFailure);
        return;
      }
      const payload = `${JSON.stringify({ v: 1, id, revision, method, params })}\n`;
      if (Buffer.byteLength(payload, 'utf8') > 2 * 1024 * 1024) {
        reject(new RemoteError('PAYLOAD_TOO_LARGE'));
        return;
      }
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
  /** Every coded rejection this client decides owes a record. */
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
  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (child !== this.child) return;
    for (const [id, pending] of this.pending)
      pending.reject(
        error instanceof RemoteError ? this.rejection(error.code, pending, id) : error,
      );
    this.pending.clear();
  }
  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end(); // EOF asks the worker to cancel bounded work and reap FFmpeg.
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
