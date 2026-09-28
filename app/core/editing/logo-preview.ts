import type { LogoAnchor, LogoPlacement } from './edit-recipe.js';

export interface LogoSize {
  width: number;
  height: number;
}

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

/** Mirrors the worker's logo_overlay filter; scale and margin are fractions of output width. */
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
