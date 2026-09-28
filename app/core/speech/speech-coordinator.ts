import { EventEmitter } from 'node:events';
import { RemoteError } from '../worker/remote-error.js';
import type { Envelope, Ticket, WorkerClient } from '../worker/worker-client.js';
import type { SpeechProvider } from './providers.js';
import { HOSTED_CREDENTIAL_ENV_VAR, resolveHostedModel } from './providers.js';
import {
  parseSpeechInput,
  type SpeechInput,
  type SpeechResult,
  validateSpeechResult,
} from './recognition.js';

interface Operation {
  input: SpeechInput;
  sourceHash: string;
  cancelled: boolean;
  ticket?: Ticket<Record<string, unknown>>;
}
type WorkerPort = Pick<WorkerClient, 'request' | 'on' | 'off'>;

// Credential is handed to the worker's hosted child env only; never logged or placed in a fixture.
export interface HostedProviderLookup {
  listProviders(): Promise<readonly SpeechProvider[]>;
  credentialEnv(providerId: string): Promise<Record<string, string> | undefined>;
}

export class SpeechCoordinator extends EventEmitter {
  private readonly operations = new Map<string, Operation>();
  private readonly workerIds = new Map<string, string>();
  private readonly seen = new Set<string>();
  private closing = false;

  constructor(
    private readonly worker: WorkerPort,
    private readonly providers?: HostedProviderLookup,
  ) {
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
      operation &&
      !operation.cancelled &&
      message.event === 'progress' &&
      message.revision === operation.input.revision
    )
      this.emit('job', { ...message, id });
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
    await Promise.all([...this.operations.keys()].map((id) => this.cancel(id)));
    this.worker.off('message', this.onMessage);
  }

  private async hostedParams(
    operation: Operation,
    registry: HostedProviderLookup,
  ): Promise<Record<string, unknown> | undefined> {
    const providers = await registry.listProviders();
    if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
    const hosted = resolveHostedModel(providers, operation.input.params.model_id);
    if (!hosted) return undefined;
    const { params } = operation.input;
    if (params.end_ms - params.start_ms > hosted.model.max_duration_ms) {
      throw new RemoteError('SPEECH_CLOUD_LIMIT');
    }
    const credentialEnv = await registry.credentialEnv(hosted.provider.id);
    if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
    if (!credentialEnv) throw new RemoteError('MODEL_MISSING');
    return {
      provider: {
        protocol: hosted.provider.protocol,
        endpoint_host: hosted.provider.endpoint_host,
        remote_model_name: hosted.model.remote_model_name,
        max_duration_ms: hosted.model.max_duration_ms,
      },
      credential: credentialEnv[HOSTED_CREDENTIAL_ENV_VAR],
    };
  }

  private async execute(operation: Operation): Promise<SpeechResult> {
    const { input, sourceHash } = operation;
    try {
      const hosted = this.providers
        ? await this.hostedParams(operation, this.providers)
        : undefined;
      const ticket = this.worker.request(
        'speech.transcribe',
        {
          ...input.params,
          source_sha256: sourceHash,
          ...hosted,
        },
        input.revision,
      );
      operation.ticket = ticket;
      this.workerIds.set(ticket.id, input.request_id);
      const data = await ticket.result;
      if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
      const result = validateSpeechResult(data, input, sourceHash);
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
