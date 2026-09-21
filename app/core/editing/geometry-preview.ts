import type { CropRegion, EditingRecipe } from './edit-recipe.js';

export type EditGeometry = Pick<EditingRecipe, 'crop' | 'flip' | 'rotate' | 'output'>;

export interface SourceSize {
  width: number;
  height: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * The live-preview description of the worker's framing chain, derived from the
 * same recipe the FFmpeg filters consume. The export order is
 * rotate -> crop -> flip -> color -> output scale/pad
 * (worker/media/editing/filters.py), so the preview rotates the source frame
 * first, crops inside the rotated frame, flips the result, then fits it into
 * the output frame.
 *
 * Every value is resolution independent: aspect ratios and percentages, never
 * pixels, so the monitor renders the frame at any size. The worker's
 * `transpose`/`hflip`/`vflip` chain and this CSS transform are two encodings of
 * the same normalized mapping (see `mapOutputToSource`).
 */
export interface GeometryPreview {
  rotate: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** Crop in the rotated frame, normalized to that frame. */
  crop: CropRegion;
  /** Aspect ratio (width/height) of the cropped, rotated content. */
  contentAspect: number;
  /** Aspect ratio (width/height) of the final output frame. */
  outputAspect: number;
  fit: 'contain' | 'cover';
  /** The rendered content size as fractions of the output frame's own axes. */
  contentWidth: number;
  contentHeight: number;
  /** `object-view-box` inset of the source content, in percentages. */
  viewBox: { top: number; right: number; bottom: number; left: number };
  /** CSS transform for the rotator: rotation, then flips in the visual frame. */
  transform: string;
}

const FULL_CROP: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

function ratio(value: NonNullable<EditingRecipe['output']>['aspect'], fallback: number): number {
  if (value === 'source') return fallback;
  const [numerator, denominator] = value.split(':').map(Number);
  return numerator / denominator;
}

/** Clockwise rotation of a normalized point, matching CSS `rotate()`/FFmpeg `transpose=1`. */
function rotatePoint(point: NormalizedPoint, rotate: 0 | 90 | 180 | 270): NormalizedPoint {
  if (rotate === 90) return { x: 1 - point.y, y: point.x };
  if (rotate === 180) return { x: 1 - point.x, y: 1 - point.y };
  if (rotate === 270) return { x: point.y, y: 1 - point.x };
  return point;
}

function unrotatePoint(point: NormalizedPoint, rotate: 0 | 90 | 180 | 270): NormalizedPoint {
  if (rotate === 90) return { x: point.y, y: 1 - point.x };
  if (rotate === 180) return { x: 1 - point.x, y: 1 - point.y };
  if (rotate === 270) return { x: 1 - point.y, y: point.x };
  return point;
}

/** The axis-aligned source rectangle whose clockwise rotation is the crop rectangle. */
function sourceCrop(rotate: 0 | 90 | 180 | 270, crop: CropRegion): CropRegion {
  const { x, y, width, height } = crop;
  if (rotate === 90) return { x: y, y: 1 - x - width, width: height, height: width };
  if (rotate === 180) return { x: 1 - x - width, y: 1 - y - height, width, height };
  if (rotate === 270) return { x: 1 - y - height, y: x, width: height, height: width };
  return crop;
}

/**
 * How large the content sits in the output frame, as fractions of that frame.
 * `contain` letterboxes/pillarboxes the content inside the frame; `cover`
 * overflows it and crops the centre.
 */
function contentBox(preview: Pick<GeometryPreview, 'contentAspect' | 'outputAspect' | 'fit'>) {
  const wide = preview.contentAspect >= preview.outputAspect;
  if (preview.fit === 'contain') {
    return wide
      ? { width: 1, height: preview.outputAspect / preview.contentAspect }
      : { width: preview.contentAspect / preview.outputAspect, height: 1 };
  }
  return wide
    ? { width: preview.contentAspect / preview.outputAspect, height: 1 }
    : { width: 1, height: preview.outputAspect / preview.contentAspect };
}

export function geometryPreview(geometry: EditGeometry, source: SourceSize): GeometryPreview {
  const rotate = geometry.rotate ?? 0;
  const flip = geometry.flip;
  const crop = geometry.crop ?? FULL_CROP;
  const sourceAspect = source.width / source.height;
  const rotatedAspect = rotate === 90 || rotate === 270 ? 1 / sourceAspect : sourceAspect;
  const contentAspect = rotatedAspect * (crop.width / crop.height);
  const output = geometry.output;
  const outputAspect = output ? ratio(output.aspect, contentAspect) : contentAspect;
  const fit = output?.fit ?? 'contain';
  const box = contentBox({ contentAspect, outputAspect, fit });
  const view = sourceCrop(rotate, crop);
  const flips = `${flip === 'vertical' || flip === 'both' ? 'scaleY(-1) ' : ''}${
    flip === 'horizontal' || flip === 'both' ? 'scaleX(-1) ' : ''
  }`;
  return {
    rotate,
    flipHorizontal: flip === 'horizontal' || flip === 'both',
    flipVertical: flip === 'vertical' || flip === 'both',
    crop,
    contentAspect,
    outputAspect,
    fit,
    contentWidth: box.width,
    contentHeight: box.height,
    viewBox: {
      top: view.y * 100,
      right: (1 - view.x - view.width) * 100,
      bottom: (1 - view.y - view.height) * 100,
      left: view.x * 100,
    },
    transform: `${flips}rotate(${rotate}deg)`,
  };
}

/**
 * Where the final output frame samples each pixel from the source frame, in
 * normalized coordinates — the exact inverse of the CSS transform above, and of
 * the FFmpeg rotate/crop/flip chain. Returns null where the output frame is
 * `pad` black. A native render is compared against this mapping.
 */
export function mapOutputToSource(
  preview: GeometryPreview,
  point: NormalizedPoint,
): NormalizedPoint | null {
  const box = contentBox(preview);
  const left = (1 - box.width) / 2;
  const top = (1 - box.height) / 2;
  const u = (point.x - left) / box.width;
  const v = (point.y - top) / box.height;
  if (preview.fit === 'contain' && (u < 0 || u > 1 || v < 0 || v > 1)) return null;
  const flipped = {
    x: preview.flipHorizontal ? 1 - u : u,
    y: preview.flipVertical ? 1 - v : v,
  };
  const { crop } = preview;
  const inRotated = { x: crop.x + flipped.x * crop.width, y: crop.y + flipped.y * crop.height };
  return unrotatePoint(inRotated, preview.rotate);
}

/** The forward mapping: which output-frame point a source point lands on (null when cropped away). */
export function mapSourceToOutput(
  preview: GeometryPreview,
  point: NormalizedPoint,
): NormalizedPoint | null {
  const rotated = rotatePoint(point, preview.rotate);
  const { crop } = preview;
  const u = (rotated.x - crop.x) / crop.width;
  const v = (rotated.y - crop.y) / crop.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const flipped = {
    x: preview.flipHorizontal ? 1 - u : u,
    y: preview.flipVertical ? 1 - v : v,
  };
  const box = contentBox(preview);
  return {
    x: (1 - box.width) / 2 + flipped.x * box.width,
    y: (1 - box.height) / 2 + flipped.y * box.height,
  };
}
