import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COVER_FIT_PADDING_PCT,
  fitCoverBand,
  parseTextRegions,
  textRegions,
} from '../../dist-core/subtitles/cover-fit.js';
import { createTextLayers, parseTextLayers } from '../../dist-core/subtitles/layers/document.js';
import { defaultCoverBand } from '../../dist-core/subtitles/style.js';

const detection = (box) => ({ text: 'x', confidence: 0.9, box });
const observation = (start, boxes) => ({
  start_ms: start,
  end_ms: start + 500,
  detections: boxes.map(detection),
});
const base = { ...defaultCoverBand({ font_size_pct: 4.5, position: 2, margin_y_pct: 5 }) };

test('text boxes cluster into distinct on-screen positions, most frequent first', () => {
  const bottom = [100, 800, 400, 850];
  const top = [100, 100, 400, 150];
  const regions = textRegions(
    [observation(0, [bottom]), observation(500, [bottom]), observation(1000, [top])],
    1000,
    1000,
  );
  assert.equal(regions.length, 2);
  assert.deepEqual(regions[0], { x_pct: 10, y_pct: 80, width_pct: 30, height_pct: 5, count: 2 });
  assert.deepEqual(regions[1], { x_pct: 10, y_pct: 10, width_pct: 30, height_pct: 5, count: 1 });
});

test('a union of several boxes is one position and blank samples are ignored', () => {
  const regions = textRegions(
    [
      observation(0, [
        [0, 0, 100, 50],
        [200, 10, 300, 60],
      ]),
      observation(500, []),
    ],
    400,
    200,
  );
  assert.equal(regions.length, 1);
  assert.deepEqual(regions[0], { x_pct: 0, y_pct: 0, width_pct: 75, height_pct: 30, count: 1 });
});

test('region parsing is strict', () => {
  const valid = [{ x_pct: 10, y_pct: 80, width_pct: 30, height_pct: 5, count: 2 }];
  assert.deepEqual(parseTextRegions(valid), valid);
  for (const bad of [
    [{ x_pct: 10, y_pct: 80, width_pct: 30, height_pct: 5, count: 0 }],
    [{ x_pct: 90, y_pct: 80, width_pct: 30, height_pct: 5, count: 2 }],
    [{ x_pct: 10, y_pct: 80, width_pct: 0, height_pct: 5, count: 2 }],
    [{ x_pct: 10, y_pct: 80, width_pct: 30, height_pct: 5 }],
    [{ x_pct: 10, y_pct: 80, width_pct: 30, height_pct: 5, count: 2, extra: 1 }],
    'regions',
  ]) {
    assert.throws(() => parseTextRegions(bad), /INVALID_TEXT_REGIONS/);
  }
});

test('the band fits the dominant position, padded, and reports the others', () => {
  const regions = textRegions(
    [
      observation(0, [[100, 800, 400, 850]]),
      observation(500, [[100, 800, 400, 850]]),
      observation(1000, [[100, 100, 400, 150]]),
    ],
    1000,
    1000,
  );
  const fit = fitCoverBand(regions, {}, { width: 1000, height: 1000 }, base);
  assert.ok(fit);
  assert.deepEqual(fit.band, {
    x_pct: 10 - COVER_FIT_PADDING_PCT,
    y_pct: 80 - COVER_FIT_PADDING_PCT,
    width_pct: 30 + 2 * COVER_FIT_PADDING_PCT,
    height_pct: 5 + 2 * COVER_FIT_PADDING_PCT,
    color: base.color,
    opacity: base.opacity,
  });
  assert.equal(fit.others.length, 1);
  assert.equal(fit.others[0].y_pct, 10);
});

test('the band is clamped to the output frame and never empty', () => {
  const regions = textRegions([observation(0, [[0, 0, 1000, 1000]])], 1000, 1000);
  const fit = fitCoverBand(regions, {}, { width: 1000, height: 1000 }, base);
  assert.ok(fit);
  assert.deepEqual(fit.band, {
    x_pct: 0,
    y_pct: 0,
    width_pct: 100,
    height_pct: 100,
    color: base.color,
    opacity: base.opacity,
  });
});

test('a rotation maps the fitted band through the same geometry as the burn', () => {
  const regions = textRegions([observation(0, [[100, 800, 400, 850]])], 1000, 1000);
  const upright = fitCoverBand(regions, {}, { width: 1000, height: 1000 }, base);
  const rotated = fitCoverBand(regions, { rotate: 90 }, { width: 1000, height: 1000 }, base);
  assert.ok(upright && rotated);
  assert.notDeepEqual(rotated.band, upright.band);
  assert.ok(rotated.band.x_pct + rotated.band.width_pct <= 100 + 1e-9);
  assert.ok(rotated.band.y_pct + rotated.band.height_pct <= 100 + 1e-9);
});

test('an OCR origin carries detected regions through the text-layer contract', () => {
  const layers = createTextLayers();
  layers.displayed.origin = {
    kind: 'ocr',
    request_id: 'request-12345678',
    source_sha256: 'a'.repeat(64),
    start_ms: 0,
    end_ms: 1000,
    regions: [{ x_pct: 10, y_pct: 80, width_pct: 30, height_pct: 5, count: 2 }],
  };
  assert.deepEqual(parseTextLayers(layers).displayed.origin, layers.displayed.origin);
  const malformed = structuredClone(layers);
  malformed.displayed.origin.regions[0].count = 0;
  assert.throws(() => parseTextLayers(malformed), /INVALID_TEXT_LAYERS/);
  // Regions belong to OCR provenance, not to a speech origin.
  const speech = structuredClone(layers);
  speech.transcript.origin = {
    kind: 'stt',
    request_id: 'request-12345678',
    source_sha256: 'a'.repeat(64),
    start_ms: 0,
    end_ms: 1000,
    model_id: 'b'.repeat(64),
    regions: layers.displayed.origin.regions,
  };
  assert.throws(() => parseTextLayers(speech), /INVALID_TEXT_LAYERS/);
});
