import type { LogoAnchor, LogoPlacement } from './edit-recipe.js';

export interface LogoSize {
  width: number;
  height: number;
}

/** The logo's box on the output frame, normalized to that frame. */
export interface LogoBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `center` is the only one-word anchor; the rest are `<vertical>-<horizontal>`. */
function anchorAxes(anchor: LogoAnchor): { vertical: string; horizontal: string } {
  if (anchor === 'center') return { vertical: 'middle', horizontal: 'center' };
  const [vertical, horizontal] = anchor.split('-');
  return { vertical, horizontal };
}

/**
 * The live-preview description of the worker's `overlay` placement, derived from
 * the same logo placement the FFmpeg filter consumes
 * (worker/media/editing/filters.py:logo_overlay). The logo width is `scale` of the
 * output width, the height keeps the image ratio, and `margin` insets it from the
 * anchored edge as a fraction of the output width — the same convention both sides
 * use, so a sampled render and this box agree.
 */
export function logoPreview(logo: LogoPlacement, image: LogoSize, output: LogoSize): LogoBox {
  const width = logo.scale;
  const height = logo.scale * (image.height / image.width) * (output.width / output.height);
  const marginX = logo.margin;
  const marginY = logo.margin * (output.width / output.height);
  const { vertical, horizontal } = anchorAxes(logo.anchor);
  const x =
    horizontal === 'left'
      ? marginX
      : horizontal === 'right'
        ? 1 - width - marginX
        : (1 - width) / 2;
  const y =
    vertical === 'top' ? marginY : vertical === 'bottom' ? 1 - height - marginY : (1 - height) / 2;
  return { x, y, width, height };
}
