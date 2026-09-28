import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COVER_FIT_PADDING_PCT,
  fitCoverBand,
  parseTextRegions,
} from '../../dist-core/subtitles/cover-fit.js';
import { createTextLayers, parseTextLayers } from '../../dist-core/subtitles/layers/document.js';
import { defaultCoverBand } from '../../dist-core/subtitles/style.js';

const region = (x_pct, y_pct, width_pct, height_pct, count = 1) => ({
  x_pct,
  y_pct,
  width_pct,
  height_pct,
  count,
});
const base = { ...defaultCoverBand({ font_size_pct: 4.5, position: 2, margin_y_pct: 5 }) };

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
  const regions = [region(10, 80, 30, 5, 2), region(10, 10, 30, 5, 1)];
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
  const fit = fitCoverBand([region(0, 0, 100, 100)], {}, { width: 1000, height: 1000 }, base);
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
  const regions = [region(10, 80, 30, 5)];
  const upright = fitCoverBand(regions, {}, { width: 1000, height: 1000 }, base);
  const rotated = fitCoverBand(regions, { rotate: 90 }, { width: 1000, height: 1000 }, base);
  assert.ok(upright && rotated);
  assert.notDeepEqual(rotated.band, upright.band);
  assert.ok(rotated.band.x_pct + rotated.band.width_pct <= 100 + 1e-9);
  assert.ok(rotated.band.y_pct + rotated.band.height_pct <= 100 + 1e-9);
});

test('a crop that cuts the subtitle clamps the band to the visible region', () => {
  // The subtitle sits at 80–90% of the source; the crop keeps only the top half.
  const fit = fitCoverBand(
    [region(10, 80, 80, 10)],
    { crop: { x: 0, y: 0, width: 1, height: 0.5 } },
    { width: 1000, height: 1000 },
    base,
  );
  assert.ok(fit);
  // The band may not fall back to source coordinates; it clamps to the crop's bottom edge.
  assert.ok(fit.band.y_pct >= 97 - 1e-9, `band top ${fit.band.y_pct} must reach the crop edge`);
  assert.ok(fit.band.y_pct + fit.band.height_pct <= 100 + 1e-9);
  assert.ok(Math.abs(fit.band.x_pct - (10 - COVER_FIT_PADDING_PCT)) < 1e-6);
});

test('a crop through the subtitle keeps the visible part of the band', () => {
  // The subtitle runs 85–95% of the source; a top-90% crop keeps 85–90%.
  const fit = fitCoverBand(
    [region(10, 85, 80, 10)],
    { crop: { x: 0, y: 0, width: 1, height: 0.9 } },
    { width: 1000, height: 1000 },
    base,
  );
  assert.ok(fit);
  assert.ok(Math.abs(fit.band.y_pct - (85 / 0.9 - COVER_FIT_PADDING_PCT)) < 1e-6);
  assert.ok(
    Math.abs(fit.band.y_pct + fit.band.height_pct - 100) < 1e-6,
    'the band must reach the crop edge, not stop at the source coordinate',
  );
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
