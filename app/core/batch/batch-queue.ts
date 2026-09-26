import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { hashFile } from '../media/files.js';
import type { RenderCoordinator } from '../rendering/render-coordinator.js';
import { RemoteError } from '../worker/remote-error.js';
import type { Envelope, Ticket, WorkerClient } from '../worker/worker-client.js';
import type { BatchJob, BatchJobInput, BatchSnapshot } from './batch-contracts.js';
import { outputFilename, publishBatchOutput } from './batch-output.js';
import { BatchStore } from './batch-store.js';

type WorkerPort = Pick<WorkerClient, 'request'>;
type RenderPort = Pick<RenderCoordinator, 'start' | 'activeCount' | 'on' | 'off'>;
export interface BatchQueueOptions {
  databasePath: string;
  protectSource?(filename: string): void;
}
interface Active {
  job: BatchJob;
  cancelRequested: boolean;
  step?: Pick<Ticket<unknown>, 'id' | 'cancel'>;
  progress: { phase: string; fraction: number | null };
  done?: Promise<void>;
}
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,80}$/;
function code(error: unknown): string {
  const value = error instanceof RemoteError ? error.code : (error as NodeJS.ErrnoException)?.code;
  return typeof value === 'string' && SAFE_CODE.test(value) ? value : 'BATCH_FAILED';
}

export class BatchQueue extends EventEmitter {
  private readonly store: BatchStore;
  private readonly worker: WorkerPort;
  private readonly renderer: RenderPort;
  private readonly options: BatchQueueOptions;
  private paused = true;
  private closing = false;
  private scheduled = false;
  private active?: Active;
  private version = 0;
  private fault: string | null = null;
  readonly recovered: number;

  constructor(worker: WorkerPort, renderer: RenderPort, options: BatchQueueOptions) {
    super();
    this.store = new BatchStore(options.databasePath);
    this.worker = worker;
    this.renderer = renderer;
    this.options = options;
    try {
      this.recovered = this.store.recover();
      for (const job of this.store.list()) this.protect(job.input);
      renderer.on('job', this.onProgress);
      renderer.on('idle', this.wake);
    } catch (error) {
      this.store.close();
      throw error;
    }
  }
  get activeCount(): number {
    return this.store
      .list()
      .filter((job) => ['queued', 'running', 'cancelling', 'interrupted'].includes(job.state))
      .length;
  }
  get(id: string): BatchJob {
    return this.store.get(id);
  }
  snapshot(): BatchSnapshot {
    return {
      version: this.version,
      paused: this.paused,
      active_id: this.active?.job.id ?? null,
      recovered: this.recovered,
      fault: this.fault,
      items: this.store.list().map((job) => ({
        id: job.id,
        batch_id: job.batch_id,
        name: job.input.video.name,
        ...(job.input.processing ? { processing: job.input.processing } : {}),
        subtitle_name: job.input.subtitle?.name ?? null,
        state: job.state,
        attempt: job.attempt,
        error_code: job.error_code,
        output_name: job.output ? path.basename(job.output.path) : null,
        progress: this.active?.job.id === job.id ? this.active.progress : null,
      })),
    };
  }
  enqueue(requestId: string, inputs: BatchJobInput[]): BatchSnapshot {
    if (this.closing) throw new RemoteError('QUEUE_CLOSED');
    for (const job of this.store.enqueue(requestId, inputs)) this.protect(job.input);
    this.changed();
    this.wake();
    return this.snapshot();
  }
  // Only the trusted folder service calls this; a renamed duplicate cannot create a new job.
  admitFolder(requestId: string, input: BatchJobInput): string {
    if (this.closing) throw new RemoteError('QUEUE_CLOSED');
    if (!/^watch_[a-f0-9]{64}$/.test(requestId)) throw new RemoteError('INVALID_REQUEST');
    const existing = this.store.findRequest(requestId);
    if (existing.length) {
      const saved = existing[0];
      if (
        saved.input.video.sha256 !== input.video.sha256 ||
        saved.input.output_dir !== input.output_dir ||
        saved.input.encoding !== input.encoding ||
        saved.input.subtitle ||
        JSON.stringify(saved.input.processing) !== JSON.stringify(input.processing) ||
        JSON.stringify(saved.input.processing_models) !== JSON.stringify(input.processing_models)
      )
        throw new RemoteError('DUPLICATE_REQUEST');
      return saved.id;
    }
    const job = this.store.enqueue(requestId, [input])[0];
    this.protect(job.input);
    this.changed();
    this.wake();
    return job.id;
  }
  outputPaths(): string[] {
    return this.store
      .list()
      .map((job) => path.join(job.input.output_dir, outputFilename(job.input.video.name, job.id)));
  }
  private protect(input: BatchJobInput): void {
    this.options.protectSource?.(input.video.path);
    if (input.subtitle) this.options.protectSource?.(input.subtitle.path);
  }
  pause(): BatchSnapshot {
    this.paused = true;
    this.changed();
    return this.snapshot();
  }
  resume(): BatchSnapshot {
    if (this.closing) throw new RemoteError('QUEUE_CLOSED');
    this.fault = null;
    this.paused = false;
    this.changed();
    this.wake();
    return this.snapshot();
  }
  retry(id: string): BatchSnapshot {
    if (this.closing) throw new RemoteError('QUEUE_CLOSED');
    this.store.retry(id);
    this.changed();
    this.wake();
    return this.snapshot();
  }
  async cancel(id: string): Promise<BatchSnapshot> {
    if (this.closing) throw new RemoteError('QUEUE_CLOSED');
    this.store.cancel(id);
    if (this.active?.job.id === id) {
      this.active.cancelRequested = true;
      // Persist the request before acknowledging; completion decides whether it actually stopped.
      void this.active.step?.cancel().catch(() => undefined);
    }
    this.changed();
    return this.snapshot();
  }
  /** Host must stop/reap worker BEFORE close(). */
  beginClose(): void {
    this.closing = true;
    this.paused = true;
    void this.active?.step?.cancel().catch(() => undefined);
    this.changed();
  }
  async close(): Promise<void> {
    try {
      await this.active?.done;
    } finally {
      this.renderer.off('job', this.onProgress);
      this.renderer.off('idle', this.wake);
      this.store.close();
    }
  }
  private changed(): void {
    this.version++;
    this.emit('changed', this.snapshot());
  }
  private readonly onProgress = (event: Envelope): void => {
    if (event.event !== 'progress' || event.id !== this.active?.step?.id || !this.active) return;
    const phase =
      typeof event.data.phase === 'string' &&
      [
        'queued',
        'running',
        'rendering',
        'processingModels',
        'processingOcr',
        'processingInpaint',
        'processingJoining',
        'processingEncoding',
        'processingVerifying',
      ].includes(event.data.phase)
        ? event.data.phase
        : 'running';
    const fraction =
      typeof event.data.fraction === 'number' && Number.isFinite(event.data.fraction)
        ? Math.min(1, Math.max(0, event.data.fraction))
        : null;
    this.active.progress = { phase, fraction };
    this.changed();
  };
  private readonly wake = (): void => {
    if (this.scheduled || this.closing || this.paused || this.active) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      if (this.closing || this.paused || this.active || this.renderer.activeCount > 0) return;
      try {
        const job = this.store.claim();
        if (!job) {
          this.changed();
          return;
        }
        const active: Active = {
          job,
          cancelRequested: false,
          progress: { phase: 'preparing', fraction: null },
        };
        this.active = active;
        this.changed();
        active.done = this.execute(active);
        void active.done.catch((error) => {
          this.fault = code(error);
          this.paused = true;
          this.emit('fault', this.fault);
          try {
            this.changed();
          } catch {
            // Preserve the journal for diagnosis.
          }
        });
      } catch (error) {
        this.fault = code(error);
        this.paused = true;
        this.changed();
      }
    });
  };
  private checkActive(active: Active): void {
    if (active.cancelRequested) throw new RemoteError('CANCELLED');
    if (this.closing) throw new RemoteError('INTERRUPTED');
  }
  private async register(
    active: Active,
    kind: 'video' | 'subtitle',
    identity: { path: string; sha256: string },
  ) {
    this.checkActive(active);
    const ticket = this.worker.request('asset.register', { path: identity.path, kind });
    active.step = ticket;
    const result = await ticket.result;
    this.checkActive(active);
    if (result.sha256 !== identity.sha256) throw new RemoteError('SOURCE_CHANGED');
    return result.asset_id;
  }
  private async execute(active: Active): Promise<void> {
    const { job } = active;
    try {
      const videoId = await this.register(active, 'video', job.input.video);
      const subtitleId = job.input.subtitle
        ? await this.register(active, 'subtitle', job.input.subtitle)
        : undefined;
      this.checkActive(active);
      const ticket = this.renderer.start(
        {
          request_id: randomUUID(),
          asset_id: videoId,
          cues: [],
          revision: job.attempt,
          encoding: job.input.encoding,
          ...(job.input.processing ? { processing: job.input.processing } : {}),
        },
        subtitleId,
        job.input.processing_models,
      );
      active.step = ticket;
      active.progress = { phase: 'rendering', fraction: null };
      this.changed();
      const rendered = await ticket.result;
      this.checkActive(active);
      active.step = undefined;
      active.progress = { phase: 'exporting', fraction: null };
      this.changed();
      const digest = await hashFile(rendered.path);
      if (rendered.sha256 !== digest) throw new RemoteError('OUTPUT_CHANGED');
      const destination = await publishBatchOutput(
        rendered.path,
        job.input.output_dir,
        outputFilename(job.input.video.name, job.id),
        digest,
        () => this.checkActive(active),
      );
      this.store.finish(job.id, 'complete', null, {
        path: destination,
        sha256: digest,
        duration_ms: rendered.duration_ms,
        cache_hit: rendered.cache_hit,
      });
    } catch (error) {
      const reason = active.cancelRequested
        ? 'CANCELLED'
        : this.closing
          ? 'INTERRUPTED'
          : code(error);
      this.store.finish(
        job.id,
        reason === 'CANCELLED' ? 'cancelled' : reason === 'INTERRUPTED' ? 'interrupted' : 'failed',
        reason,
      );
      if (['WORKER_EXITED', 'WORKER_START_FAILED', 'INVALID_WORKER_RESPONSE'].includes(reason)) {
        this.fault = reason;
        this.paused = true;
      }
    } finally {
      this.active = undefined;
      this.changed();
      this.wake();
    }
  }
}
