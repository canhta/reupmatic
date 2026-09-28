import type { EditingRecipe } from './edit-recipe.js';

export type EditColor = NonNullable<EditingRecipe['color']>;

/** BT.709 luma weights — the HD default behind the browser's decoded sRGB frame. */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

// Reproduces FFmpeg eq on the browser's decoded RGB frame; derivation assumes BT.709 full range.
export function colorPreviewMatrix(color: EditColor): number[] {
  const [wr, wg, wb] = LUMA;
  const { brightness, contrast, saturation } = color;
  const d = contrast - saturation;
  const offset = 0.5 * (1 - contrast) + brightness;
  return [
    saturation + wr * d,
    wg * d,
    wb * d,
    0,
    offset,
    wr * d,
    saturation + wg * d,
    wb * d,
    0,
    offset,
    wr * d,
    wg * d,
    saturation + wb * d,
    0,
    offset,
    0,
    0,
    0,
    1,
    0,
  ];
}
