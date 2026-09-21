import { EventEmitter } from 'node:events';
import { assertCues, type Cue } from '../subtitles/cues.js';
import type { OperationName } from '../worker/operations.js';
import { RemoteError } from '../worker/remote-error.js';
import type { Envelope, Ticket, WorkerClient } from '../worker/worker-client.js';

const VISION_METHODS = [
  'media.ocr',
  'media.ocr.extract',
  'media.inpaint',
] as const satisfies readonly OperationName[];
export type VisionMethod = (typeof VISION_METHODS)[number];

export type ContentLanguage = 'en' | 'vi' | 'zh';
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface VisionParams extends Record<string, unknown> {
  asset_id: string;
  start_ms: number;
  end_ms: number;
  language?: ContentLanguage;
  sample_ms?: number;
  min_confidence?: number;
  target?: 'manual' | 'text';
  padding_px?: number;
  region?: Region;
}
export interface VisionInput {
  request_id: string;
  revision: number;
  method: VisionMethod;
  params: VisionParams;
}
export interface Detection {
  text: string;
  confidence: number;
  box: [number, number, number, number];
}
export interface Observation {
  start_ms: number;
  end_ms: number;
  detections: Detection[];
}
export interface OcrResult extends Record<string, unknown> {
  kind: 'ocr';
  asset_id: string;
  source_sha256: string;
  start_ms: number;
  end_ms: number;
  language: ContentLanguage;
  sample_ms: number;
  cues: Cue[];
  observations: Observation[];
  analysis_id: string;
  width: number;
  height: number;
  scope?: 'full-source';
  evidence?: { chunks: number; preview_count: number; observation_count: number };
}
export interface InpaintResult extends Record<string, unknown> {
  kind: 'inpainting';
  asset_id: string;
  artifact_id: string;
  duration_ms: number;
  path?: string;
  url?: string;
  width: number;
  height: number;
  fps: number;
}
export type VisionResult = OcrResult | InpaintResult;
export interface ModelState {
  available: boolean;
  code: string | null;
  languages: ContentLanguage[];
  verified: boolean;
}
export interface ModelStatus {
  ocr: ModelState;
  inpainting: ModelState;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('\0')
  );
}
function validRegion(value: unknown): value is Region {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'height,width,x,y') return false;
  const { x, y, width, height } = value;
  return (
    [x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    Number(x) >= 0 &&
    Number(y) >= 0 &&
    Number(width) > 0 &&
    Number(height) > 0 &&
    Number(x) + Number(width) <= 1 + 1e-9 &&
    Number(y) + Number(height) <= 1 + 1e-9
  );
}
export function parseVisionInput(value: unknown): VisionInput {
  if (
    !object(value) ||
    Object.keys(value).sort().join(',') !== 'method,params,request_id,revision' ||
    typeof value.request_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(value.request_id) ||
    !integer(value.revision, 0, 2 ** 31 - 1) ||
    !(VISION_METHODS as readonly string[]).includes(String(value.method)) ||
    !object(value.params)
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
  const p = value.params,
    ocr = value.method !== 'media.inpaint';
  const required = [
    'asset_id',
    'start_ms',
    'end_ms',
    ...(ocr ? ['language', 'sample_ms', 'min_confidence'] : ['target', 'padding_px']),
  ];
  const allowed = [...required, 'region', ...(!ocr ? ['language'] : [])];
  if (
    required.some((key) => !(key in p)) ||
    Object.keys(p).some((key) => !allowed.includes(key)) ||
    !identifier(p.asset_id) ||
    !integer(p.start_ms, 0, 86400000) ||
    !integer(p.end_ms, 1, 86400000) ||
    Number(p.end_ms) <= Number(p.start_ms) ||
    ('region' in p && !validRegion(p.region))
  )
    throw new RemoteError('INVALID_REQUEST');
  if (value.method === 'media.ocr.extract' && p.start_ms !== 0)
    throw new RemoteError('INVALID_REQUEST');
  if (
    value.method !== 'media.ocr.extract' &&
    Number(p.end_ms) - Number(p.start_ms) > (ocr ? 120000 : 10000)
  )
    throw new RemoteError('VISION_LIMIT');
  if (ocr) {
    if (
      !integer(p.sample_ms, 100, 2000) ||
      typeof p.min_confidence !== 'number' ||
      !Number.isFinite(p.min_confidence) ||
      p.min_confidence < 0 ||
      p.min_confidence > 1
    ) {
      throw new RemoteError('INVALID_REQUEST');
    }
  } else if (
    !['manual', 'text'].includes(String(p.target)) ||
    !integer(p.padding_px, 0, 32) ||
    (p.target === 'manual' && (!('region' in p) || 'language' in p)) ||
    (p.target === 'text' && 'region' in p)
  )
    throw new RemoteError('INVALID_REQUEST');
  if ((ocr || p.target === 'text') && !['en', 'vi', 'zh'].includes(String(p.language))) {
    throw new RemoteError('INVALID_REQUEST');
  }
  return structuredClone(value) as unknown as VisionInput;
}

export function validateVisionResult(value: unknown, input: VisionInput): VisionResult {
  if (
    !object(value) ||
    value.asset_id !== input.params.asset_id ||
    value.start_ms !== input.params.start_ms ||
    value.end_ms !== input.params.end_ms ||
    !integer(value.width, 2, 1920) ||
    !integer(value.height, 2, 1920) ||
    typeof value.source_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.source_sha256)
  ) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  if (input.method !== 'media.inpaint') {
    if (
      value.kind !== 'ocr' ||
      value.language !== input.params.language ||
      value.sample_ms !== input.params.sample_ms ||
      !identifier(value.analysis_id) ||
      !Array.isArray(value.observations) ||
      value.observations.length > 1200
    ) {
      throw new RemoteError('INVALID_WORKER_RESPONSE');
    }
    if (
      input.method === 'media.ocr.extract' &&
      (value.scope !== 'full-source' ||
        !object(value.evidence) ||
        !integer(value.evidence.chunks, 1, 100000) ||
        value.evidence.preview_count !== value.observations.length ||
        !integer(value.evidence.observation_count, value.observations.length, 864000))
    ) {
      throw new RemoteError('INVALID_WORKER_RESPONSE');
    }
    try {
      assertCues(value.cues);
    } catch {
      throw new RemoteError('INVALID_WORKER_RESPONSE');
    }
    const cues = value.cues as Cue[];
    if (cues.some((c) => c.start_ms < input.params.start_ms || c.end_ms > input.params.end_ms)) {
      throw new RemoteError('INVALID_WORKER_RESPONSE');
    }
    let previous = input.params.start_ms;
    for (const item of value.observations) {
      if (
        !object(item) ||
        !integer(item.start_ms, previous, input.params.end_ms - 1) ||
        !integer(item.end_ms, Number(item.start_ms) + 1, input.params.end_ms) ||
        !Array.isArray(item.detections) ||
        item.detections.length > 100
      ) {
        throw new RemoteError('INVALID_WORKER_RESPONSE');
      }
      previous = Number(item.end_ms);
      for (const d of item.detections) {
        if (
          !object(d) ||
          typeof d.text !== 'string' ||
          d.text.length > 10000 ||
          d.text.includes('\0') ||
          typeof d.confidence !== 'number' ||
          !Number.isFinite(d.confidence) ||
          d.confidence < 0 ||
          d.confidence > 1 ||
          !Array.isArray(d.box) ||
          d.box.length !== 4 ||
          !integer(d.box[0], 0, Number(value.width) - 1) ||
          !integer(d.box[1], 0, Number(value.height) - 1) ||
          !integer(d.box[2], Number(d.box[0]) + 1, Number(value.width)) ||
          !integer(d.box[3], Number(d.box[1]) + 1, Number(value.height))
        ) {
          throw new RemoteError('INVALID_WORKER_RESPONSE');
        }
      }
    }
  } else if (
    value.kind !== 'inpainting' ||
    !identifier(value.artifact_id) ||
    typeof value.path !== 'string' ||
    !value.path ||
    value.path.includes('\0') ||
    !integer(value.duration_ms, 1, 10050) ||
    value.fps !== 24
  ) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return value as unknown as VisionResult;
}

interface Operation {
  input: VisionInput;
  cancelled: boolean;
  ticket?: Ticket<Record<string, unknown>>;
}
type WorkerPort = Pick<WorkerClient, 'request' | 'on' | 'off'>;

export class VisionCoordinator extends EventEmitter {
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
    const publicId = this.workerIds.get(message.id);
    const operation = publicId ? this.operations.get(publicId) : undefined;
    if (operation && !operation.cancelled && message.event === 'progress') {
      this.emit('job', { ...message, id: publicId });
    }
  };
  start(value: unknown): Ticket<VisionResult> {
    const input = parseVisionInput(value);
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
  private async execute(operation: Operation): Promise<VisionResult> {
    const { input } = operation;
    try {
      const ticket = this.worker.request(input.method, input.params, input.revision);
      operation.ticket = ticket;
      this.workerIds.set(ticket.id, input.request_id);
      const data = await ticket.result;
      if (operation.cancelled || this.closing) throw new RemoteError('CANCELLED');
      const result = validateVisionResult(data, input);
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
