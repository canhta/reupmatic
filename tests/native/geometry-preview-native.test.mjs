import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { geometryPreview, mapOutputToSource } from '../../dist-core/editing/geometry-preview.js';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const WIDTH = 320;
const HEIGHT = 180;
const MARGIN = 0.06;

// Quadrants tolerate the worker's even-pixel rounding.
const QUADRANTS = [
  { x: 0, y: 0, color: [255, 0, 0], name: 'red' },
  { x: 0.5, y: 0, color: [0, 255, 0], name: 'green' },
  { x: 0, y: 0.5, color: [0, 0, 255], name: 'blue' },
  { x: 0.5, y: 0.5, color: [255, 255, 0], name: 'yellow' },
];

function sourceColor(point) {
  for (const boundary of [0, 0.5, 1]) {
    if (Math.abs(point.x - boundary) < MARGIN || Math.abs(point.y - boundary) < MARGIN) return null;
  }
  const quadrant = QUADRANTS.find(
    (q) => point.x > q.x && point.x < q.x + 0.5 && point.y > q.y && point.y < q.y + 0.5,
  );
  return quadrant?.color ?? null;
}

function makeSourceVideo(directory) {
  const video = path.join(directory, 'quadrants.mp4');
  const boxes = QUADRANTS.map(
    (q) =>
      `drawbox=x=${q.x * WIDTH}:y=${q.y * HEIGHT}:w=${WIDTH / 2}:h=${HEIGHT / 2}:color=0x${q.color
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('')}:t=fill`,
  ).join(',');
  execFileSync(FFMPEG, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=black:s=${WIDTH}x${HEIGHT}:r=30:d=1`,
    '-vf',
    boxes,
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-n',
    video,
  ]);
  return video;
}

function outputSize(video) {
  const probe = JSON.parse(
    execFileSync(FFPROBE, ['-v', 'error', '-show_streams', '-of', 'json', video], {
      encoding: 'utf8',
    }),
  );
  return { width: probe.streams[0].width, height: probe.streams[0].height };
}

function outputFrame(video, time) {
  const buffer = execFileSync(FFMPEG, [
    '-v',
    'error',
    '-i',
    video,
    '-ss',
    String(time),
    '-frames:v',
    '1',
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
    '-threads',
    '1',
    '-',
  ]);
  return buffer;
}

function pixel(buffer, width, x, y) {
  const offset = (y * width + x) * 3;
  return [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
}

function nearColor(actual, expected) {
  return actual.every((value, index) => Math.abs(value - expected[index]) < 48);
}

const CASES = [
  {
    label: 'rotate 90 + crop + horizontal flip, 9:16 contain',
    editing: {
      rotate: 90,
      crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      flip: 'horizontal',
      output: { aspect: '9:16', fit: 'contain', height: 480 },
    },
  },
  {
    label: 'rotate 180 + vertical flip, 1:1 cover',
    editing: {
      rotate: 180,
      flip: 'vertical',
      output: { aspect: '1:1', fit: 'cover', height: 480 },
    },
  },
  {
    label: 'rotate 270, source aspect',
    editing: { rotate: 270 },
  },
];

test('the preview mapping agrees with a real worker render for rotate, crop and flip', {
  timeout: 180000,
}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'reupmatic-geometry-preview-'));
  const client = new WorkerClient(
    process.env.PYTHON || 'python3',
    path.join(root, 'worker', 'main.py'),
    path.join(directory, 'workspace'),
  );
  try {
    const source = makeSourceVideo(directory);
    const asset = await client.request('asset.register', { path: source, kind: 'video' }).result;
    for (const { label, editing } of CASES) {
      const result = await client.request(
        'media.process',
        {
          asset_id: asset.asset_id,
          mode: 'full',
          encoding: 'review',
          processing: { editing },
        },
        0,
      ).result;
      const preview = geometryPreview(editing, { width: WIDTH, height: HEIGHT });
      const size = outputSize(result.path);
      const frame = outputFrame(result.path, 0.5);
      let checked = 0;
      for (let column = 0; column < 7; column += 1) {
        for (let row = 0; row < 7; row += 1) {
          const fx = (column + 0.5) / 7;
          const fy = (row + 0.5) / 7;
          const expectedSource = mapOutputToSource(preview, { x: fx, y: fy });
          if (!expectedSource) continue;
          const expected = sourceColor(expectedSource);
          if (!expected) continue;
          const actual = pixel(
            frame,
            size.width,
            Math.min(size.width - 1, Math.floor(fx * size.width)),
            Math.min(size.height - 1, Math.floor(fy * size.height)),
          );
          assert.ok(
            nearColor(actual, expected),
            `${label}: output (${fx.toFixed(3)}, ${fy.toFixed(3)}) is [${actual}] but the preview ` +
              `maps it to source (${expectedSource.x.toFixed(3)}, ${expectedSource.y.toFixed(3)}) = [${expected}]`,
          );
          checked += 1;
        }
      }
      assert.ok(checked >= 8, `${label}: expected to sample at least eight content points`);
    }
  } finally {
    await client.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
