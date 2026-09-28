import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseModelFingerprints,
  parseProcessingRecipe,
  requiredModels,
  sameProcessing,
} from '../../dist-core/processing/recipe.js';

const ocr = { language: 'vi', sample_ms: 500, min_confidence: 0.5 };

test('recipes are canonical, independent snapshots, not executable configuration', () => {
  const value = { ocr };
  const copy = parseProcessingRecipe(value);
  assert.deepEqual(Object.keys(copy).sort(), ['ocr']);
  copy.ocr.language = 'en';
  assert.equal(value.ocr.language, 'vi');
  for (const bad of [
    null,
    [],
    {},
    { ocr, command: 'run' },
    { ocr: { ...ocr, sample_ms: NaN } },
    { inpaint: { target: 'text', language: 'en', padding_px: 4 } },
    {
      inpaint: {
        target: 'manual',
        padding_px: 4,
        region: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
      },
    },
  ])
    assert.throws(() => parseProcessingRecipe(bad), /INVALID_PROCESSING/);
});

test('manual subtitles cannot be replaced by automatic OCR', () => {
  assert.throws(() => parseProcessingRecipe({ ocr }, true), /PROCESSING_SUBTITLE_CONFLICT/);
  assert.doesNotThrow(() => parseProcessingRecipe({ editing: { speed: 2 } }, true));
});

test('model snapshots match exactly the requirements of the saved recipe', () => {
  const recipe = { ocr };
  assert.deepEqual(requiredModels(recipe), ['ocr_vi']);
  const models = { ocr_vi: 'a'.repeat(64) };
  assert.deepEqual(Object.keys(parseModelFingerprints(models, recipe)), ['ocr_vi']);
  for (const value of [
    {},
    { ...models, ocr_zh: 'a'.repeat(64) },
    { ...models, ocr_vi: 'bad' },
    { ...models, inpainting: 'a'.repeat(64) },
  ]) {
    assert.throws(() => parseModelFingerprints(value, recipe), /INVALID_PROCESSING_MODELS/);
  }
});

test('recipe equality is by content, not object identity or key order (the "· modified" label)', () => {
  const a = { ocr };
  const b = { ocr: { ...ocr } };
  assert.equal(sameProcessing(a, b), true);
  assert.equal(sameProcessing(a, { ...a, ocr: { ...ocr, language: 'en' } }), false);
  assert.equal(sameProcessing(undefined, undefined), true);
  assert.equal(sameProcessing(a, undefined), false);
  // Undoing back to the exact applied content reads as unmodified again, not "modified" forever.
  const applied = structuredClone(a);
  const edited = { ...structuredClone(a), ocr: { ...ocr, sample_ms: 800 } };
  const undone = structuredClone(applied);
  assert.equal(sameProcessing(edited, applied), false);
  assert.equal(sameProcessing(undone, applied), true);
});
