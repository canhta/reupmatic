import { assertCues, type Cue } from '../subtitles/cues.js';
import { RemoteError } from '../worker/remote-error.js';

export type SpeechLanguage = 'en' | 'vi' | 'zh';
export interface SpeechParams extends Record<string, unknown> {
  asset_id: string;
  start_ms: number;
  end_ms: number;
  language: SpeechLanguage;
  model_id: string;
}
export interface SpeechInput {
  request_id: string;
  revision: number;
  params: SpeechParams;
}
export interface SpeechResult extends Record<string, unknown> {
  kind: 'stt';
  asset_id: string;
  source_sha256: string;
  start_ms: number;
  end_ms: number;
  language: SpeechLanguage;
  model_id: string;
  runtime: string;
  clock: 'source';
  timing: 'segment';
  cues: Cue[];
}
export interface SpeechEngineStatus {
  engine: string;
  available: boolean;
  code: string | null;
  model_id: string | null;
  languages: SpeechLanguage[];
  verified: boolean;
}
export interface SpeechStatus {
  engines: SpeechEngineStatus[];
}
export type SpeechEvent =
  | {
      v: 1;
      id: string;
      revision: number;
      event: 'progress';
      data: { phase: string; fraction: number | null };
    }
  | { v: 1; id: string; revision: number; event: 'error'; data: { code: string } }
  | { v: 1; id: string; revision: number; event: 'result'; data: SpeechResult };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function integer(value: unknown, low: number, high: number): boolean {
  return Number.isInteger(value) && Number(value) >= low && Number(value) <= high;
}
function hash(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function parseSpeechInput(value: unknown): SpeechInput {
  if (
    !object(value) ||
    !exact(value, ['request_id', 'revision', 'params']) ||
    typeof value.request_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(value.request_id) ||
    !integer(value.revision, 0, 2 ** 31 - 1) ||
    !object(value.params)
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
  const p = value.params;
  if (
    !exact(p, ['asset_id', 'start_ms', 'end_ms', 'language', 'model_id']) ||
    typeof p.asset_id !== 'string' ||
    !p.asset_id ||
    p.asset_id.length > 128 ||
    p.asset_id.includes('\0') ||
    !integer(p.start_ms, 0, 86400000) ||
    !integer(p.end_ms, 1, 86400000) ||
    Number(p.end_ms) <= Number(p.start_ms) ||
    typeof p.language !== 'string' ||
    !['en', 'vi', 'zh'].includes(p.language) ||
    !hash(p.model_id)
  )
    throw new RemoteError('INVALID_REQUEST');
  if (Number(p.end_ms) - Number(p.start_ms) > 7200000) throw new RemoteError('SPEECH_LIMIT');
  return structuredClone(value) as unknown as SpeechInput;
}

export function validateSpeechResult(
  value: unknown,
  input: SpeechInput,
  sourceHash: string,
): SpeechResult {
  if (
    !object(value) ||
    !exact(value, [
      'kind',
      'asset_id',
      'source_sha256',
      'start_ms',
      'end_ms',
      'language',
      'model_id',
      'runtime',
      'clock',
      'timing',
      'cues',
    ]) ||
    value.kind !== 'stt' ||
    value.clock !== 'source' ||
    value.timing !== 'segment' ||
    value.asset_id !== input.params.asset_id ||
    value.source_sha256 !== sourceHash ||
    !hash(sourceHash) ||
    value.model_id !== input.params.model_id ||
    value.language !== input.params.language ||
    value.start_ms !== input.params.start_ms ||
    value.end_ms !== input.params.end_ms ||
    typeof value.runtime !== 'string' ||
    !value.runtime ||
    value.runtime.length > 128 ||
    value.runtime.includes('\0')
  ) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  try {
    assertCues(value.cues);
  } catch {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  let previous = input.params.start_ms;
  for (const cue of value.cues) {
    if (
      'style' in cue ||
      !cue.text.trim() ||
      cue.start_ms < previous ||
      cue.end_ms > input.params.end_ms
    ) {
      throw new RemoteError('INVALID_WORKER_RESPONSE');
    }
    previous = cue.end_ms;
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 1000000) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return structuredClone(value) as unknown as SpeechResult;
}

function parseEngineStatus(value: unknown): SpeechEngineStatus {
  if (
    !object(value) ||
    !exact(value, ['engine', 'available', 'code', 'model_id', 'languages', 'verified']) ||
    typeof value.engine !== 'string' ||
    !value.engine ||
    value.engine.length > 64 ||
    typeof value.available !== 'boolean' ||
    typeof value.verified !== 'boolean' ||
    !(
      value.code === null ||
      (typeof value.code === 'string' && /^[A-Z_]{1,80}$/.test(value.code))
    ) ||
    !(value.model_id === null || hash(value.model_id)) ||
    !Array.isArray(value.languages) ||
    value.languages.length > 3 ||
    new Set(value.languages).size !== value.languages.length ||
    value.languages.some((language) => !['en', 'vi', 'zh'].includes(language)) ||
    (value.available && (value.code !== null || value.model_id === null || !value.languages.length))
  ) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return value as unknown as SpeechEngineStatus;
}

export function parseSpeechStatus(value: unknown): SpeechStatus {
  if (!object(value) || !exact(value, ['engines']) || !Array.isArray(value.engines)) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  if (value.engines.length > 16) throw new RemoteError('INVALID_WORKER_RESPONSE');
  const engines = value.engines.map(parseEngineStatus);
  if (new Set(engines.map((entry) => entry.engine)).size !== engines.length) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return structuredClone({ engines }) as unknown as SpeechStatus;
}
