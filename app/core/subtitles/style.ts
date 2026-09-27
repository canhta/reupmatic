import type { Cue } from './cues.js';

/** A solid rectangle drawn under the subtitles to hide burned-in originals. */
export interface CoverBand {
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  color: string;
  opacity: number;
}

export interface SubtitleStyle {
  font_family: string;
  font_size_pct: number;
  text_color: string;
  outline_color: string;
  outline_pct: number;
  shadow_pct: number;
  box_color: string;
  box_opacity: number;
  position: number;
  margin_x_pct: number;
  margin_y_pct: number;
  spacing_pct: number;
  bold: boolean;
  italic: boolean;
  cover: CoverBand | null;
}

export const defaultSubtitleStyle: Readonly<SubtitleStyle> = Object.freeze({
  font_family: 'Arial',
  font_size_pct: 4.5,
  text_color: '#FFFFFF',
  outline_color: '#000000',
  outline_pct: 0.2,
  shadow_pct: 0.1,
  box_color: '#000000',
  box_opacity: 0,
  position: 2,
  margin_x_pct: 6,
  margin_y_pct: 5,
  spacing_pct: 0,
  bold: false,
  italic: false,
  cover: null,
});

/** A full-width band at the subtitle's vertical position: the default when the box is enabled. */
export function defaultCoverBand(
  style: Pick<SubtitleStyle, 'font_size_pct' | 'position' | 'margin_y_pct'>,
): CoverBand {
  const height_pct = Math.min(40, Math.max(6, style.font_size_pct * 2));
  const top = style.margin_y_pct;
  const middle = 50 - height_pct / 2;
  const bottom = 100 - style.margin_y_pct - height_pct;
  const y_pct = style.position >= 7 ? top : style.position >= 4 ? middle : bottom;
  return {
    x_pct: 0,
    y_pct: Math.max(0, Math.min(100 - height_pct, y_pct)),
    width_pct: 100,
    height_pct,
    color: '#000000',
    opacity: 1,
  };
}

const FONT_FAMILY = /^[\p{L}\p{N} _.-]{1,80}$/u;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const STYLE_RANGES: Record<string, [number, number]> = {
  font_size_pct: [1, 15],
  outline_pct: [0, 2],
  shadow_pct: [0, 2],
  box_opacity: [0, 1],
  position: [1, 9],
  margin_x_pct: [0, 40],
  margin_y_pct: [0, 40],
  spacing_pct: [-0.2, 2],
};

function coverBandInvalid(value: unknown): boolean {
  if (value === null) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const cover = value as Record<string, unknown>;
  if (
    Object.keys(cover).length !== 6 ||
    !('x_pct' in cover) ||
    !('y_pct' in cover) ||
    !('width_pct' in cover) ||
    !('height_pct' in cover) ||
    !('color' in cover) ||
    !('opacity' in cover)
  )
    return true;
  const bounded = (field: unknown, min: number, max: number) =>
    typeof field === 'number' && Number.isFinite(field) && field >= min && field <= max;
  if (
    !bounded(cover.x_pct, 0, 100) ||
    !bounded(cover.y_pct, 0, 100) ||
    !bounded(cover.width_pct, Number.MIN_VALUE, 100) ||
    !bounded(cover.height_pct, Number.MIN_VALUE, 100) ||
    !bounded(cover.opacity, 0, 1) ||
    typeof cover.color !== 'string' ||
    !HEX_COLOR.test(cover.color)
  )
    return true;
  return (
    Number(cover.x_pct) + Number(cover.width_pct) > 100 + 1e-9 ||
    Number(cover.y_pct) + Number(cover.height_pct) > 100 + 1e-9
  );
}

/** True when one field's value is outside its own type, format or numeric range. */
export function subtitleStyleFieldInvalid(key: keyof SubtitleStyle, value: unknown): boolean {
  if (key === 'font_family')
    return typeof value !== 'string' || !FONT_FAMILY.test(value) || !value.trim();
  if (key === 'bold' || key === 'italic') return typeof value !== 'boolean';
  if (key === 'cover') return coverBandInvalid(value);
  if (key === 'text_color' || key === 'outline_color' || key === 'box_color')
    return typeof value !== 'string' || !HEX_COLOR.test(value);
  if (key === 'position')
    return typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9;
  const [min, max] = STYLE_RANGES[key] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  return typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max;
}

/** The first field that would fail `parseSubtitleStyle`, or null when the style is valid. */
export function firstInvalidSubtitleStyleField(style: SubtitleStyle): keyof SubtitleStyle | null {
  for (const key of Object.keys(defaultSubtitleStyle) as (keyof SubtitleStyle)[]) {
    if (subtitleStyleFieldInvalid(key, style[key])) return key;
  }
  return null;
}

export function parseSubtitleStyle(value: unknown): SubtitleStyle {
  const fail = () => {
    throw new Error('INVALID_SUBTITLE_STYLE');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const input = value as Record<string, unknown>;
  const keys = Object.keys(defaultSubtitleStyle);
  if (Object.keys(input).length !== keys.length || keys.some((key) => !(key in input)))
    return fail();
  if (firstInvalidSubtitleStyleField(input as unknown as SubtitleStyle)) return fail();
  const cover = input.cover as CoverBand | null;
  return {
    ...input,
    font_family: String(input.font_family).trim(),
    text_color: String(input.text_color).toUpperCase(),
    outline_color: String(input.outline_color).toUpperCase(),
    box_color: String(input.box_color).toUpperCase(),
    cover: cover === null ? null : { ...cover, color: cover.color.toUpperCase() },
  } as unknown as SubtitleStyle;
}

export function applyCueStyle(cues: Cue[], ids: string[], style: SubtitleStyle | undefined): Cue[] {
  const selected = new Set(ids);
  if (!selected.size || ids.some((id) => !cues.some((cue) => cue.id === id)))
    throw new Error('INVALID_CUES');
  const valid = style === undefined ? undefined : parseSubtitleStyle(style);
  return cues.map((cue) => {
    const next = structuredClone(cue);
    if (selected.has(cue.id)) {
      if (valid) next.style = { ...valid };
      else delete next.style;
    }
    return next;
  });
}
