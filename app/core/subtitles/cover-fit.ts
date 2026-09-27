import {
  type EditGeometry,
  geometryPreview,
  mapSourceToOutput,
  type SourceSize,
  sourceCrop,
} from '../editing/geometry-preview.js';
import type { CoverBand } from './style.js';

/** Padding around the detected text, as a percentage of the output frame. */
export const COVER_FIT_PADDING_PCT = 2;
const MAX_REGIONS = 32;
/** The cover band's own floor, matching the Style fields' minimum. */
const MIN_BAND_PCT = 2;

/** One detected subtitle position: the union of its text boxes in source-frame percentages. */
export interface TextRegion {
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  count: number;
}

export function parseTextRegions(value: unknown): TextRegion[] {
  const fail = () => {
    throw new Error('INVALID_TEXT_REGIONS');
  };
  if (!Array.isArray(value) || value.length > MAX_REGIONS) return fail();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail();
    const region = entry as Record<string, unknown>;
    const keys = ['x_pct', 'y_pct', 'width_pct', 'height_pct', 'count'];
    if (Object.keys(region).length !== keys.length || keys.some((key) => !(key in region)))
      return fail();
    const number = (field: unknown) =>
      typeof field === 'number' && Number.isFinite(field) ? field : fail();
    const x = number(region.x_pct);
    const y = number(region.y_pct);
    const width = number(region.width_pct);
    const height = number(region.height_pct);
    const count = region.count;
    if (
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 100 + 1e-9 ||
      y + height > 100 + 1e-9 ||
      !Number.isInteger(count) ||
      Number(count) < 1 ||
      Number(count) > 100000
    )
      return fail();
    return { x_pct: x, y_pct: y, width_pct: width, height_pct: height, count: Number(count) };
  });
}

export interface CoverFit {
  band: CoverBand;
  dominant: TextRegion;
  others: TextRegion[];
}

/**
 * The band over the dominant position, in output-frame percentages. Rotation, crop and the output
 * scale are mapped through the same geometry the burn uses; other positions are reported so the
 * user can see why one band cannot cover them all.
 */
export function fitCoverBand(
  regions: TextRegion[],
  geometry: EditGeometry | undefined,
  source: SourceSize,
  base: CoverBand,
): CoverFit | null {
  if (!regions.length) return null;
  const dominant = regions[0];
  const preview = geometryPreview(geometry ?? {}, source);
  // Clamp to the visible crop before mapping: a corner outside the crop would otherwise fall back
  // to source-frame coordinates, which are a different frame.
  const view = sourceCrop(preview.rotate, preview.crop);
  const clampToCrop = (value: number, low: number, high: number) =>
    Math.max(low, Math.min(high, value));
  const map = (x: number, y: number) => {
    const point = mapSourceToOutput(preview, {
      x: clampToCrop(x / 100, view.x, view.x + view.width),
      y: clampToCrop(y / 100, view.y, view.y + view.height),
    });
    if (!point) throw new Error('INVALID_GEOMETRY');
    return point;
  };
  const topLeft = map(dominant.x_pct, dominant.y_pct);
  const bottomRight = map(
    dominant.x_pct + dominant.width_pct,
    dominant.y_pct + dominant.height_pct,
  );
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const x0 = clamp(Math.min(topLeft.x, bottomRight.x) * 100 - COVER_FIT_PADDING_PCT);
  const y0 = clamp(Math.min(topLeft.y, bottomRight.y) * 100 - COVER_FIT_PADDING_PCT);
  const x1 = clamp(Math.max(topLeft.x, bottomRight.x) * 100 + COVER_FIT_PADDING_PCT);
  const y1 = clamp(Math.max(topLeft.y, bottomRight.y) * 100 + COVER_FIT_PADDING_PCT);
  const width = Math.min(Math.max(MIN_BAND_PCT, x1 - x0), 100 - x0);
  const height = Math.min(Math.max(MIN_BAND_PCT, y1 - y0), 100 - y0);
  return {
    band: {
      x_pct: x0,
      y_pct: y0,
      width_pct: width,
      height_pct: height,
      color: base.color,
      opacity: base.opacity,
    },
    dominant,
    others: regions.slice(1),
  };
}
