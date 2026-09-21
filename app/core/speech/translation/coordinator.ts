import { EventEmitter } from 'node:events';
import { RemoteError } from '../../worker/remote-error.js';
import type { Envelope, Ticket, WorkerClient } from '../../worker/worker-client.js';
import {
  parseTranslationInput,
  type TranslationInput,
  type TranslationResult,
  validateTranslationResult,
} from './contracts.js';

interface Operation {
  input: TranslationInput;
  cancelled: boolean;
  ticket?: Ticket<Record<string, unknown>>;
}
type WorkerPort = Pick<WorkerClient, 'request' | 'on' | 'off'>;

/** Correlate captured text/model/rules snapshots. Execution stays in the existing worker queue. */
export class TranslationCoordinator extends EventEmitter {
  private readonly operations = new Map<string, Operation>();
  private readonly workerIds = new Map<string, string>();
  private readonly seen = new Set<string>();
  private closing = false;

  constructor(private readonly worker: WorkerPort) {
    super();
    worker.on('message', this.onMessage);
  }

  get activeCount(): number {
    return this.operations.size;
  }

  private readonly onMessage = (message: Envelope): void => {
    const id = this.workerIds.get(message.id),
      operation = id ? this.operations.get(id) : undefined;
    if (
      !operation ||
      operation.cancelled ||
      message.event !== 'progress' ||
      message.revision !== operation.input.revision
    )
      return;
    const { phase, fraction } = message.data;
    if (
      Object.keys(message.data).length !== 2 ||
      typeof phase !== 'string' ||
      !['queued', 'running', 'translationRunning'].includes(phase) ||
      !(
        fraction === null ||
        (typeof fraction === 'number' &&
          Number.isFinite(fraction) &&
          fraction >= 0 &&
          fraction <= 1)
      )
    )
      return;
    this.emit('job', {
      v: 1,
      id,
      revision: operation.input.revision,
      event: 'progress',
      data: { phase, fraction },
    });
  };

  start(value: unknown): Ticket<TranslationResult> {
    const input = parseTranslationInput(value);
    if (this.closing) throw new RemoteError('WORKER_EXITED');
    if (this.seen.has(input.request_id)) throw new RemoteError('DUPLICATE_REQUEST');
    if (this.seen.size >= 10000) throw new RemoteError('SESSION_LIMIT');
    if (this.operations.size >= 32) throw new RemoteError('QUEUE_FULL');
    this.seen.add(input.request_id);
    const operation: Operation = { input, cancelled: false };
    this.operations.set(input.request_id, operation);
    const result = this.execute(operation);
    void result.catch(() => undefined);
    return { id: input.request_id, result, cancel: () => this.cancel(input.request_id) };
  }

  async cancel(id: string): Promise<{ requested: boolean }> {
    const operation = this.operations.get(id);
    if (!operation) return { requested: false };
    operation.cancelled = true;
    await operation.ticket?.cancel().catch(() => undefined);
    return { requested: true };
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.all([...this.operations.keys()].map((id) => this.cancel(id)));
    this.worker.off('message', this.onMessage);
  }

  private async execute(operation: Operation): Promise<TranslationResult> {
    const { input } = operation;
    try {
      const ticket = this.worker.request('speech.translate', input.params, input.revision);
      operation.ticket = ticket;
      this.workerIds.set(ticket.id, input.request_id);
      const data = await ticket.result;
      if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
      const result = validateTranslationResult(data, input);
      this.emit('job', {
        v: 1,
        id: input.request_id,
        revision: input.revision,
        event: 'result',
        data: result,
      });
      return result;
    } catch (error) {
      const code =
        operation.cancelled || this.closing
          ? 'CANCELLED'
          : error instanceof RemoteError
            ? error.code
            : 'WORKER_FAILURE';
      this.emit('job', {
        v: 1,
        id: input.request_id,
        revision: input.revision,
        event: 'error',
        data: { code },
      });
      throw new RemoteError(code);
    } finally {
      if (operation.ticket) this.workerIds.delete(operation.ticket.id);
      this.operations.delete(input.request_id);
    }
  }
}
