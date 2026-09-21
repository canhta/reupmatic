import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { colorPreviewMatrix } from '../../dist-core/editing/color-preview.js';

const WIDTH = 96;
const HEIGHT = 64;
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// Both pinned to full-range BT.709, so only FFmpeg's rounding differs.
const FULL_RANGE_BT709 =
  'scale=in_range=full:out_range=full:in_color_matrix=bt709:out_color_matrix=bt709';

function sourceFrame() {
  const frame = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    frame[pixel * 3] = 32 + ((pixel * 37) % 176);
    frame[pixel * 3 + 1] = 32 + ((pixel * 61 + 48) % 176);
    frame[pixel * 3 + 2] = 32 + ((pixel * 89 + 96) % 176);
  }
  return frame;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function applyPreview(matrix, frame) {
  const out = Buffer.alloc(frame.length);
  for (let pixel = 0; pixel < frame.length; pixel += 3) {
    const r = frame[pixel] / 255;
    const g = frame[pixel + 1] / 255;
    const b = frame[pixel + 2] / 255;
    out[pixel] = clampByte(matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[4]);
    out[pixel + 1] = clampByte(matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[9]);
    out[pixel + 2] = clampByte(matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[14]);
  }
  return out;
}

function renderedFrame(sourcePath, outputPath, color) {
  const filter = [
    FULL_RANGE_BT709,
    'format=yuv444p',
    `eq=brightness=${color.brightness}:contrast=${color.contrast}:saturation=${color.saturation}`,
    FULL_RANGE_BT709,
    'format=rgb24',
  ].join(',');
  execFileSync(FFMPEG, [
    '-v',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-s',
    `${WIDTH}x${HEIGHT}`,
    '-i',
    sourcePath,
    '-vf',
    filter,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    outputPath,
  ]);
}

function errorStats(actual, expected) {
  let sum = 0;
  let max = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const delta = Math.abs(actual[index] - expected[index]);
    sum += delta;
    if (delta > max) max = delta;
  }
  return { mean: sum / actual.length, max };
}

// Models FFmpeg eq's exact brightness formula; paths agree within the stated tolerance.
const MEAN_TOLERANCE = 5;
const MAX_TOLERANCE = 10;

const settings = [
  { label: 'brightness +0.2', brightness: 0.2, contrast: 1, saturation: 1 },
  { label: 'brightness -0.2', brightness: -0.2, contrast: 1, saturation: 1 },
  { label: 'contrast 0.7', brightness: 0, contrast: 0.7, saturation: 1 },
  { label: 'contrast 1.4', brightness: 0, contrast: 1.4, saturation: 1 },
  { label: 'saturation 0', brightness: 0, contrast: 1, saturation: 0 },
  { label: 'saturation 1.8', brightness: 0, contrast: 1, saturation: 1.8 },
  { label: 'combined', brightness: 0.1, contrast: 0.8, saturation: 1.6 },
];

test('preview matrix matches a real FFmpeg eq render within tolerance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-color-preview-'));
  try {
    const source = sourceFrame();
    const sourcePath = path.join(dir, 'source.rgb');
    await writeFile(sourcePath, source);

    for (const { label, ...color } of settings) {
      const outputPath = path.join(dir, 'rendered.rgb');
      renderedFrame(sourcePath, outputPath, color);
      const expected = await readFile(outputPath);
      const actual = applyPreview(colorPreviewMatrix(color), source);
      const stats = errorStats(actual, expected);
      assert.ok(
        stats.mean <= MEAN_TOLERANCE && stats.max <= MAX_TOLERANCE,
        `${label}: preview differs from FFmpeg eq (mean ${stats.mean.toFixed(2)}, max ${stats.max}); tolerance mean ${MEAN_TOLERANCE}, max ${MAX_TOLERANCE}`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
