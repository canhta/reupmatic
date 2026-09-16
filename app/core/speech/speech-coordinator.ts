import { EventEmitter } from 'node:events';
import { RemoteError } from '../worker/remote-error.js';
import { type Envelope, type Ticket, type WorkerClient } from '../worker/worker-client.js';
import { parseSpeechInput, validateSpeechResult, type SpeechInput, type SpeechResult } from './recognition.js';

interface Operation {
  input: SpeechInput;
  sourceHash: string;
  cancelled: boolean;
  ticket?: Ticket<Record<string, unknown>>;
}
type WorkerPort = Pick<WorkerClient, 'request' | 'on' | 'off'>;

/** Correlate authorized source/model snapshots. Execution stays in the existing worker queue. */
export class SpeechCoordinator extends EventEmitter {
  private readonly operations = new Map<string, Operation>();
  private readonly workerIds = new Map<string, string>();
  private readonly seen = new Set<string>();
  private closing = false;

  constructor(private readonly worker: WorkerPort) {
    super();
    worker.on('message', this.onMessage);
  }

  get activeCount(): number { return this.operations.size; }

  private readonly onMessage = (message: Envelope): void => {
    const id = this.workerIds.get(message.id), operation = id ? this.operations.get(id) : undefined;
    if (operation && !operation.cancelled && message.event === 'progress'
      && message.revision === operation.input.revision) this.emit('job', { ...message, id });
  };

  start(value: unknown, sourceHash: string): Ticket<SpeechResult> {
    const input = parseSpeechInput(value);
    if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new RemoteError('INVALID_REQUEST');
    if (this.closing) throw new RemoteError('WORKER_EXITED');
    if (this.seen.has(input.request_id)) throw new RemoteError('DUPLICATE_REQUEST');
    if (this.seen.size >= 10000) throw new RemoteError('SESSION_LIMIT');
    if (this.operations.size >= 32) throw new RemoteError('QUEUE_FULL');
    this.seen.add(input.request_id);
    const operation: Operation = { input, sourceHash, cancelled: false };
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
    await Promise.all([...this.operations.keys()].map(id => this.cancel(id)));
    this.worker.off('message', this.onMessage);
  }

  private async execute(operation: Operation): Promise<SpeechResult> {
    const { input, sourceHash } = operation;
    try {
      const ticket = this.worker.request('speech.transcribe', {
        ...input.params, source_sha256: sourceHash,
      }, input.revision);
      operation.ticket = ticket;
      this.workerIds.set(ticket.id, input.request_id);
      const data = await ticket.result;
      if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
      const result = validateSpeechResult(data, input, sourceHash);
      this.emit('job', { v: 1, id: input.request_id, revision: input.revision, event: 'result', data: result });
      return result;
    } catch (error) {
      const code = operation.cancelled || this.closing ? 'CANCELLED'
        : error instanceof RemoteError ? error.code : 'WORKER_FAILURE';
      this.emit('job', { v: 1, id: input.request_id, revision: input.revision, event: 'error', data: { code } });
      throw new RemoteError(code);
    } finally {
      if (operation.ticket) this.workerIds.delete(operation.ticket.id);
      this.operations.delete(input.request_id);
    }
  }
}
