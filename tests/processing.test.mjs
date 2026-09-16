import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseModelFingerprints,
  parseProcessingRecipe,
  requiredModels,
} from '../dist-core/processing/recipe.js';

const ocr = { language: 'vi', sample_ms: 500, min_confidence: 0.5 };
const region = { x: 0.1, y: 0.7, width: 0.8, height: 0.2 };

test('recipes are canonical, independent snapshots, not executable configuration', () => {
  const value = { inpaint: { region, padding_px: 4, target: 'manual' }, ocr, version: 1 };
  const copy = parseProcessingRecipe(value);
  assert.deepEqual(Object.keys(copy), ['version', 'ocr', 'inpaint']);
  copy.ocr.language = 'en';
  assert.equal(value.ocr.language, 'vi');
  for (const bad of [
    null,
    [],
    {},
    { version: 2, ocr },
    { version: 1 },
    { version: 1, ocr, command: 'run' },
    { version: 1, ocr: { ...ocr, sample_ms: NaN } },
    { version: 1, inpaint: { target: 'manual', padding_px: 4 } },
    { version: 1, inpaint: { target: 'text', language: 'en', padding_px: 4, region } },
    { version: 1, inpaint: { target: 'manual', padding_px: 4, region: { ...region, width: 1 } } },
  ])
    assert.throws(() => parseProcessingRecipe(bad), /INVALID_PROCESSING/);
});

test('manual subtitles cannot be replaced by automatic OCR', () => {
  assert.throws(
    () => parseProcessingRecipe({ version: 1, ocr }, true),
    /PROCESSING_SUBTITLE_CONFLICT/,
  );
  assert.doesNotThrow(() =>
    parseProcessingRecipe(
      { version: 1, inpaint: { target: 'manual', padding_px: 4, region } },
      true,
    ),
  );
});

test('model snapshots match exactly the requirements of the saved recipe', () => {
  const recipe = { version: 1, ocr, inpaint: { target: 'text', language: 'en', padding_px: 4 } };
  assert.deepEqual(requiredModels(recipe), ['inpainting', 'ocr_en', 'ocr_vi']);
  const models = { ocr_vi: 'a'.repeat(64), inpainting: 'b'.repeat(64), ocr_en: 'c'.repeat(64) };
  assert.deepEqual(Object.keys(parseModelFingerprints(models, recipe)), [
    'inpainting',
    'ocr_en',
    'ocr_vi',
  ]);
  for (const value of [
    {},
    { ...models, ocr_zh: 'a'.repeat(64) },
    { ...models, inpainting: 'bad' },
  ]) {
    assert.throws(() => parseModelFingerprints(value, recipe), /INVALID_PROCESSING_MODELS/);
  }
});
