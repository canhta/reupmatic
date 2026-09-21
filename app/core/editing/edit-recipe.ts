import { assertCues, type Cue } from '../subtitles/cues.js';

export interface TimeRange {
  start_ms: number;
  end_ms: number;
}
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FadeOptions {
  in_ms: number;
  out_ms: number;
  audio: boolean;
}
export const LOGO_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export type LogoAnchor = (typeof LOGO_ANCHORS)[number];
export interface LogoPlacement {
  media_id?: string;
  anchor: LogoAnchor;
  /** Inset from the anchored edge, as a fraction of the output width. */
  margin: number;
  scale: number;
  opacity: number;
}
export const DEFAULT_LOGO: Omit<LogoPlacement, 'media_id'> = {
  anchor: 'bottom-right',
  margin: 0.04,
  scale: 0.2,
  opacity: 1,
};
export interface EditingRecipe {
  trim?: TimeRange;
  crop?: CropRegion;
  flip?: 'horizontal' | 'vertical' | 'both';
  rotate?: 0 | 90 | 180 | 270;
  fade?: FadeOptions;
  speed?: number;
  color?: { brightness: number; contrast: number; saturation: number };
  audio?: { muted: boolean; gain_db: number };
  logo?: LogoPlacement;
  output?: {
    aspect: 'source' | '9:16' | '16:9' | '1:1' | '4:5';
    fit: 'contain' | 'cover';
    height: 0 | 480 | 720 | 1080 | 1920;
  };
}
export interface EditWindow extends TimeRange {
  speed: number;
  duration_ms: number;
}
const keys = [
  'trim',
  'crop',
  'flip',
  'rotate',
  'fade',
  'speed',
  'color',
  'audio',
  'logo',
  'output',
];

function record(value: unknown, allowed: string[], all = true): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.keys(value).length ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    (all && allowed.some((key) => !(key in value)))
  )
    throw new Error('INVALID_EDITING');
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
    throw new Error('INVALID_EDITING');
  return value;
}
function choice<const T extends string | number>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new Error('INVALID_EDITING');
  return value as T;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value))
    throw new Error('INVALID_EDITING');
  return value;
}
function timeRange(value: unknown): TimeRange {
  const range = record(value, ['start_ms', 'end_ms']);
  const start_ms = number(range.start_ms, 0, 86400000, true);
  const end_ms = number(range.end_ms, start_ms + 1, 86400000, true);
  return { start_ms, end_ms };
}

export function parseEditing(value: unknown): EditingRecipe {
  const input = record(value, keys, false);
  const result: EditingRecipe = {};
  if ('trim' in input) result.trim = timeRange(input.trim);
  if ('crop' in input) {
    const crop = record(input.crop, ['x', 'y', 'width', 'height']);
    const region = {
      x: number(crop.x, 0, 1),
      y: number(crop.y, 0, 1),
      width: number(crop.width, 0.01, 1),
      height: number(crop.height, 0.01, 1),
    };
    if (region.x + region.width > 1 + 1e-9 || region.y + region.height > 1 + 1e-9)
      throw new Error('INVALID_EDITING');
    result.crop = region;
  }
  if ('flip' in input) result.flip = choice(input.flip, ['horizontal', 'vertical', 'both']);
  if ('rotate' in input) result.rotate = choice(input.rotate, [0, 90, 180, 270]);
  if ('fade' in input) {
    const fade = record(input.fade, ['in_ms', 'out_ms', 'audio']);
    if (typeof fade.audio !== 'boolean') throw new Error('INVALID_EDITING');
    result.fade = {
      in_ms: number(fade.in_ms, 0, 86400000, true),
      out_ms: number(fade.out_ms, 0, 86400000, true),
      audio: fade.audio,
    };
    if (result.fade.in_ms + result.fade.out_ms > 86400000) throw new Error('INVALID_EDITING');
  }
  if ('speed' in input) result.speed = number(input.speed, 0.25, 4);
  if ('color' in input) {
    const color = record(input.color, ['brightness', 'contrast', 'saturation']);
    result.color = {
      brightness: number(color.brightness, -1, 1),
      contrast: number(color.contrast, 0, 2),
      saturation: number(color.saturation, 0, 3),
    };
  }
  if ('audio' in input) {
    const audio = record(input.audio, ['muted', 'gain_db']);
    if (typeof audio.muted !== 'boolean') throw new Error('INVALID_EDITING');
    result.audio = { muted: audio.muted, gain_db: number(audio.gain_db, -60, 24) };
  }
  if ('logo' in input) {
    const raw = input.logo as Record<string, unknown>;
    const logo = record(raw, [
      'anchor',
      'margin',
      'scale',
      'opacity',
      ...('media_id' in raw ? ['media_id'] : []),
    ]);
    result.logo = {
      ...('media_id' in logo ? { media_id: identifier(logo.media_id) } : {}),
      anchor: choice(logo.anchor, LOGO_ANCHORS),
      margin: number(logo.margin, 0, 0.5),
      scale: number(logo.scale, 0.01, 1),
      opacity: number(logo.opacity, 0, 1),
    };
  }
  if ('output' in input) {
    const output = record(input.output, ['aspect', 'fit', 'height']);
    result.output = {
      aspect: choice(output.aspect, ['source', '9:16', '16:9', '1:1', '4:5']),
      fit: choice(output.fit, ['contain', 'cover']),
      height: choice(output.height, [0, 480, 720, 1080, 1920]),
    };
  }
  return result;
}

export function resolveEditWindow(
  editing: EditingRecipe | undefined,
  duration: number,
  sample?: TimeRange,
): EditWindow {
  if (!Number.isInteger(duration) || duration < 1 || duration > 86400000)
    throw new Error('EDIT_SOURCE_RANGE');
  const edit = editing ? parseEditing(editing) : {};
  const trim = edit.trim ?? { start_ms: 0, end_ms: duration };
  if (trim.end_ms > duration) throw new Error('EDIT_SOURCE_RANGE');
  if (sample && timeRange(sample).end_ms > duration) throw new Error('EDIT_SOURCE_RANGE');
  const start_ms = Math.max(trim.start_ms, sample?.start_ms ?? 0);
  const end_ms = Math.min(trim.end_ms, sample?.end_ms ?? duration);
  if (end_ms <= start_ms) throw new Error('EDIT_EMPTY_RANGE');
  const speed = edit.speed ?? 1;
  return {
    start_ms,
    end_ms,
    speed,
    duration_ms: Math.max(1, Math.round((end_ms - start_ms) / speed)),
  };
}

export function retimeCues(cues: Cue[], window: EditWindow): Cue[] {
  assertCues(cues);
  const result = cues.flatMap((cue) => {
    const first = Math.max(window.start_ms, cue.start_ms);
    const last = Math.min(window.end_ms, cue.end_ms);
    const start_ms = Math.round((first - window.start_ms) / window.speed);
    const end_ms = Math.min(
      window.duration_ms,
      Math.round((last - window.start_ms) / window.speed),
    );
    return last > first && end_ms > start_ms ? [{ ...cue, start_ms, end_ms }] : [];
  });
  assertCues(result);
  return result;
}
