import { assertCues, type Cue } from '../../subtitles/cues.js';
import { RemoteError } from '../../worker/remote-error.js';

export type SynthesisLanguage = 'en' | 'vi';
export interface SynthesisParams extends Record<string, unknown> {
  source_layer: 'spoken';
  source_token: string;
  language: SynthesisLanguage;
  model_id: string;
  voice_id: string;
  cues: Cue[];
}
export interface SynthesisInput {
  request_id: string;
  revision: number;
  params: SynthesisParams;
}
export interface SynthesisSegment {
  cue_id: string;
  start_frame: number;
  end_frame: number;
  lead_silence_frames: number;
}
export interface SynthesisResult extends SynthesisParams {
  kind: 'synthesis';
  artifact_id: string;
  sha256: string;
  sample_rate: number;
  frames: number;
  duration_ms: number;
  segments: SynthesisSegment[];
  runtime: string;
}

export const SUPPORTED_SAMPLE_RATES = [16000, 22050, 24000, 32000, 44100, 48000] as const;
export interface SynthesisStatus {
  available: boolean;
  code: string | null;
  model_id: string | null;
  engine: string | null;
  languages: SynthesisLanguage[];
  voices: { id: string; label: string }[];
  verified: false;
}
export type SynthesisEvent =
  | {
      v: 1;
      id: string;
      revision: number;
      event: 'progress';
      data: { phase: string; fraction: number | null };
    }
  | { v: 1; id: string; revision: number; event: 'error'; data: { code: string } }
  | { v: 1; id: string; revision: number; event: 'result'; data: SynthesisResult };

const malformed = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const paramsKeys = ['source_layer', 'source_token', 'language', 'model_id', 'voice_id', 'cues'];
export const SYNTHESIS_PARAMS_KEYS = paramsKeys;
const resultKeys = [
  ...paramsKeys,
  'kind',
  'artifact_id',
  'sha256',
  'sample_rate',
  'frames',
  'duration_ms',
  'segments',
  'runtime',
];
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(value).length === names.length && names.every((key) => key in value);
}
function token(value: unknown): boolean {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}
function hash(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function text(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    value.length <= limit &&
    !malformed.test(value) &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejects control characters in text fields on purpose
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

export function parseSynthesisInput(value: unknown): SynthesisInput {
  if (
    !object(value) ||
    !exact(value, ['request_id', 'revision', 'params']) ||
    !token(value.request_id) ||
    !integer(value.revision, 0, 2 ** 31 - 1) ||
    !object(value.params)
  )
    throw new RemoteError('INVALID_REQUEST');
  const p = value.params;
  if (
    !exact(p, paramsKeys) ||
    p.source_layer !== 'spoken' ||
    !token(p.source_token) ||
    !hash(p.model_id) ||
    !text(p.voice_id, 128) ||
    !(p.language === 'en' || p.language === 'vi')
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
  try {
    assertCues(p.cues);
  } catch {
    throw new RemoteError('INVALID_REQUEST');
  }
  if (
    !p.cues.length ||
    p.cues.length > 100 ||
    p.cues.some(
      (c) => 'style' in c || !c.text.trim() || c.text.length > 300 || malformed.test(c.text),
    ) ||
    new TextEncoder().encode(p.cues.map((c) => c.text).join('')).byteLength > 20000 ||
    new TextEncoder().encode(JSON.stringify(p)).byteLength > 63000 ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > 64000
  )
    throw new RemoteError('SYNTHESIS_LIMIT');
  return structuredClone(value) as unknown as SynthesisInput;
}

export function validateSynthesisResult(value: unknown, input: SynthesisInput): SynthesisResult {
  const fail = (): never => {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  };
  if (
    !object(value) ||
    !exact(value, resultKeys) ||
    value.kind !== 'synthesis' ||
    paramsKeys.some((key) => JSON.stringify(value[key]) !== JSON.stringify(input.params[key])) ||
    typeof value.artifact_id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value.artifact_id,
    ) ||
    !hash(value.sha256) ||
    !integer(value.sample_rate, 1, 192000) ||
    !integer(value.frames, 1, 192000 * 600) ||
    !integer(value.duration_ms, 1, 600000) ||
    !text(value.runtime, 256) ||
    !Array.isArray(value.segments) ||
    value.segments.length !== input.params.cues.length
  )
    return fail();
  if (!(SUPPORTED_SAMPLE_RATES as readonly number[]).includes(value.sample_rate))
    throw new RemoteError('SYNTHESIS_SAMPLE_RATE_UNSUPPORTED');
  const rate = value.sample_rate;
  if (value.frames > rate * 600 || value.duration_ms !== Math.ceil((value.frames * 1000) / rate))
    return fail();
  let nextStart = 0;
  for (const [index, segment] of value.segments.entries()) {
    if (
      !object(segment) ||
      !exact(segment, ['cue_id', 'start_frame', 'end_frame', 'lead_silence_frames']) ||
      segment.cue_id !== input.params.cues[index].id ||
      !integer(segment.lead_silence_frames, 0, value.frames) ||
      segment.start_frame !== nextStart + segment.lead_silence_frames ||
      !integer(
        segment.end_frame,
        nextStart + segment.lead_silence_frames + 1,
        Math.min(nextStart + segment.lead_silence_frames + rate * 60 - 1, value.frames),
      )
    )
      return fail();
    nextStart = segment.end_frame;
  }
  if (nextStart !== value.frames) return fail();
  return structuredClone(value) as unknown as SynthesisResult;
}

export function parseSynthesisStatus(value: unknown): SynthesisStatus {
  if (
    !object(value) ||
    !exact(value, ['available', 'code', 'model_id', 'engine', 'languages', 'voices', 'verified']) ||
    typeof value.available !== 'boolean' ||
    value.verified !== false ||
    !(
      value.code === null ||
      (typeof value.code === 'string' && /^[A-Z_]{1,80}$/.test(value.code))
    ) ||
    !(value.model_id === null || hash(value.model_id)) ||
    !(
      value.engine === null ||
      (typeof value.engine === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.engine))
    ) ||
    !Array.isArray(value.languages) ||
    value.languages.length > 2 ||
    new Set(value.languages).size !== value.languages.length ||
    value.languages.some((language) => language !== 'en' && language !== 'vi') ||
    !Array.isArray(value.voices) ||
    value.voices.length > 100 ||
    value.voices.some(
      (voice) =>
        !object(voice) ||
        !exact(voice, ['id', 'label']) ||
        !text(voice.id, 128) ||
        !text(voice.label, 160),
    ) ||
    new Set(value.voices.map((voice) => voice.id)).size !== value.voices.length ||
    (value.available &&
      (value.code !== null ||
        value.model_id === null ||
        value.engine === null ||
        !value.languages.length ||
        !value.voices.length))
  ) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return structuredClone(value) as unknown as SynthesisStatus;
}
