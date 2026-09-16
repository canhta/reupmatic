import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderTracker } from '../dist-core/rendering/render-tracker.js';

test('a cached result may finish before IPC acknowledgement without returning to queued', () => {
  const tracker = new RenderTracker();
  tracker.begin('request-a', 4);
  assert.equal(tracker.accepts('request-a'), true);
  assert.equal(tracker.finish('request-a'), true);
  assert.equal(tracker.acknowledge('request-a'), false);
  assert.equal(tracker.isCurrentResult('request-a', 4, 4), true);
});
test('a late result is not accepted after subtitle edits', () => {
  const tracker = new RenderTracker();
  tracker.begin('a', 4);
  assert.equal(tracker.isCurrentResult('a', 4, 5), false);
});
test('a superseded request cannot clear the active render', () => {
  const tracker = new RenderTracker();
  tracker.begin('old', 1);
  tracker.begin('new', 1);
  assert.equal(tracker.finish('old'), false);
  assert.equal(tracker.accepts('new'), true);
  assert.equal(tracker.isCurrentResult('old', 1, 1), false);
});
test('duplicate terminal events and acknowledgements do not restart a render', () => {
  const tracker = new RenderTracker();
  tracker.begin('a', 2);
  assert.equal(tracker.acknowledge('a'), true);
  tracker.finish('a');
  assert.equal(tracker.finish('a'), false);
  assert.equal(tracker.accepts('a'), false);
});
