import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { RenderCoordinator } from '../dist-core/rendering/render-coordinator.js';

class ControlledWorker extends EventEmitter {
  calls = [];
  request(method, params, revision) {
    let resolve, reject;
    const result = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    const id = `internal-${this.calls.length}`;
    const call = { id, method, params, revision, resolve, reject, cancelled: false };
    this.calls.push(call);
    return {
      id,
      result,
      cancel: async () => {
        call.cancelled = true;
        return { requested: true };
      },
    };
  }
}
const cue = { id: 'cue-1', start_ms: 0, end_ms: 2000, text: 'Tiếng Việt — English' };
const input = (cues = [], id = 'request-0001') => ({
  request_id: id,
  asset_id: 'video-1',
  revision: 2,
  mode: 'sample',
  start_ms: 0,
  end_ms: 2000,
  cues,
});
const output = {
  artifact_id: 'render-1',
  path: '/workspace/test.mp4',
  duration_ms: 2000,
  cache_hit: false,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('empty cues bypass subtitle dependency and finish through the common renderer', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const events = [];
  coordinator.on('job', (event) => events.push(event));
  const ticket = coordinator.start(input());
  assert.equal(worker.calls[0].method, 'media.render');
  assert.equal(worker.calls[0].params.subtitle_id, undefined);
  worker.calls[0].resolve(output);
  assert.deepEqual(await ticket.result, output);
  assert.equal(events.at(-1).id, ticket.id);
  assert.equal(events.at(-1).event, 'result');
  assert.equal(coordinator.activeCount, 0);
  assert.equal((await ticket.cancel()).requested, false);
  await coordinator.close();
});

test('cancel while preparing subtitle prevents dispatch even if preparation wins the race', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const events = [];
  coordinator.on('job', (event) => events.push(event));
  const ticket = coordinator.start(input([cue]));
  assert.equal(coordinator.activeCount, 1);
  assert.equal(worker.calls[0].method, 'subtitles.prepare');
  assert.equal((await ticket.cancel()).requested, true);
  worker.calls[0].resolve({ asset_id: 'sub-1' });
  await assert.rejects(ticket.result, { code: 'CANCELLED' });
  assert.equal(worker.calls.length, 1);
  assert.equal(events.filter((e) => e.event === 'error').length, 1);
  assert.equal(coordinator.activeCount, 0);
  await coordinator.close();
});

test('progress is public-ID correlated during preparation and rendering', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const events = [];
  coordinator.on('job', (event) => events.push(event));
  const original = input([cue]);
  const ticket = coordinator.start(original);
  original.cues[0].text = 'later edit';
  assert.equal(worker.calls[0].params.cues[0].text, 'Tiếng Việt — English');
  worker.emit('message', {
    v: 1,
    id: 'internal-0',
    revision: 2,
    event: 'progress',
    data: { phase: 'queued' },
  });
  worker.calls[0].resolve({ asset_id: 'subtitle-1' });
  await tick();
  assert.equal(worker.calls[1].params.subtitle_id, 'subtitle-1');
  worker.emit('message', {
    v: 1,
    id: 'internal-1',
    revision: 2,
    event: 'progress',
    data: { phase: 'rendering' },
  });
  worker.calls[1].resolve(output);
  await ticket.result;
  assert.equal(events.length, 3);
  assert.ok(events.every((event) => event.id === ticket.id));
  await coordinator.close();
});

test('one failed preparation leaves independent render usable', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const first = coordinator.start(input([{ ...cue }]));
  worker.calls[0].reject(Object.assign(new Error('missing'), { code: 'COMPONENT_MISSING' }));
  await assert.rejects(first.result);
  const second = coordinator.start(input([], 'request-0002'));
  worker.calls[1].resolve(output);
  assert.equal((await second.result).duration_ms, 2000);
  assert.equal(coordinator.activeCount, 0);
  await coordinator.close();
});

test('cancel during render ignores a late artifact and reports cancellation once', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const events = [];
  coordinator.on('job', (event) => events.push(event));
  const ticket = coordinator.start(input());
  await ticket.cancel();
  worker.calls[0].resolve(output);
  await assert.rejects(ticket.result, { code: 'CANCELLED' });
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'error');
  await coordinator.close();
});

test('validation and duplicate public IDs cannot launch native work', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  for (const invalid of [
    null,
    { ...input(), cues: null },
    { ...input(), end_ms: 0 },
    { ...input(), ffmpeg_args: ['-y'] },
    { ...input(), mode: 'full' },
    { ...input(), revision: -1 },
  ]) {
    assert.throws(() => coordinator.start(invalid));
  }
  assert.equal(worker.calls.length, 0);
  const ticket = coordinator.start(input());
  assert.throws(() => coordinator.start(input()), { code: 'DUPLICATE_REQUEST' });
  worker.calls[0].resolve(output);
  await ticket.result;
  assert.throws(() => coordinator.start(input()), { code: 'DUPLICATE_REQUEST' });
  await coordinator.close();
  assert.throws(() => coordinator.start(input([], 'request-0003')), { code: 'WORKER_EXITED' });
});

test('closing coordinator cancels preparation and rejects new dispatch', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const ticket = coordinator.start(input([{ ...cue }]));
  await coordinator.close();
  assert.equal(worker.calls[0].cancelled, true);
  worker.calls[0].resolve({ asset_id: 'sub-1' });
  await assert.rejects(ticket.result, { code: 'CANCELLED' });
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.listenerCount('message'), 0);
});

test('processing snapshots recipe and pins while retaining the public render lifecycle', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const recipe = {
    version: 1,
    inpaint: {
      target: 'manual',
      padding_px: 4,
      region: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
    },
  };
  const pins = { inpainting: 'b'.repeat(64) };
  const events = [];
  coordinator.on('job', (event) => events.push(event));
  const ticket = coordinator.start({ ...input(), processing: recipe }, 'registered-srt', pins);
  recipe.inpaint.padding_px = 10;
  pins.inpainting = 'c'.repeat(64);
  assert.equal(worker.calls[0].method, 'media.process');
  assert.equal(worker.calls[0].params.processing.inpaint.padding_px, 4);
  assert.equal(worker.calls[0].params.model_fingerprints.inpainting, 'b'.repeat(64));
  assert.equal(worker.calls[0].params.subtitle_id, 'registered-srt');
  worker.emit('message', {
    v: 1,
    id: worker.calls[0].id,
    revision: 2,
    event: 'progress',
    data: { phase: 'processingInpaint', fraction: 0.5 },
  });
  assert.equal(events[0].id, ticket.id);
  await ticket.cancel();
  worker.calls[0].resolve(output);
  await assert.rejects(ticket.result, { code: 'CANCELLED' });
  assert.equal(events.filter((event) => event.event === 'error').length, 1);
  await coordinator.close();
});

test('OCR conflicts and unsupported processing encoding fail before any worker request', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const processing = { version: 1, ocr: { language: 'en', sample_ms: 500, min_confidence: 0.5 } };
  assert.throws(
    () => coordinator.start({ ...input([cue]), processing }),
    /PROCESSING_SUBTITLE_CONFLICT/,
  );
  assert.throws(
    () => coordinator.start({ ...input(), processing }, 'registered-srt'),
    /PROCESSING_SUBTITLE_CONFLICT/,
  );
  assert.throws(
    () => coordinator.start({ ...input(), processing, encoding: 'lossless' }),
    /INVALID_PROCESSING/,
  );
  assert.equal(worker.calls.length, 0);
  await coordinator.close();
});

const soundtrack = {
  source: { path: '/music.wav', name: 'music.wav', sha256: 'a'.repeat(64), duration_ms: 3000 },
  mode: 'mix',
  start_ms: 0,
  end_ms: 2000,
  offset_ms: 500,
  gain_db: -6,
  fade_in_ms: 100,
  fade_out_ms: 200,
};

test('soundtrack is snapshotted, registered and dispatched by exact content through the shared renderer', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const original = { ...input(), soundtrack: structuredClone(soundtrack) };
  const ticket = coordinator.start(original);
  assert.equal(worker.calls[0].method, 'asset.register');
  assert.deepEqual(worker.calls[0].params, { path: '/music.wav', kind: 'audio' });
  original.soundtrack.gain_db = 12;
  worker.calls[0].resolve({ asset_id: 'audio-1', sha256: soundtrack.source.sha256 });
  await tick();
  assert.equal(worker.calls[1].method, 'media.render');
  assert.equal(worker.calls[1].params.soundtrack.asset_id, 'audio-1');
  assert.equal(worker.calls[1].params.soundtrack.gain_db, -6);
  assert.equal(worker.calls[1].params.soundtrack.source, undefined);
  worker.calls[1].resolve(output);
  await ticket.result;
  await coordinator.close();
});

test('changed or cancelled audio registration never dispatches encoding', async () => {
  for (const cancel of [false, true]) {
    const worker = new ControlledWorker();
    const coordinator = new RenderCoordinator(worker);
    const ticket = coordinator.start({ ...input(), soundtrack });
    if (cancel) await ticket.cancel();
    worker.calls[0].resolve({
      asset_id: 'audio-1',
      sha256: cancel ? soundtrack.source.sha256 : 'b'.repeat(64),
    });
    await assert.rejects(ticket.result, { code: cancel ? 'CANCELLED' : 'SOURCE_CHANGED' });
    assert.equal(worker.calls.length, 1);
    await coordinator.close();
  }
});

const montage = {
  version: 1,
  canvas: { width: 320, height: 180, fps: 30 },
  clips: [
    {
      id: 'clip-1',
      source: { path: '/first.mp4', name: 'first.mp4', sha256: 'a'.repeat(64), duration_ms: 4000 },
      start_ms: 0,
      end_ms: 2000,
      speed: 1,
    },
    {
      id: 'clip-2',
      source: { path: '/first.mp4', name: 'first.mp4', sha256: 'a'.repeat(64), duration_ms: 4000 },
      start_ms: 2000,
      end_ms: 4000,
      speed: 2,
    },
  ],
};

test('composition dependencies deduplicate registration and use the existing render lifecycle', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  const original = { ...input(), composition: structuredClone(montage) };
  const ticket = coordinator.start(original);
  original.composition.clips.reverse();
  assert.deepEqual(worker.calls[0].params, { path: '/first.mp4', kind: 'video' });
  worker.calls[0].resolve({ asset_id: 'clip-asset-1', sha256: 'a'.repeat(64) });
  await tick();
  assert.equal(worker.calls[1].method, 'media.render');
  const clips = worker.calls[1].params.composition.clips;
  assert.equal(clips[0].id, 'clip-1');
  assert.equal(clips[1].source.asset_id, 'clip-asset-1');
  assert.equal(clips[0].source.path, undefined);
  worker.calls[1].resolve(output);
  await ticket.result;
  await coordinator.close();
});

test('composition dependency changes/cancellation stop before encoding', async () => {
  for (const cancel of [false, true]) {
    const worker = new ControlledWorker();
    const coordinator = new RenderCoordinator(worker);
    const ticket = coordinator.start({ ...input(), composition: montage });
    if (cancel) await ticket.cancel();
    worker.calls[0].resolve({
      asset_id: 'clip-asset-1',
      sha256: cancel ? 'a'.repeat(64) : 'b'.repeat(64),
    });
    await assert.rejects(ticket.result, { code: cancel ? 'CANCELLED' : 'SOURCE_CHANGED' });
    assert.equal(worker.calls.length, 1);
    await coordinator.close();
  }
});

test('unsupported composition AI processing is explicit and cannot start work', async () => {
  const worker = new ControlledWorker();
  const coordinator = new RenderCoordinator(worker);
  assert.throws(
    () =>
      coordinator.start({
        ...input(),
        composition: montage,
        processing: { version: 1, ocr: { language: 'en', sample_ms: 500, min_confidence: 0.5 } },
      }),
    /COMPOSITION_PROCESSING_UNAVAILABLE/,
  );
  assert.equal(worker.calls.length, 0);
  await coordinator.close();
});
