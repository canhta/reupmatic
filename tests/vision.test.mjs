import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { canApplyOcr } from '../dist-core/vision/ocr-draft.js';
import { parseVisionInput, VisionCoordinator } from '../dist-core/vision/vision.js';

const input = (id = 'vision-request-001') => ({
  request_id: id,
  revision: 4,
  method: 'media.ocr',
  params: {
    asset_id: 'video-1',
    start_ms: 1000,
    end_ms: 2000,
    language: 'vi',
    sample_ms: 500,
    min_confidence: 0.5,
  },
});
const output = () => ({
  kind: 'ocr',
  asset_id: 'video-1',
  source_sha256: 'a'.repeat(64),
  start_ms: 1000,
  end_ms: 2000,
  language: 'vi',
  sample_ms: 500,
  width: 160,
  height: 90,
  analysis_id: 'analysis-1',
  observations: [],
  cues: [{ id: 'cue-1', start_ms: 1000, end_ms: 1500, text: 'Tiếng Việt' }],
});
class WorkerDouble extends EventEmitter {
  queue = [];
  request() {
    let resolve, reject;
    const result = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const id = `worker-${this.queue.length}`;
    const task = { id, result, resolve, reject, cancel: async () => ({ requested: true }) };
    this.queue.push(task);
    return task;
  }
}
test('vision validates bounded requests and preserves content language', () => {
  const value = input();
  assert.deepEqual(parseVisionInput(value), value);
  for (const patch of [
    { shell: 'echo' },
    { sample_ms: true },
    { min_confidence: NaN },
    { language: 'xx' },
    { end_ms: 150000 },
    { start_ms: -1 },
    { region: { x: 0, y: 0, width: 2, height: 1 } },
  ]) {
    assert.throws(() => parseVisionInput({ ...value, params: { ...value.params, ...patch } }));
  }
  assert.throws(() => parseVisionInput({ ...value, method: 'models.install' }));
  assert.throws(() => parseVisionInput({ ...value, revision: Infinity }));
});
test('manual masks require coordinates; automatic text masks do not require review', () => {
  const p = { asset_id: 'a', start_ms: 0, end_ms: 1000, target: 'manual', padding_px: 2 };
  assert.throws(() => parseVisionInput({ ...input(), method: 'media.inpaint', params: p }));
  assert.equal(
    parseVisionInput({
      ...input(),
      method: 'media.inpaint',
      params: { ...p, region: { x: 0, y: 0, width: 1, height: 1 } },
    }).params.target,
    'manual',
  );
  assert.equal(
    parseVisionInput({
      ...input(),
      method: 'media.inpaint',
      params: { ...p, target: 'text', language: 'en' },
    }).params.target,
    'text',
  );
});
test('OCR draft cannot replace edits or follow a different source', () => {
  assert.equal(canApplyOcr(output(), 4, 'video-1', 4), true);
  assert.equal(canApplyOcr(output(), 4, 'video-1', 5), false);
  assert.equal(canApplyOcr(output(), 4, 'video-2', 4), false);
});
test('vision completion uses public ID and original revision', async () => {
  const worker = new WorkerDouble(),
    coordinator = new VisionCoordinator(worker),
    events = [];
  coordinator.on('job', (m) => events.push(m));
  const task = coordinator.start(input());
  worker.emit('message', {
    v: 1,
    id: worker.queue[0].id,
    revision: 4,
    event: 'progress',
    data: { phase: 'visionRecognizing', fraction: 0.5 },
  });
  worker.queue[0].resolve(output());
  assert.equal((await task.result).cues[0].text, 'Tiếng Việt');
  assert.equal(events.length, 2);
  assert.ok(events.every((m) => m.id === task.id && m.revision === 4));
  assert.equal(coordinator.activeCount, 0);
  await coordinator.close();
});
test('cancel wins over late successful inference and emits exactly one terminal event', async () => {
  const worker = new WorkerDouble(),
    coordinator = new VisionCoordinator(worker),
    events = [];
  coordinator.on('job', (m) => events.push(m));
  const task = coordinator.start(input());
  await task.cancel();
  worker.queue[0].resolve(output());
  await assert.rejects(task.result, /CANCELLED/);
  assert.equal(events.filter((m) => m.event === 'result').length, 0);
  assert.equal(events.filter((m) => m.event === 'error').length, 1);
  assert.deepEqual(await task.cancel(), { requested: false });
  await coordinator.close();
});
test('malformed model results do not escape the coordinator', async () => {
  const worker = new WorkerDouble(),
    coordinator = new VisionCoordinator(worker);
  const task = coordinator.start(input());
  worker.queue[0].resolve({ ...output(), asset_id: 'other' });
  await assert.rejects(task.result, /INVALID_WORKER_RESPONSE/);
  await coordinator.close();
});
test('out-of-range evidence is rejected and the next operation can run', async () => {
  const worker = new WorkerDouble(),
    coordinator = new VisionCoordinator(worker);
  const first = coordinator.start(input());
  worker.queue[0].resolve({
    ...output(),
    observations: [
      {
        start_ms: 1000,
        end_ms: 1500,
        detections: [{ text: 'x', confidence: 0.9, box: [0, 0, 900, 90] }],
      },
    ],
  });
  await assert.rejects(first.result, /INVALID_WORKER_RESPONSE/);
  const next = coordinator.start(input('vision-request-002'));
  worker.queue[1].resolve(output());
  assert.equal((await next.result).kind, 'ocr');
  await coordinator.close();
});
test('duplicate admissions and admissions after shutdown are refused', async () => {
  const worker = new WorkerDouble(),
    coordinator = new VisionCoordinator(worker);
  const task = coordinator.start(input());
  assert.throws(() => coordinator.start(input()), /DUPLICATE_REQUEST/);
  await coordinator.close();
  worker.queue[0].resolve(output());
  await assert.rejects(task.result, /CANCELLED/);
  assert.throws(() => coordinator.start(input('vision-request-003')), /WORKER_EXITED/);
  assert.equal(worker.listenerCount('message'), 0);
});
