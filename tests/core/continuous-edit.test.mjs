import assert from 'node:assert/strict';
import test from 'node:test';
import { latestPerFrame } from '../../dist-core/projects/continuous-edit.js';

function fakeFrames() {
  const queue = new Map();
  let next = 1;
  return {
    request(callback) {
      queue.set(next, callback);
      return next++;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    get scheduled() {
      return queue.size;
    },
    tick() {
      const due = [...queue.values()];
      queue.clear();
      for (const callback of due) callback();
    },
  };
}

test('a drag delivers at most one value per frame, always the latest', () => {
  const frames = fakeFrames();
  const delivered = [];
  const edit = latestPerFrame((value) => delivered.push(value), frames);
  for (const value of ['#000001', '#000002', '#000003']) edit.push(value);
  assert.equal(frames.scheduled, 1);
  assert.deepEqual(delivered, []);
  frames.tick();
  assert.deepEqual(delivered, ['#000003']);
  frames.tick();
  assert.deepEqual(delivered, ['#000003'], 'an idle frame delivers nothing');
  edit.push('#000004');
  edit.push('#000005');
  frames.tick();
  assert.deepEqual(delivered, ['#000003', '#000005']);
});

test('ending a pick delivers the pending value at once and never twice', () => {
  const frames = fakeFrames();
  const delivered = [];
  const edit = latestPerFrame((value) => delivered.push(value), frames);
  edit.push(1);
  edit.push(2);
  edit.flush();
  assert.deepEqual(delivered, [2]);
  assert.equal(frames.scheduled, 0, 'the frame that would deliver it again is cancelled');
  frames.tick();
  edit.flush();
  assert.deepEqual(delivered, [2]);
});

test('cancel drops the pending value', () => {
  const frames = fakeFrames();
  const delivered = [];
  const edit = latestPerFrame((value) => delivered.push(value), frames);
  edit.push(1);
  edit.cancel();
  frames.tick();
  edit.flush();
  assert.deepEqual(delivered, []);
});
