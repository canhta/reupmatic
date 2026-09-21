// The logo preview must mirror the worker's FFmpeg `overlay` placement. This
// drives the real TypeScript -> Python -> FFmpeg bridge with a black source and
// a solid logo, then checks that the rendered logo's bounding box and a sampled
// pixel match the box `logoPreview` computes — preview and export against each
// other, not against a re-statement of the formula.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { logoPreview } from '../../dist-core/editing/logo-preview.js';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

const WIDTH = 320;
const HEIGHT = 180;
const LOGO_WIDTH = 40;
const LOGO_HEIGHT = 20;

// Bottom-right, 25% of the output width, inset 10% of the width, fully opaque.
const PLACEMENT = { anchor: 'bottom-right', margin: 0.1, scale: 0.25, opacity: 1 };

function makeSource(directory) {
  const video = path.join(directory, 'black.mp4');
  execFileSync(FFMPEG, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=black:s=${WIDTH}x${HEIGHT}:r=30:d=1`,
    // A source audio track makes the render merge the logo's video graph with
    // the plain-audio branch in one filter_complex, the path an overlay needs.
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-n',
    video,
  ]);
  return video;
}

function makeColorSource(directory, color) {
  const video = path.join(directory, `source-${color}.mp4`);
  execFileSync(FFMPEG, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=${color}:s=${WIDTH}x${HEIGHT}:r=30:d=1`,
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

/** A logo whose left half is fully transparent and right half blue at 50% alpha. */
function makeAlphaLogo(directory) {
  const logo = path.join(directory, 'alpha-logo.png');
  execFileSync(FFMPEG, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=blue:s=${LOGO_WIDTH}x${LOGO_HEIGHT}`,
    '-vf',
    "format=rgba,geq=r='0':g='0':b='255':a='if(lt(X,20),0,128)'",
    '-frames:v',
    '1',
    '-n',
    logo,
  ]);
  return logo;
}

function makeLogo(directory) {
  const logo = path.join(directory, 'logo.png');
  execFileSync(FFMPEG, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=magenta:s=${LOGO_WIDTH}x${LOGO_HEIGHT}`,
    '-frames:v',
    '1',
    '-n',
    logo,
  ]);
  return logo;
}

function outputFrame(video) {
  return execFileSync(FFMPEG, [
    '-v',
    'error',
    '-i',
    video,
    '-ss',
    '0.5',
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
}

function pixel(buffer, x, y) {
  const offset = (y * WIDTH + x) * 3;
  return [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
}

function isLogoRed([r, g, b]) {
  return r > 180 && b > 180 && g < 90;
}

/** 8-bit encode tolerance: yuv420p rounding plus the blend at the edges. */
function nearColor(actual, expected) {
  return actual.every((value, index) => Math.abs(value - expected[index]) < 48);
}

/** The axis-aligned bounding box of the logo-coloured pixels, in output pixels. */
function logoBounds(buffer) {
  let minX = WIDTH;
  let minY = HEIGHT;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (!isLogoRed(pixel(buffer, x, y))) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function expectedBounds(placement) {
  const box = logoPreview(
    placement,
    { width: LOGO_WIDTH, height: LOGO_HEIGHT },
    { width: WIDTH, height: HEIGHT },
  );
  return {
    minX: Math.round(box.x * WIDTH),
    minY: Math.round(box.y * HEIGHT),
    maxX: Math.round((box.x + box.width) * WIDTH) - 1,
    maxY: Math.round((box.y + box.height) * HEIGHT) - 1,
  };
}

test('the logo preview box agrees with a real worker render', { timeout: 180000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'reupmatic-logo-overlay-'));
  const client = new WorkerClient(
    process.env.PYTHON || 'python3',
    path.join(root, 'worker', 'main.py'),
    path.join(directory, 'workspace'),
  );
  try {
    const source = makeSource(directory);
    const logo = makeLogo(directory);
    const asset = await client.request('asset.register', { path: source, kind: 'video' }).result;
    const image = await client.request('asset.register', { path: logo, kind: 'image' }).result;

    const result = await client.request(
      'media.process',
      {
        asset_id: asset.asset_id,
        mode: 'full',
        encoding: 'review',
        processing: { editing: { logo: PLACEMENT } },
        logo: { asset_id: image.asset_id, sha256: image.sha256 },
      },
      0,
    ).result;

    const frame = outputFrame(result.path);
    const expected = expectedBounds(PLACEMENT);
    const actual = logoBounds(frame);
    for (const edge of ['minX', 'minY', 'maxX', 'maxY']) {
      assert.ok(
        Math.abs(actual[edge] - expected[edge]) <= 3,
        `logo ${edge} is ${actual[edge]}, the preview box says ${expected[edge]}`,
      );
    }

    // A pixel at the box centre is the logo; a pixel well outside it is the black
    // source. This is the sampled-pixel half of the ticket's parity comparison.
    const centre = pixel(
      frame,
      Math.round((expected.minX + expected.maxX) / 2),
      Math.round((expected.minY + expected.maxY) / 2),
    );
    assert.ok(isLogoRed(centre), `the box centre is [${centre}], not the logo colour`);
    const outside = pixel(frame, expected.minX - 8, expected.minY - 8);
    assert.ok(!isLogoRed(outside), `a pixel outside the box is [${outside}]`);

    // The logo is drawn over the whole output, not a single frame: the last frame
    // still carries it.
    const later = outputFrame(result.path);
    assert.ok(
      isLogoRed(
        pixel(
          later,
          Math.round((expected.minX + expected.maxX) / 2),
          Math.round((expected.minY + expected.maxY) / 2),
        ),
      ),
    );

    // Opacity halves the logo over black: the sampled centre is the logo colour at
    // roughly half intensity, matching the preview's own opacity value.
    const faded = await client.request(
      'media.process',
      {
        asset_id: asset.asset_id,
        mode: 'full',
        encoding: 'review',
        processing: { editing: { logo: { ...PLACEMENT, opacity: 0.5 } } },
        logo: { asset_id: image.asset_id, sha256: image.sha256 },
      },
      0,
    ).result;
    const fadedCentre = pixel(
      outputFrame(faded.path),
      Math.round((expected.minX + expected.maxX) / 2),
      Math.round((expected.minY + expected.maxY) / 2),
    );
    assert.ok(
      Math.abs(fadedCentre[0] - 128) < 44 && Math.abs(fadedCentre[2] - 128) < 44,
      `a 0.5-opacity logo centre is [${fadedCentre}], expected half magenta`,
    );
  } finally {
    await client.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('PNG alpha and recipe opacity composite exactly as the preview box says', {
  timeout: 180000,
}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'reupmatic-logo-alpha-'));
  const client = new WorkerClient(
    process.env.PYTHON || 'python3',
    path.join(root, 'worker', 'main.py'),
    path.join(directory, 'workspace'),
  );
  try {
    const source = makeColorSource(directory, '0x00FF00');
    const logo = makeAlphaLogo(directory);
    const asset = await client.request('asset.register', { path: source, kind: 'video' }).result;
    const image = await client.request('asset.register', { path: logo, kind: 'image' }).result;
    const placement = { anchor: 'bottom-right', margin: 0.1, scale: 0.25, opacity: 1 };
    const box = logoPreview(
      placement,
      { width: LOGO_WIDTH, height: LOGO_HEIGHT },
      { width: WIDTH, height: HEIGHT },
    );

    // Sample points come from the preview box: a quarter across its left half (the
    // transparent region) and three quarters (the 50%-alpha region), mid-height.
    const leftX = Math.round((box.x + box.width * 0.25) * WIDTH);
    const rightX = Math.round((box.x + box.width * 0.75) * WIDTH);
    const sampleY = Math.round((box.y + box.height * 0.5) * HEIGHT);
    const background = [0, 255, 0];
    const brand = [0, 0, 255];
    const blend = (alpha) =>
      background.map((value, index) => Math.round(value * (1 - alpha) + brand[index] * alpha));

    async function render(opacity) {
      return client.request(
        'media.process',
        {
          asset_id: asset.asset_id,
          mode: 'full',
          encoding: 'review',
          processing: { editing: { logo: { ...placement, opacity } } },
          logo: { asset_id: image.asset_id, sha256: image.sha256 },
        },
        0,
      ).result;
    }

    const opaque = outputFrame((await render(1)).path);
    const left = pixel(opaque, leftX, sampleY);
    assert.ok(
      nearColor(left, background),
      `the transparent region shows the video pixel [${left}], expected green`,
    );
    const half = pixel(opaque, rightX, sampleY);
    // The image's own alpha (128/255) at full recipe opacity.
    const expectedHalf = blend((128 / 255) * 1);
    assert.ok(
      nearColor(half, expectedHalf),
      `the 50%-alpha region is [${half}], the preview says [${expectedHalf}]`,
    );

    // Opacity below 100% scales both: the transparent region stays background,
    // the half-alpha region blends further toward the video.
    const faded = outputFrame((await render(0.5)).path);
    assert.ok(nearColor(pixel(faded, leftX, sampleY), background));
    const fadedHalf = pixel(faded, rightX, sampleY);
    const expectedFaded = blend((128 / 255) * 0.5);
    assert.ok(
      nearColor(fadedHalf, expectedFaded),
      `at 0.5 opacity the half-alpha region is [${fadedHalf}], expected [${expectedFaded}]`,
    );
    assert.ok(
      fadedHalf[1] > half[1] && fadedHalf[2] < half[2],
      `0.5 opacity shows more video: [${fadedHalf}] vs [${half}]`,
    );
  } finally {
    await client.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
