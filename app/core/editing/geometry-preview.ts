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

// Export order is rotate→crop→flip→color→scale/pad.
export interface GeometryPreview {
  rotate: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
  crop: CropRegion;
  contentAspect: number;
  outputAspect: number;
  fit: 'contain' | 'cover';
  contentWidth: number;
  contentHeight: number;
  /** `object-view-box` inset of the source content, in percentages. */
  viewBox: { top: number; right: number; bottom: number; left: number };
  transform: string;
}

const FULL_CROP: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

function ratio(value: NonNullable<EditingRecipe['output']>['aspect'], fallback: number): number {
  if (value === 'source') return fallback;
  const [numerator, denominator] = value.split(':').map(Number);
  return numerator / denominator;
}

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

function sourceCrop(rotate: 0 | 90 | 180 | 270, crop: CropRegion): CropRegion {
  const { x, y, width, height } = crop;
  if (rotate === 90) return { x: y, y: 1 - x - width, width: height, height: width };
  if (rotate === 180) return { x: 1 - x - width, y: 1 - y - height, width, height };
  if (rotate === 270) return { x: 1 - y - height, y: x, width: height, height: width };
  return crop;
}

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
