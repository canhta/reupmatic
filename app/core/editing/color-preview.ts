import type { EditingRecipe } from './edit-recipe.js';

export type EditColor = NonNullable<EditingRecipe['color']>;

/** BT.709 luma weights — the HD default behind the browser's decoded sRGB frame. */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * The 4x5 matrix (row-major) for an SVG `feColorMatrix type="matrix"` that
 * reproduces FFmpeg `eq` on the browser's decoded RGB frame.
 *
 * `eq` is not a per-channel filter: it runs on the source's YUV planes. Luma
 * becomes `Y' = contrast * (Y - 0.5) + 0.5 + brightness` — brightness is an
 * additive offset, unlike CSS `brightness()`'s multiplier — and each chroma
 * plane becomes `C' = saturation * (C - 0.5) + 0.5`. Scaling chroma around
 * neutral is the same as scaling every channel around its luma, and contrast
 * moves all three channels by the same luma delta, so the RGB equivalent is
 * affine: with `L = wR*r + wG*g + wB*b` and `d = contrast - saturation`,
 *
 *   out = d * L + saturation * in + 0.5 * (1 - contrast) + brightness
 *
 * The `eq` filter itself runs in the source's YUV matrix and range; this
 * preview assumes the HD default (BT.709, full range), which is the space the
 * decoded browser frame is already in. Colorimetry is therefore approximate
 * at the edges, but the filter formula — the ticket's actual bug — is exact.
 */
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
