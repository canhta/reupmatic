import type { Cue } from './cues.js';

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
});

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

/** True when one field's value is outside its own type, format or numeric range. */
export function subtitleStyleFieldInvalid(key: keyof SubtitleStyle, value: unknown): boolean {
  if (key === 'font_family')
    return typeof value !== 'string' || !FONT_FAMILY.test(value) || !value.trim();
  if (key === 'bold' || key === 'italic') return typeof value !== 'boolean';
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
  return {
    ...input,
    font_family: String(input.font_family).trim(),
    text_color: String(input.text_color).toUpperCase(),
    outline_color: String(input.outline_color).toUpperCase(),
    box_color: String(input.box_color).toUpperCase(),
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
