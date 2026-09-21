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

/**
 * The BYOK/BYO-model registry, as `SpeechCoordinator` needs it to route one job: the current
 * provider list (to find which one, if any, claims a request's `model_id`) and that provider's
 * decrypted credential, handed on to the worker for the hosted child's environment only — never
 * read for any other purpose, never logged, never placed in a fixture. `app/electron/features/
 * speech/provider-store.ts`'s `SpeechProviderStore` already has this exact shape (`list`,
 * `credentialEnv`); the Electron wiring passes it straight through. Omitted (as every existing
 * test still does), every request is treated as local, unchanged from before this ticket.
 */
export interface HostedProviderLookup {
  listProviders(): Promise<readonly SpeechProvider[]>;
  credentialEnv(providerId: string): Promise<Record<string, string> | undefined>;
}

/** Correlate authorized source/model snapshots. Execution stays in the existing worker queue. */
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

  /** Resolves a request's `model_id` against the hosted registry and returns the params to
   * merge in: the one job's provider config and credential — never persisted, only ever
   * carried through this in-memory object and the worker's stdin pipe, which the worker itself
   * keeps out of the on-disk job file (`worker/speech/recognition/service.py`) and hands to the
   * hosted child through its environment instead (D-55). Returns `undefined` when the request
   * names a local model instead. Only ever called from `execute` once `this.providers` is
   * already known truthy — see that call site's comment on why that check, not this one, is
   * what keeps the local-only path (`this.providers` undefined) fully synchronous up to
   * `worker.request`. */
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
      // `this.providers` is undefined for every existing (local-only) caller and test, and the
      // branch below is then skipped with no `await` at all — `worker.request` keeps being
      // called synchronously within `execute`'s first microtask, exactly as before this ticket.
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
