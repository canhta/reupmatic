import {
  type EditGeometry,
  geometryPreview,
  mapSourceToOutput,
  type SourceSize,
} from '../editing/geometry-preview.js';
import type { Observation } from '../vision/vision.js';
import type { CoverBand } from './style.js';

/** Padding around the detected text, as a percentage of the output frame. */
export const COVER_FIT_PADDING_PCT = 2;
/** Two text boxes belong to one position while their centers stay this close, per axis. */
const POSITION_TOLERANCE_X_PCT = 15;
const POSITION_TOLERANCE_Y_PCT = 6;
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

type Box = [number, number, number, number];

function boxUnion(detections: Observation['detections']): Box | null {
  const boxes = detections.filter((detection) => detection.text.trim());
  if (!boxes.length) return null;
  return [
    Math.min(...boxes.map((detection) => detection.box[0])),
    Math.min(...boxes.map((detection) => detection.box[1])),
    Math.max(...boxes.map((detection) => detection.box[2])),
    Math.max(...boxes.map((detection) => detection.box[3])),
  ];
}

function mergeBox(target: Box, box: Box): Box {
  return [
    Math.min(target[0], box[0]),
    Math.min(target[1], box[1]),
    Math.max(target[2], box[2]),
    Math.max(target[3], box[3]),
  ];
}

/**
 * Cluster each observation's text-box union into distinct on-screen positions, in source-frame
 * percentages, most frequent first. Boxes that jump between two positions stay two clusters
 * instead of one band that covers everything between them.
 */
export function textRegions(
  observations: Observation[],
  width: number,
  height: number,
): TextRegion[] {
  if (width <= 0 || height <= 0) return [];
  const clusters: { anchor: [number, number]; box: Box; count: number }[] = [];
  const xTolerance = (width * POSITION_TOLERANCE_X_PCT) / 100;
  const yTolerance = (height * POSITION_TOLERANCE_Y_PCT) / 100;
  for (const observation of observations) {
    const box = boxUnion(observation.detections);
    if (!box) continue;
    const centerX = (box[0] + box[2]) / 2;
    const centerY = (box[1] + box[3]) / 2;
    const found = clusters.find(
      (cluster) =>
        Math.abs(centerX - cluster.anchor[0]) <= xTolerance &&
        Math.abs(centerY - cluster.anchor[1]) <= yTolerance,
    );
    if (found) {
      found.box = mergeBox(found.box, box);
      found.count += 1;
    } else {
      clusters.push({ anchor: [centerX, centerY], box, count: 1 });
    }
  }
  return clusters
    .map((cluster) => ({
      x_pct: (cluster.box[0] / width) * 100,
      y_pct: (cluster.box[1] / height) * 100,
      width_pct: ((cluster.box[2] - cluster.box[0]) / width) * 100,
      height_pct: ((cluster.box[3] - cluster.box[1]) / height) * 100,
      count: cluster.count,
    }))
    .sort((left, right) => right.count - left.count || left.y_pct - right.y_pct);
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
  const map = (x: number, y: number) =>
    mapSourceToOutput(preview, { x: x / 100, y: y / 100 }) ?? { x: x / 100, y: y / 100 };
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
