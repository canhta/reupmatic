import { RemoteError } from './remote-error.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

export interface Envelope {
  v: 1; id: string; revision: number;
  event: 'progress' | 'result' | 'error'; data: Record<string, unknown>;
}
export interface Ticket<T> { id: string; result: Promise<T>; cancel(): Promise<{requested: boolean}>; }
interface Pending { resolve: (data: any) => void; reject: (err: Error) => void; revision: number; }

/** Node-only adapter, reused by Electron and the integration batch harness.
 * It is not a durable workflow scheduler; accepted jobs do not survive host exit.
 */
export class WorkerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, Pending>();
  private closed = false;
  private exited = false;
  constructor(python: string, workerPath: string, workspace: string) {
    super();
    this.child = spawn(python, ['-u', workerPath, '--workspace', workspace], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      if (Buffer.byteLength(line, 'utf8') > 16 * 1024 * 1024) {
        this.fail(new RemoteError('INVALID_WORKER_RESPONSE')); this.child.kill(); return;
      }
      try {
        const msg = JSON.parse(line) as Envelope;
        if (msg.v !== 1 || typeof msg.id !== 'string' || !Number.isInteger(msg.revision)
          || !['progress', 'result', 'error'].includes(msg.event) || !msg.data || typeof msg.data !== 'object')
          throw new Error('protocol');
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        if (msg.revision !== pending.revision) throw new Error('revision');
        this.emit('message', msg);
        if (msg.event === 'progress') return;
        this.pending.delete(msg.id);
        if (msg.event === 'error') pending.reject(new RemoteError(String(msg.data.code || 'WORKER_FAILURE')));
        else pending.resolve(msg.data);
      } catch { this.fail(new RemoteError('INVALID_WORKER_RESPONSE')); this.child.kill(); }
    });
    // Never forward raw stderr into the renderer or protocol. Production diagnostics
    // need a reviewed, redacted sink; count bytes only for this exercise.
    this.child.stderr.on('data', (data: Buffer) => this.emit('diagnostic-bytes', data.length));
    this.child.stdin.on('error', () => this.fail(new RemoteError('WORKER_EXITED')));
    this.child.on('error', () => this.fail(new RemoteError('WORKER_START_FAILED')));
    this.child.on('exit', () => { this.exited = true; this.fail(new RemoteError('WORKER_EXITED')); });
  }
  request<T = Record<string, unknown>>(method: string, params: Record<string, unknown>, revision = 0): Ticket<T> {
    const id = randomUUID();
    const result = new Promise<T>((resolve, reject) => {
      if (this.closed || this.exited) { reject(new RemoteError('WORKER_EXITED')); return; }
      const payload = JSON.stringify({ v: 1, id, revision, method, params }) + '\n';
      if (Buffer.byteLength(payload, 'utf8') > 2 * 1024 * 1024) { reject(new RemoteError('PAYLOAD_TOO_LARGE')); return; }
      this.pending.set(id, { resolve, reject, revision });
      this.child.stdin.write(payload, 'utf8', (error) => {
        if (error) { this.pending.delete(id); reject(new RemoteError('WORKER_EXITED')); }
      });
    });
    return { id, result, cancel: () => this.request<{requested: boolean}>('cancel', { request_id: id }).result };
  }
  private fail(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end(); // EOF asks worker to cancel bounded work and reap FFmpeg.
    if (this.exited) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { this.child.kill(); resolve(); }, 15000);
      this.child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
