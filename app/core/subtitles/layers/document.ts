import { assertCues, type Cue } from '../cues.js';
import { type TranslationOrigin, validTranslationOrigin } from './translation-origin.js';

export const textLayerNames = ['transcript', 'translated', 'spoken', 'displayed'] as const;
export type TextLayerName = (typeof textLayerNames)[number];
export type TextLanguage = 'en' | 'vi' | 'zh' | null;
export type LayerOrigin =
  | TranslationOrigin
  | { kind: 'manual' | 'srt' }
  | { kind: 'copy'; layer: TextLayerName; token: string }
  | {
      kind: 'stt' | 'ocr';
      request_id: string;
      source_sha256: string;
      start_ms: number;
      end_ms: number;
      model_id?: string;
      runtime?: string;
    };
export interface LayerMetadata {
  token: string;
  language: TextLanguage;
  origin: LayerOrigin;
  edited: boolean;
  stale: boolean;
}
export interface TextLayer extends LayerMetadata {
  cues: Cue[];
}
export interface TextLayers {
  version: 2;
  transcript: TextLayer;
  translated: TextLayer;
  spoken: TextLayer;
  // EditorSnapshot.cues is the sole displayed track, including its visual styles.
  displayed: LayerMetadata;
}
export interface TextSnapshot {
  cues: Cue[];
  text_layers?: TextLayers;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function token(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}
function hash(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function validOrigin(value: unknown): boolean {
  if (!object(value)) return false;
  if (value.kind === 'translation') return validTranslationOrigin(value);
  if (value.kind === 'manual' || value.kind === 'srt') return exact(value, ['kind']);
  if (value.kind === 'copy')
    return (
      exact(value, ['kind', 'layer', 'token']) &&
      textLayerNames.includes(value.layer as TextLayerName) &&
      token(value.token)
    );
  return (
    (value.kind === 'stt' || value.kind === 'ocr') &&
    exact(value, [
      'kind',
      'request_id',
      'source_sha256',
      'start_ms',
      'end_ms',
      ...('model_id' in value ? ['model_id'] : []),
      ...('runtime' in value ? ['runtime'] : []),
    ]) &&
    token(value.request_id) &&
    hash(value.source_sha256) &&
    Number.isInteger(value.start_ms) &&
    Number.isInteger(value.end_ms) &&
    Number(value.start_ms) >= 0 &&
    Number(value.end_ms) > Number(value.start_ms) &&
    Number(value.end_ms) <= 86400000 &&
    (!('model_id' in value) || hash(value.model_id)) &&
    (!('runtime' in value) ||
      (typeof value.runtime === 'string' &&
        value.runtime.length > 0 &&
        value.runtime.length <= 128 &&
        !value.runtime.includes('\0'))) &&
    (value.kind !== 'stt' || 'model_id' in value)
  );
}

export function parseTextLayers(value: unknown): TextLayers {
  if (!object(value) || !exact(value, ['version', ...textLayerNames]) || value.version !== 2) {
    throw new Error('INVALID_TEXT_LAYERS');
  }
  for (const name of textLayerNames) {
    const item = value[name];
    if (
      !object(item) ||
      !exact(item, [
        'token',
        'language',
        'origin',
        'edited',
        'stale',
        ...(name === 'displayed' ? [] : ['cues']),
      ]) ||
      !token(item.token) ||
      ![null, 'en', 'vi', 'zh'].includes(item.language as TextLanguage) ||
      !validOrigin(item.origin) ||
      typeof item.edited !== 'boolean' ||
      typeof item.stale !== 'boolean'
    ) {
      throw new Error('INVALID_TEXT_LAYERS');
    }
    if (name !== 'displayed') {
      try {
        assertCues(item.cues);
      } catch {
        throw new Error('INVALID_TEXT_LAYERS');
      }
      if (item.cues.some((cue) => 'style' in cue)) throw new Error('INVALID_TEXT_LAYERS');
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 1000000) {
    throw new Error('TEXT_LAYERS_TOO_LARGE');
  }
  return structuredClone(value) as unknown as TextLayers;
}

export function createTextLayers(): TextLayers {
  const metadata = (name: TextLayerName): LayerMetadata => ({
    token: `initial-${name}`,
    language: null,
    origin: { kind: 'manual' },
    edited: false,
    stale: false,
  });
  return {
    version: 2,
    displayed: metadata('displayed'),
    transcript: { ...metadata('transcript'), cues: [] },
    translated: { ...metadata('translated'), cues: [] },
    spoken: { ...metadata('spoken'), cues: [] },
  };
}

export function getTextLayer(snapshot: TextSnapshot, name: TextLayerName): TextLayer {
  if (!textLayerNames.includes(name)) throw new Error('INVALID_TEXT_LAYERS');
  const layers = snapshot.text_layers ?? createTextLayers();
  return structuredClone(
    name === 'displayed' ? { ...layers.displayed, cues: snapshot.cues } : layers[name],
  );
}

export function plainCues(cues: Cue[]): Cue[] {
  return cues.map(({ id, start_ms, end_ms, text }) => ({ id, start_ms, end_ms, text }));
}

export function sameText(left: Cue[], right: Cue[]): boolean {
  return JSON.stringify(plainCues(left)) === JSON.stringify(plainCues(right));
}
