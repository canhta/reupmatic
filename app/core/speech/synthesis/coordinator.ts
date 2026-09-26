import { EventEmitter } from 'node:events';
import { RemoteError } from '../../worker/remote-error.js';
import type { Envelope, Ticket, WorkerClient } from '../../worker/worker-client.js';
import {
  HOSTED_CREDENTIAL_ENV_VAR,
  hostedModelIdentity,
  type SpeechProvider,
  VIENEU_CLOUD_MODEL,
  VIENEU_CLOUD_PROTOCOL,
} from '../providers.js';
import type { ClonedVoiceData } from '../voices.js';
import type { SynthesisArtifacts } from './artifacts.js';
import { parseSynthesisInput, type SynthesisInput, type SynthesisResult } from './contracts.js';

// Resolves a stored clone's numeric payload; presets and cloud voices resolve to undefined.
export interface VoiceDataLookup {
  voiceData(voiceId: string): Promise<ClonedVoiceData | undefined>;
}

// The BYOK provider store, reached only to read a credential and hand it to the child's env.
export interface HostedSynthesisLookup {
  listProviders(): Promise<readonly SpeechProvider[]>;
  credentialEnv(providerId: string): Promise<Record<string, string> | undefined>;
}

interface Operation {
  input: SynthesisInput;
  cancelled: boolean;
  ticket?: Ticket<Record<string, unknown>>;
}
type WorkerPort = Pick<WorkerClient, 'request' | 'on' | 'off'>;

export class SynthesisCoordinator extends EventEmitter {
  private readonly operations = new Map<string, Operation>();
  private readonly workerIds = new Map<string, string>();
  private readonly seen = new Set<string>();
  private closing = false;

  constructor(
    private readonly worker: WorkerPort,
    private readonly artifacts: SynthesisArtifacts,
    private readonly voices?: VoiceDataLookup,
    private readonly providers?: HostedSynthesisLookup,
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
      !['queued', 'running', 'synthesisRunning'].includes(phase) ||
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

  start(value: unknown): Ticket<SynthesisResult> {
    const input = parseSynthesisInput(value);
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

  /** A cloud model_id resolves to its credentialed VieNeu provider; local ids return undefined. */
  private async cloudParams(operation: Operation): Promise<Record<string, unknown> | undefined> {
    if (!this.providers) return undefined;
    const { model_id } = operation.input.params;
    const providers = await this.providers.listProviders();
    const match = providers.find(
      (provider) =>
        provider.protocol === VIENEU_CLOUD_PROTOCOL &&
        hostedModelIdentity({
          protocol: provider.protocol,
          remote_model_name: VIENEU_CLOUD_MODEL,
          endpoint_host: provider.endpoint_host,
        }) === model_id,
    );
    if (!match) return undefined;
    const env = await this.providers.credentialEnv(match.id);
    if (!env) throw new RemoteError('MODEL_MISSING');
    return {
      provider: { protocol: match.protocol, endpoint_host: match.endpoint_host },
      credential: env[HOSTED_CREDENTIAL_ENV_VAR],
    };
  }

  private async execute(operation: Operation): Promise<SynthesisResult> {
    const { input } = operation;
    try {
      // Only touch the host lookups when a store is wired, so a plain local job stays synchronous.
      const hosted = this.providers ? await this.cloudParams(operation) : undefined;
      if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
      const voice =
        hosted || !this.voices ? undefined : await this.voices.voiceData(input.params.voice_id);
      if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
      const ticket = this.worker.request(
        'speech.synthesize',
        { ...input.params, ...hosted, ...(voice ? { voice } : {}) },
        input.revision,
      );
      operation.ticket = ticket;
      this.workerIds.set(ticket.id, input.request_id);
      const data = await ticket.result;
      const result = await this.artifacts.admit(data, input);
      if (operation.cancelled || this.closing) {
        await this.artifacts.discard(result.artifact_id).catch(() => undefined);
        throw new RemoteError('CANCELLED');
      }
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
