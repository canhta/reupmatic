import { type EditingRecipe, parseEditing } from '../editing/edit-recipe.js';
import { parseSubtitleStyle, type SubtitleStyle } from '../subtitles/style.js';
export type ProcessingLanguage = 'en' | 'vi' | 'zh';
export interface ProcessingRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface OcrOptions {
  language: ProcessingLanguage;
  sample_ms: number;
  min_confidence: number;
}
export type InpaintOptions = { padding_px: number } & (
  | { target: 'manual'; region: ProcessingRegion }
  | { target: 'text'; language: ProcessingLanguage }
);
export interface ProcessingRecipe {
  editing?: EditingRecipe;
  subtitle_style?: SubtitleStyle;
  ocr?: OcrOptions;
  inpaint?: InpaintOptions;
}
export type ModelFingerprints = Record<string, string>;

export class ProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function record(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    throw new ProcessingError('INVALID_PROCESSING');
  }
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new ProcessingError('INVALID_PROCESSING');
  return value;
}
function language(value: unknown): ProcessingLanguage {
  if (value !== 'en' && value !== 'vi' && value !== 'zh')
    throw new ProcessingError('INVALID_PROCESSING');
  return value;
}
function parseRegion(value: unknown): ProcessingRegion {
  const r = record(value, ['x', 'y', 'width', 'height']);
  const region = {
    x: number(r.x, 0, 1),
    y: number(r.y, 0, 1),
    width: number(r.width, Number.MIN_VALUE, 1),
    height: number(r.height, Number.MIN_VALUE, 1),
  };
  if (region.x + region.width > 1 + 1e-9 || region.y + region.height > 1 + 1e-9) {
    throw new ProcessingError('INVALID_PROCESSING');
  }
  return region;
}
export function parseProcessingRecipe(value: unknown, hasSubtitles = false): ProcessingRecipe {
  const input = record(value, [], ['ocr', 'inpaint', 'editing', 'subtitle_style']);
  if (
    !('ocr' in input) &&
    !('inpaint' in input) &&
    !('editing' in input) &&
    !('subtitle_style' in input)
  ) {
    throw new ProcessingError('INVALID_PROCESSING');
  }
  const recipe: ProcessingRecipe = {};
  if ('ocr' in input) {
    if (hasSubtitles) throw new ProcessingError('PROCESSING_SUBTITLE_CONFLICT');
    const ocr = record(input.ocr, ['language', 'sample_ms', 'min_confidence']);
    recipe.ocr = {
      language: language(ocr.language),
      sample_ms: number(ocr.sample_ms, 100, 2000, true),
      min_confidence: number(ocr.min_confidence, 0, 1),
    };
  }
  if ('inpaint' in input) {
    const paint = record(input.inpaint, ['target', 'padding_px'], ['region', 'language']);
    const padding_px = number(paint.padding_px, 0, 32, true);
    if (paint.target === 'manual' && !('language' in paint)) {
      recipe.inpaint = { target: 'manual', padding_px, region: parseRegion(paint.region) };
    } else if (paint.target === 'text' && !('region' in paint)) {
      recipe.inpaint = { target: 'text', padding_px, language: language(paint.language) };
    } else throw new ProcessingError('INVALID_PROCESSING');
  }
  if ('subtitle_style' in input) recipe.subtitle_style = parseSubtitleStyle(input.subtitle_style);
  if ('editing' in input) recipe.editing = parseEditing(input.editing);
  return recipe;
}
export function parseReusableRecipe(value: unknown, hasSubtitles = false): ProcessingRecipe {
  const recipe = parseProcessingRecipe(value, hasSubtitles);
  if (recipe.editing?.logo) throw new ProcessingError('PROCESSING_PROJECT_MEDIA');
  return recipe;
}

export function requiredModels(recipe: ProcessingRecipe): string[] {
  const keys = new Set<string>();
  if (recipe.ocr) keys.add(`ocr_${recipe.ocr.language}`);
  if (recipe.inpaint) {
    keys.add('inpainting');
    if (recipe.inpaint.target === 'text') keys.add(`ocr_${recipe.inpaint.language}`);
  }
  return [...keys].sort();
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((key) => [key, (v as Record<string, unknown>)[key]]),
        )
      : v,
  );
}

export function sameProcessing(
  a: ProcessingRecipe | undefined,
  b: ProcessingRecipe | undefined,
): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export function parseModelFingerprints(
  value: unknown,
  recipe: ProcessingRecipe,
): ModelFingerprints {
  const expected = requiredModels(recipe);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== expected.join(',')
  ) {
    throw new ProcessingError('INVALID_PROCESSING_MODELS');
  }
  const fingerprints: ModelFingerprints = {};
  for (const key of expected) {
    const digest = (value as Record<string, unknown>)[key];
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new ProcessingError('INVALID_PROCESSING_MODELS');
    }
    fingerprints[key] = digest;
  }
  return fingerprints;
}
