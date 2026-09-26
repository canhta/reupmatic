import { EventEmitter } from 'node:events';
import {
  type Composition,
  compositionDuration,
  parseComposition,
} from '../editing/composition/document.js';
import { resolveEditWindow } from '../editing/edit-recipe.js';
import { type ProjectMedia, parseProjectMedia } from '../editing/project-media.js';
import { parseSoundtrack, type Soundtrack } from '../editing/soundtrack.js';
import {
  type ModelFingerprints,
  type ProcessingRecipe,
  parseModelFingerprints,
  parseProcessingRecipe,
} from '../processing/recipe.js';
import { parseVoiceTrack, type VoiceTrack } from '../speech/synthesis/voice-track.js';
import { assertCues, type Cue } from '../subtitles/cues.js';
import type { OperationName, OperationResult } from '../worker/operations.js';
import { RemoteError } from '../worker/remote-error.js';
import type { Envelope, Ticket, WorkerClient } from '../worker/worker-client.js';
import { registerComposition } from './composition-input.js';
import { voiceMix } from './voice-mix.js';

export interface RenderInput {
  composition?: Composition;
  request_id: string;
  asset_id: string;
  revision: number;
  cues: Cue[];
  encoding?: 'review' | 'lossless';
  processing?: ProcessingRecipe;
  soundtrack?: Soundtrack;
  voice?: VoiceTrack;
  logo?: ProjectMedia;
}

export interface RenderOutput extends Record<string, unknown> {
  artifact_id: string;
  path: string;
  duration_ms: number;
  cache_hit: boolean;
}

type WorkerPort = Pick<WorkerClient, 'request' | 'on' | 'off'>;
interface Operation {
  input: RenderInput;
  cancelled: boolean;
  subtitleId?: string;
  modelFingerprints?: ModelFingerprints;
  step?: Ticket<unknown>;
}

function parseInput(value: unknown): RenderInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RemoteError('INVALID_REQUEST');
  }
  const input = value as RenderInput;
  const allowed = new Set([
    'request_id',
    'asset_id',
    'revision',
    'cues',
    'encoding',
    'processing',
    'soundtrack',
    'voice',
    'composition',
    'logo',
  ]);
  if (
    Object.keys(input).some((key) => !allowed.has(key)) ||
    typeof input.request_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(input.request_id) ||
    typeof input.asset_id !== 'string' ||
    !input.asset_id ||
    input.asset_id.length > 128 ||
    !Number.isInteger(input.revision) ||
    input.revision < 0 ||
    input.revision > 2 ** 31 - 1 ||
    (input.encoding !== undefined && !['review', 'lossless'].includes(input.encoding))
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
  assertCues(input.cues);
  const copy = structuredClone(input);
  if (copy.logo !== undefined) {
    const [logo] = parseProjectMedia([copy.logo]);
    if (logo.kind !== 'image') throw new RemoteError('INVALID_REQUEST');
    copy.logo = logo;
    if (!copy.processing?.editing?.logo) throw new RemoteError('INVALID_REQUEST');
  }
  if (copy.soundtrack !== undefined) copy.soundtrack = parseSoundtrack(copy.soundtrack);
  if (copy.voice !== undefined) {
    copy.voice = parseVoiceTrack(copy.voice);
    if (copy.encoding === 'lossless') throw new RemoteError('INVALID_VOICE');
  }
  if (copy.processing !== undefined) {
    copy.processing = parseProcessingRecipe(copy.processing, copy.cues.length > 0);
    if (copy.encoding === 'lossless') throw new RemoteError('INVALID_PROCESSING');
  }
  if (copy.composition !== undefined) {
    copy.composition = parseComposition(copy.composition);
    if (copy.processing?.ocr || copy.processing?.inpaint)
      throw new RemoteError('COMPOSITION_PROCESSING_UNAVAILABLE');
    const duration = compositionDuration(copy.composition);
    resolveEditWindow(copy.processing?.editing, duration);
    if (copy.cues.some((cue) => cue.end_ms > duration)) throw new RemoteError('INVALID_CUES');
  }
  return copy;
}

export class RenderCoordinator extends EventEmitter {
  private readonly operations = new Map<string, Operation>();
  private readonly publicIds = new Map<string, string>();
  private readonly seen = new Set<string>();
  private closing = false;

  constructor(
    private readonly worker: WorkerPort,
    private readonly admitVoice?: (track: VoiceTrack) => Promise<string>,
  ) {
    super();
    worker.on('message', this.onMessage);
  }

  get activeCount(): number {
    return this.operations.size;
  }

  private readonly onMessage = (message: Envelope): void => {
    if (message.event !== 'progress') return;
    const publicId = this.publicIds.get(message.id);
    const operation = publicId ? this.operations.get(publicId) : undefined;
    if (operation && !operation.cancelled) {
      this.emit('job', { ...message, id: publicId });
    }
  };

  start(
    value: unknown,
    registeredSubtitleId?: string,
    pinnedModels?: ModelFingerprints,
  ): Ticket<RenderOutput> {
    const input = parseInput(value);
    if (
      registeredSubtitleId !== undefined &&
      (typeof registeredSubtitleId !== 'string' ||
        !registeredSubtitleId ||
        registeredSubtitleId.length > 128 ||
        input.cues.length > 0)
    ) {
      throw new RemoteError('INVALID_REQUEST');
    }
    if (registeredSubtitleId && input.processing) parseProcessingRecipe(input.processing, true);
    if (pinnedModels && !input.processing) throw new RemoteError('INVALID_PROCESSING_MODELS');
    const modelFingerprints =
      pinnedModels && input.processing
        ? parseModelFingerprints(pinnedModels, input.processing)
        : undefined;
    if (this.closing) throw new RemoteError('WORKER_EXITED');
    if (this.seen.has(input.request_id)) throw new RemoteError('DUPLICATE_REQUEST');
    if (this.seen.size >= 10000) throw new RemoteError('SESSION_LIMIT');
    if (this.operations.size >= 32) throw new RemoteError('QUEUE_FULL');
    this.seen.add(input.request_id);
    const operation: Operation = {
      input,
      cancelled: false,
      subtitleId: registeredSubtitleId,
      modelFingerprints,
    };
    // Register before the first async operation or acknowledgement.
    this.operations.set(input.request_id, operation);
    const result = this.execute(operation);
    void result.catch(() => undefined);
    return { id: input.request_id, result, cancel: () => this.cancel(input.request_id) };
  }

  async cancel(publicId: string): Promise<{ requested: boolean }> {
    const operation = this.operations.get(publicId);
    if (!operation) return { requested: false };
    operation.cancelled = true;
    if (operation.step) {
      // The result of the target step, not the cancellation ack, is authoritative.
      await operation.step.cancel().catch(() => undefined);
    }
    return { requested: true };
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.all([...this.operations.keys()].map((key) => this.cancel(key)));
    this.worker.off('message', this.onMessage);
  }

  private ensureActive(operation: Operation): void {
    if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
  }

  private async step<M extends OperationName>(
    operation: Operation,
    method: M,
    params: Record<string, unknown>,
  ): Promise<OperationResult<M>> {
    this.ensureActive(operation);
    const ticket = this.worker.request(method, params, operation.input.revision);
    operation.step = ticket;
    this.publicIds.set(ticket.id, operation.input.request_id);
    try {
      const data = await ticket.result;
      this.ensureActive(operation);
      return data;
    } finally {
      this.publicIds.delete(ticket.id);
      operation.step = undefined;
    }
  }

  private async execute(operation: Operation): Promise<RenderOutput> {
    const { input } = operation;
    try {
      const composition = input.composition
        ? await registerComposition(input.composition, (params) =>
            this.step(operation, 'asset.register', params),
          )
        : undefined;
      let subtitleId = operation.subtitleId;
      if (input.cues.length) {
        const saved = await this.step(operation, 'subtitles.prepare', {
          cues: input.cues,
          asset_id: input.asset_id,
          ...(composition
            ? { canvas: { width: composition.canvas.width, height: composition.canvas.height } }
            : {}),
          ...(input.processing?.editing ? { editing: input.processing.editing } : {}),
          ...(input.processing?.subtitle_style ? { style: input.processing.subtitle_style } : {}),
        });
        subtitleId = saved.asset_id;
      }
      const params: Record<string, unknown> = {
        asset_id: input.asset_id,
        encoding: input.encoding ?? 'review',
        ...(composition ? { composition } : {}),
      };
      if (subtitleId) params.subtitle_id = subtitleId;
      if (input.soundtrack) {
        const { source, ...placement } = input.soundtrack;
        const asset = await this.step(operation, 'asset.register', {
          path: source.path,
          kind: 'audio',
        });
        if (asset.sha256 !== source.sha256) throw new RemoteError('SOURCE_CHANGED');
        params.soundtrack = { ...placement, asset_id: asset.asset_id, sha256: source.sha256 };
      }
      if (input.voice) {
        if (!this.admitVoice) throw new RemoteError('VOICE_TRACK_STALE');
        const path = await this.admitVoice(input.voice);
        const mix = voiceMix(input.voice);
        const asset = await this.step(operation, 'asset.register', { path, kind: 'audio' });
        if (asset.sha256 !== mix.sha256) throw new RemoteError('SOURCE_CHANGED');
        const { artifact_id, sha256, ...voice } = mix;
        params.voice = { ...voice, asset_id: asset.asset_id, sha256 };
      }
      if (input.logo && input.processing?.editing?.logo) {
        const asset = await this.step(operation, 'asset.register', {
          path: input.logo.path,
          kind: 'image',
        });
        if (asset.sha256 !== input.logo.sha256) throw new RemoteError('SOURCE_CHANGED');
        params.logo = { asset_id: asset.asset_id, sha256: asset.sha256 };
      }
      if (input.processing) {
        params.processing = input.processing;
        if (operation.modelFingerprints) params.model_fingerprints = operation.modelFingerprints;
      }
      const data = await this.step(
        operation,
        input.processing ? 'media.process' : 'media.render',
        params,
      );
      this.emit('job', {
        v: 1,
        id: input.request_id,
        revision: input.revision,
        event: 'result',
        data: {
          ...data,
          source_asset_id: input.asset_id,
          ...(input.composition ? { source_composition: input.composition } : {}),
        },
      } satisfies Envelope);
      return data;
    } catch (error) {
      const code = operation.cancelled
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
      } satisfies Envelope);
      throw new RemoteError(code);
    } finally {
      this.operations.delete(input.request_id);
      if (this.operations.size === 0) this.emit('idle');
    }
  }
}
