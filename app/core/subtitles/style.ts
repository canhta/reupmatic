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

export function parseSubtitleStyle(value: unknown): SubtitleStyle {
  const fail = () => {
    throw new Error('INVALID_SUBTITLE_STYLE');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const input = value as Record<string, unknown>;
  const keys = Object.keys(defaultSubtitleStyle);
  if (Object.keys(input).length !== keys.length || keys.some((key) => !(key in input)))
    return fail();
  if (
    typeof input.font_family !== 'string' ||
    !/^[\p{L}\p{N} _.-]{1,80}$/u.test(input.font_family) ||
    !input.font_family.trim() ||
    typeof input.bold !== 'boolean' ||
    typeof input.italic !== 'boolean'
  )
    return fail();
  for (const key of ['text_color', 'outline_color', 'box_color']) {
    if (typeof input[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input[key])) return fail();
  }
  const ranges: Record<string, [number, number]> = {
    font_size_pct: [1, 15],
    outline_pct: [0, 2],
    shadow_pct: [0, 2],
    box_opacity: [0, 1],
    position: [1, 9],
    margin_x_pct: [0, 40],
    margin_y_pct: [0, 40],
    spacing_pct: [-0.2, 2],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const field = input[key];
    if (typeof field !== 'number' || !Number.isFinite(field) || field < min || field > max)
      return fail();
  }
  if (!Number.isInteger(input.position)) return fail();
  return {
    ...input,
    font_family: input.font_family.trim(),
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
