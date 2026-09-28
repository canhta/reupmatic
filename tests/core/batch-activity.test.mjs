import assert from 'node:assert/strict';
import test from 'node:test';
import { batchActivity } from '../../dist-core/batch/batch-activity.js';

const item = (id, state, progress = null) => ({
  id,
  batch_id: 'b',
  name: `${id}.mp4`,
  subtitle_name: null,
  state,
  attempt: 1,
  error_code: null,
  output_name: null,
  progress,
});
const snapshot = (items, extra = {}) => ({
  version: 1,
  paused: false,
  active_id: null,
  recovered: 0,
  fault: null,
  items,
  ...extra,
});

test('the status bar follows the job the queue is running, with its phase and progress', () => {
  const running = item('b', 'running', { phase: 'encoding', fraction: 0.42 });
  const activity = batchActivity(
    snapshot([item('a', 'complete'), running, item('c', 'queued')], { active_id: 'b' }),
  );
  assert.deepEqual(activity, {
    kind: 'running',
    name: 'b.mp4',
    phase: 'encoding',
    percent: 42,
    waiting: 1,
  });
});

test('a running job without a known fraction has no percent', () => {
  const activity = batchActivity(
    snapshot([item('a', 'running', { phase: 'preparing', fraction: null })], { active_id: 'a' }),
  );
  assert.equal(activity.kind, 'running');
  assert.equal(activity.percent, null);
});

test('a paused queue with work left reads as paused, an empty one as idle', () => {
  assert.deepEqual(batchActivity(snapshot([item('a', 'queued')], { paused: true })), {
    kind: 'paused',
    waiting: 1,
  });
  assert.deepEqual(batchActivity(snapshot([item('a', 'complete')])), { kind: 'idle' });
  assert.deepEqual(batchActivity(null), { kind: 'idle' });
});
