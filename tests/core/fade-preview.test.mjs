import assert from 'node:assert/strict';
import test from 'node:test';
import { fadePreviewOpacity } from '../../dist-core/editing/fade-preview.js';

test('no fade is fully opaque everywhere', () => {
  const fade = { in_ms: 0, out_ms: 0, audio: false };
  for (const time of [0, 500, 1000]) assert.equal(fadePreviewOpacity(fade, time, 1000), 1);
});

test('a head fade ramps from zero to one over its duration', () => {
  const fade = { in_ms: 400, out_ms: 0, audio: false };
  assert.equal(fadePreviewOpacity(fade, 0, 1000), 0);
  assert.equal(fadePreviewOpacity(fade, 100, 1000), 0.25);
  assert.equal(fadePreviewOpacity(fade, 200, 1000), 0.5);
  assert.equal(fadePreviewOpacity(fade, 400, 1000), 1);
  assert.equal(fadePreviewOpacity(fade, 800, 1000), 1);
});

test('a tail fade ramps from one to zero over the output tail', () => {
  const fade = { in_ms: 0, out_ms: 300, audio: false };
  assert.equal(fadePreviewOpacity(fade, 700, 1000), 1);
  assert.equal(fadePreviewOpacity(fade, 850, 1000), 0.5);
  assert.equal(fadePreviewOpacity(fade, 1000, 1000), 0);
});

test('head and tail fades meet without overlap on a short output', () => {
  const fade = { in_ms: 300, out_ms: 300, audio: true };
  assert.equal(fadePreviewOpacity(fade, 0, 1000), 0);
  assert.equal(fadePreviewOpacity(fade, 300, 1000), 1);
  assert.equal(fadePreviewOpacity(fade, 500, 1000), 1);
  assert.equal(fadePreviewOpacity(fade, 700, 1000), 1);
  assert.equal(fadePreviewOpacity(fade, 1000, 1000), 0);
});
