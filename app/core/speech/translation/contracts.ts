import { assertCues, type Cue } from '../../subtitles/cues.js';
import { RemoteError } from '../../worker/remote-error.js';
import {
  parseTranslationRules,
  type TranslationLanguage,
  type TranslationRule,
  type TranslationSource,
} from './rules.js';

export interface TranslationParams extends Record<string, unknown> {
  source_layer: TranslationSource;
  source_token: string;
  source_language: TranslationLanguage;
  target_language: TranslationLanguage;
  model_id: string;
  cues: Cue[];
  rules: TranslationRule[];
}
export interface TranslationInput {
  request_id: string;
  revision: number;
  params: TranslationParams;
}
export interface TranslationResult extends TranslationParams {
  kind: 'translation';
  runtime: string;
}
export interface TranslationStatus {
  available: boolean;
  code: string | null;
  model_id: string | null;
  source_language: TranslationLanguage | null;
  target_language: TranslationLanguage | null;
  verified: false;
}
export type TranslationEvent =
  | {
      v: 1;
      id: string;
      revision: number;
      event: 'progress';
      data: { phase: string; fraction: number | null };
    }
  | { v: 1; id: string; revision: number; event: 'error'; data: { code: string } }
  | { v: 1; id: string; revision: number; event: 'result'; data: TranslationResult };

const keys = [
  'source_layer',
  'source_token',
  'source_language',
  'target_language',
  'model_id',
  'cues',
  'rules',
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
function language(value: unknown): boolean {
  return typeof value === 'string' && ['en', 'vi', 'zh'].includes(value);
}

export function parseTranslationInput(value: unknown): TranslationInput {
  if (
    !object(value) ||
    !exact(value, ['request_id', 'revision', 'params']) ||
    !token(value.request_id) ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    Number(value.revision) > 2 ** 31 - 1 ||
    !object(value.params)
  )
    throw new RemoteError('INVALID_REQUEST');
  const p = value.params;
  if (
    !exact(p, keys) ||
    !['transcript', 'displayed'].includes(String(p.source_layer)) ||
    typeof p.source_layer !== 'string' ||
    !token(p.source_token) ||
    !hash(p.model_id) ||
    !language(p.source_language) ||
    !language(p.target_language) ||
    p.source_language === p.target_language
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
  try {
    assertCues(p.cues);
    parseTranslationRules(p.rules);
  } catch {
    throw new RemoteError('INVALID_REQUEST');
  }
  if (
    !p.cues.length ||
    p.cues.length > 500 ||
    p.cues.some((cue) => 'style' in cue || !cue.text.trim() || cue.text.length > 4000) ||
    new TextEncoder().encode(p.cues.map((cue) => cue.text).join('')).byteLength > 100000 ||
    new TextEncoder().encode(JSON.stringify(p)).byteLength > 511000 ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > 512000
  )
    throw new RemoteError('TRANSLATION_LIMIT');
  return structuredClone(value) as unknown as TranslationInput;
}

export function validateTranslationResult(
  value: unknown,
  input: TranslationInput,
): TranslationResult {
  if (
    !object(value) ||
    !exact(value, [...keys, 'kind', 'runtime']) ||
    value.kind !== 'translation' ||
    typeof value.runtime !== 'string' ||
    !value.runtime ||
    value.runtime.length > 128 ||
    value.runtime.includes('\0') ||
    keys
      .filter((key) => key !== 'cues')
      .some((key) => JSON.stringify(value[key]) !== JSON.stringify(input.params[key]))
  ) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  try {
    assertCues(value.cues);
  } catch {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  if (
    value.cues.length !== input.params.cues.length ||
    value.cues.some((cue, i) => {
      const source = input.params.cues[i];
      return (
        cue.id !== source.id ||
        cue.start_ms !== source.start_ms ||
        cue.end_ms !== source.end_ms ||
        'style' in cue ||
        !cue.text.trim() ||
        cue.text.length > 10000
      );
    }) ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > 1000000
  ) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return structuredClone(value) as unknown as TranslationResult;
}

export function parseTranslationStatus(value: unknown): TranslationStatus {
  if (
    !object(value) ||
    !exact(value, [
      'available',
      'code',
      'model_id',
      'source_language',
      'target_language',
      'verified',
    ]) ||
    typeof value.available !== 'boolean' ||
    value.verified !== false ||
    !(
      value.code === null ||
      (typeof value.code === 'string' && /^[A-Z_]{1,80}$/.test(value.code))
    ) ||
    !(value.model_id === null || hash(value.model_id)) ||
    !(value.source_language === null || language(value.source_language)) ||
    !(value.target_language === null || language(value.target_language)) ||
    (value.source_language !== null && value.source_language === value.target_language) ||
    (value.available &&
      (value.code !== null ||
        value.model_id === null ||
        value.source_language === null ||
        value.target_language === null))
  )
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  return structuredClone(value) as unknown as TranslationStatus;
}
