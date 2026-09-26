import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampEditing,
  parseEditing,
  resolveEditWindow,
  retimeCues,
} from '../../dist-core/editing/edit-recipe.js';
import { parseProcessingRecipe, requiredModels } from '../../dist-core/processing/recipe.js';

const trim = { start_ms: 1000, end_ms: 7000 };
test('editing-only recipes need no model and isolate the caller snapshot', () => {
  const input = { editing: { trim, speed: 2, audio: { muted: false, gain_db: -3 } } };
  const copy = parseProcessingRecipe(input);
  assert.deepEqual(requiredModels(copy), []);
  copy.editing.trim.start_ms = 2000;
  assert.equal(input.editing.trim.start_ms, 1000);
});
test('the Edit tool clamps out-of-range values before they reach the preview', () => {
  const clamped = clampEditing(
    {
      color: { brightness: 2, contrast: 2, saturation: 2 },
      crop: { x: 0.9, y: 0.9, width: 2, height: 2 },
      fade: { in_ms: 9000, out_ms: 9000, audio: false },
      logo: { anchor: 'bottom-right', scale: 2, margin: 0.9, opacity: 2 },
      speed: 9,
      audio: { muted: false, gain_db: 99 },
      trim: { start_ms: 2000, end_ms: 2000 },
    },
    1000,
  );
  assert.deepEqual(clamped, {
    color: { brightness: 1, contrast: 2, saturation: 2 },
    crop: { x: 0, y: 0, width: 1, height: 1 },
    fade: { in_ms: 1000, out_ms: 0, audio: false },
    logo: { anchor: 'bottom-right', scale: 1, margin: 0.5, opacity: 1 },
    speed: 4,
    audio: { muted: false, gain_db: 24 },
    trim: { start_ms: 2000, end_ms: 2001 },
  });
  // The clamped recipe is one the parser accepts.
  assert.deepEqual(parseEditing(clamped), {
    color: clamped.color,
    crop: clamped.crop,
    fade: clamped.fade,
    logo: clamped.logo,
    speed: clamped.speed,
    audio: clamped.audio,
    trim: clamped.trim,
  });
});

test('trim resolves in source time and output duration respects speed', () => {
  const edit = parseEditing({ trim, speed: 2 });
  assert.deepEqual(resolveEditWindow(edit, 10000), {
    start_ms: 1000,
    end_ms: 7000,
    speed: 2,
    duration_ms: 3000,
  });
  assert.throws(() => resolveEditWindow(edit, 6000), /EDIT_SOURCE_RANGE/);
});
test('editing rejects unknown keys, non-finite values and unbounded geometry', () => {
  for (const value of [
    null,
    {},
    { speed: 0 },
    { speed: NaN },
    { speed: true },
    { flip: 'none' },
    { rotate: 45 },
    { rotate: '90' },
    { fade: { in_ms: 100, out_ms: 100, audio: 'yes' } },
    { fade: { in_ms: -1, out_ms: 0, audio: true } },
    { fade: { in_ms: 0, out_ms: 0 } },
    { audio: { muted: 'yes', gain_db: 0 } },
    { audio: { muted: false, gain_db: 30 } },
    { trim: { start_ms: 100, end_ms: 99 } },
    { trim: { start_ms: 0, end_ms: 90000000 } },
    { crop: { x: 0.8, y: 0, width: 0.5, height: 1 } },
    { output: { aspect: '9:16', fit: 'guess', height: 1080 } },
    { color: { brightness: 0, contrast: 1, saturation: Infinity } },
    { command: 'ffmpeg' },
  ]) {
    assert.throws(() => parseEditing(value), /INVALID_EDITING/);
  }
});

test('rotate and fade round trip through the current recipe shape', () => {
  const edit = parseEditing({
    rotate: 90,
    fade: { in_ms: 500, out_ms: 250, audio: true },
  });
  assert.deepEqual(edit, {
    rotate: 90,
    fade: { in_ms: 500, out_ms: 250, audio: true },
  });
  assert.deepEqual(parseEditing({ rotate: 0 }), { rotate: 0 });
});
test('subtitle output is clipped and retimed without changing source cues', () => {
  const cues = [
    { id: 'before', start_ms: 0, end_ms: 500, text: 'before' },
    { id: 'first', start_ms: 500, end_ms: 2000, text: 'Tiếng Việt' },
    { id: 'last', start_ms: 6000, end_ms: 8000, text: 'English' },
  ];
  assert.deepEqual(retimeCues(cues, resolveEditWindow({ trim, speed: 2 }, 10000)), [
    { id: 'first', start_ms: 0, end_ms: 500, text: 'Tiếng Việt' },
    { id: 'last', start_ms: 2500, end_ms: 3000, text: 'English' },
  ]);
  assert.equal(cues[1].start_ms, 500);
});
