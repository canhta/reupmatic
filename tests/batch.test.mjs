import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishBatchOutput } from '../dist-core/batch/batch-output.js';
import { BatchQueue } from '../dist-core/batch/batch-queue.js';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { hashFile } from '../dist-core/media/files.js';
import { RemoteError } from '../dist-core/worker/remote-error.js';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const sleep = () => new Promise((resolve) => setTimeout(resolve, 5));
async function until(predicate) {
  const end = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('condition timeout');
    await sleep();
  }
}
async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-batch-'));
  const cleanup = [];
  t.after(async () => {
    try {
      for (const callback of [...cleanup].reverse()) await callback();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
  const directory = await realpath(temp);
  const input = {
    video: { path: path.join(directory, 'nguồn.mp4'), sha256: digest('input'), name: 'nguồn.mp4' },
    output_dir: directory,
    encoding: 'review',
  };
  const store = new BatchStore(path.join(directory, 'queue.sqlite'));
  cleanup.push(() => store.close());
  return { directory, input, store, cleanup };
}

test('SQLite idempotent batch admission keeps one snapshot, rejects reused key with changed data', async (t) => {
  const { store, input } = await fixture(t);
  const original = structuredClone(input);
  const jobs = store.enqueue('request-0001', [input]);
  input.video.name = 'changed';
  assert.equal(jobs.length, 1);
  assert.equal(store.list()[0].input.video.name, 'nguồn.mp4');
  assert.equal(store.enqueue('request-0001', [original])[0].id, jobs[0].id);
  assert.throws(() => store.enqueue('request-0001', [input]), { code: 'DUPLICATE_REQUEST' });
  assert.equal(store.list().length, 1);
});

test('claim increments attempt; explicit retry retains job identity and input', async (t) => {
  const { store, input } = await fixture(t);
  const job = store.enqueue('request-0002', [input])[0];
  assert.equal(store.claim().attempt, 1);
  assert.equal(store.claim(), null);
  store.finish(job.id, 'failed', 'INVALID_MEDIA');
  store.retry(job.id);
  const retried = store.claim();
  assert.equal(retried.id, job.id);
  assert.equal(retried.attempt, 2);
  assert.deepEqual(retried.input, job.input);
  store.finish(job.id, 'complete', null, {
    path: path.join(input.output_dir, 'result.mp4'),
    sha256: digest('output'),
    duration_ms: 2000,
    cache_hit: false,
  });
  assert.throws(() => store.retry(job.id), { code: 'JOB_STATE' });
  assert.equal(store.list().length, 1);
});

test('restart retains queued/done rows and recovers running versus acknowledged cancellation', async (t) => {
  const { store, input, directory, cleanup } = await fixture(t);
  const rows = store.enqueue('request-0003', [input, input, input, input]);
  store.claim();
  store.finish(rows[0].id, 'complete', null, {
    path: path.join(directory, 'done.mp4'),
    sha256: digest('done'),
    duration_ms: 1,
    cache_hit: false,
  });
  store.claim();
  store.claim();
  store.cancel(rows[2].id);
  store.close();
  const reopened = new BatchStore(path.join(directory, 'queue.sqlite'));
  cleanup.push(() => reopened.close());
  assert.equal(reopened.recover(), 2);
  assert.deepEqual(
    reopened.list().map((row) => row.state),
    ['complete', 'interrupted', 'cancelled', 'queued'],
  );
  assert.equal(reopened.recover(), 0);
});

test('invalid batch does not partly enqueue and relative paths are rejected', async (t) => {
  const { store, input } = await fixture(t);
  assert.throws(
    () => store.enqueue('request-0004', [input, { ...input, output_dir: 'relative' }]),
    { code: 'INVALID_REQUEST' },
  );
  assert.equal(store.list().length, 0);
  assert.throws(() => store.enqueue('request-0004', []), { code: 'INVALID_REQUEST' });
});

class ControlledWorker {
  calls = [];
  pending = [];
  constructor(hash) {
    this.hash = hash;
  }
  request(method, params) {
    this.calls.push({ method, params });
    return {
      id: `registration-${this.calls.length}`,
      result: Promise.resolve({ asset_id: `asset-${this.calls.length}`, sha256: this.hash }),
      cancel: async () => ({ requested: true }),
    };
  }
}
class ControlledRenderer extends EventEmitter {
  calls = [];
  activeCount = 0;
  start(input, subtitle, modelFingerprints) {
    let resolve, reject;
    const result = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    this.activeCount++;
    const finish = () => {
      this.activeCount--;
      this.emit('idle');
    };
    const call = {
      input,
      subtitle,
      modelFingerprints,
      resolve: (data) => {
        finish();
        resolve(data);
      },
      reject: (error) => {
        finish();
        reject(error);
      },
    };
    this.calls.push(call);
    return {
      id: input.request_id,
      result,
      cancel: async () => {
        call.reject(new RemoteError('CANCELLED'));
        return { requested: true };
      },
    };
  }
}
async function controlled(t, count = 2) {
  const f = await fixture(t);
  const artifact = path.join(f.directory, 'cache.mp4');
  await writeFile(artifact, 'native-result');
  const renderer = new ControlledRenderer(),
    worker = new ControlledWorker(f.input.video.sha256);
  const queue = new BatchQueue(f.store, worker, renderer);
  queue.enqueue(
    'request-controlled',
    Array.from({ length: count }, () => f.input),
  );
  const output = {
    path: artifact,
    sha256: digest('native-result'),
    artifact_id: 'cache-artifact',
    duration_ms: 2000,
    cache_hit: false,
  };
  f.cleanup.push(async () => {
    queue.beginClose();
    await queue.finishClose();
  });
  return { ...f, renderer, worker, queue, output };
}

test('queue starts paused, isolates a bad item, then exports good item through same renderer', async (t) => {
  const { queue, renderer, output, store } = await controlled(t);
  await sleep();
  assert.equal(renderer.calls.length, 0);
  queue.resume();
  await until(() => renderer.calls.length === 1);
  renderer.calls[0].reject(new RemoteError('INVALID_MEDIA'));
  await until(() => renderer.calls.length === 2);
  renderer.calls[1].resolve(output);
  await until(() => queue.snapshot().items[1].state === 'complete');
  const rows = store.list();
  assert.equal(rows[0].state, 'failed');
  assert.equal(rows[1].state, 'complete');
  assert.equal(await readFile(rows[1].output.path, 'utf8'), 'native-result');
  assert.equal(queue.snapshot().items[1].attempt, 1);
  assert.ok(queue.snapshot().items.every((item) => !('input' in item) && !('path' in item)));
});

test('pause allows current output, keeps next queued; closing the UI is not cancellation', async (t) => {
  const { queue, renderer, output } = await controlled(t);
  queue.resume();
  await until(() => renderer.calls.length === 1);
  queue.pause();
  renderer.calls[0].resolve(output);
  await until(() => queue.snapshot().items[0].state === 'complete');
  assert.equal(renderer.calls.length, 1);
  assert.equal(queue.snapshot().items[1].state, 'queued');
  queue.resume();
  await until(() => renderer.calls.length === 2);
  renderer.calls[1].resolve(output);
  await until(() => queue.snapshot().items[1].state === 'complete');
});

test('cancel running and queued entries; retry never creates a second job', async (t) => {
  const { queue, renderer, output } = await controlled(t);
  const ids = queue.snapshot().items.map((item) => item.id);
  await queue.cancel(ids[1]);
  assert.equal(queue.snapshot().items[1].state, 'cancelled');
  queue.resume();
  await until(() => renderer.calls.length === 1);
  await queue.cancel(ids[0]);
  await until(() => queue.snapshot().items[0].state === 'cancelled');
  queue.retry(ids[0]);
  await until(() => renderer.calls.length === 2);
  renderer.calls[1].resolve(output);
  await until(() => queue.snapshot().items[0].state === 'complete');
  assert.equal(queue.snapshot().items.length, 2);
  assert.equal(queue.snapshot().items[0].attempt, 2);
});

test('a changed source cannot reach render; runtime failure pauses the waiting group', async (t) => {
  const { queue, worker, renderer } = await controlled(t);
  worker.hash = digest('modified');
  queue.resume();
  await until(() => queue.snapshot().items.every((item) => item.state === 'failed'));
  assert.equal(renderer.calls.length, 0);
  assert.ok(queue.snapshot().items.every((item) => item.error_code === 'SOURCE_CHANGED'));
  queue.pause();
  queue.retry(queue.snapshot().items[0].id);
  queue.retry(queue.snapshot().items[1].id);
  worker.request = () => ({
    id: 'failed-runtime',
    result: Promise.reject(new RemoteError('WORKER_EXITED')),
    cancel: async () => ({ requested: false }),
  });
  queue.resume();
  await until(() => queue.snapshot().fault === 'WORKER_EXITED');
  assert.equal(queue.snapshot().paused, true);
  assert.equal(queue.snapshot().items[1].state, 'queued');
});

test('existing preview has dispatch priority before the next batch item', async (t) => {
  const { queue, renderer, output } = await controlled(t, 1);
  renderer.activeCount = 1;
  queue.resume();
  await sleep();
  assert.equal(renderer.calls.length, 0);
  renderer.activeCount = 0;
  renderer.emit('idle');
  await until(() => renderer.calls.length === 1);
  renderer.calls[0].resolve(output);
  await until(() => queue.snapshot().items[0].state === 'complete');
});

test('output commit is exclusive, retries reconcile identical files and preserve conflicts', async (t) => {
  const { directory } = await fixture(t);
  const source = path.join(directory, 'render.mp4');
  await writeFile(source, 'expected');
  const destination = await publishBatchOutput(
    source,
    directory,
    'safe.mp4',
    digest('expected'),
    () => {},
  );
  assert.equal(await hashFile(destination), digest('expected'));
  assert.equal(
    await publishBatchOutput(source, directory, 'safe.mp4', digest('expected'), () => {}),
    destination,
  );
  await writeFile(path.join(directory, 'conflict.mp4'), 'user-owned');
  await assert.rejects(
    publishBatchOutput(source, directory, 'conflict.mp4', digest('expected'), () => {}),
    { code: 'OUTPUT_CONFLICT' },
  );
  assert.equal(await readFile(path.join(directory, 'conflict.mp4'), 'utf8'), 'user-owned');
  await assert.rejects(
    publishBatchOutput(source, directory, '../escape.mp4', digest('expected'), () => {}),
    { code: 'INVALID_REQUEST' },
  );
});

test('cancel before output commit produces no final export, does not delete the source', async (t) => {
  const { directory } = await fixture(t);
  const source = path.join(directory, 'render.mp4');
  await writeFile(source, 'expected');
  await assert.rejects(
    publishBatchOutput(source, directory, 'cancelled.mp4', digest('expected'), () => {
      throw new RemoteError('CANCELLED');
    }),
    { code: 'CANCELLED' },
  );
  await assert.rejects(readFile(path.join(directory, 'cancelled.mp4')), { code: 'ENOENT' });
  assert.equal(await readFile(source, 'utf8'), 'expected');
});

test('queue shutdown retains interrupted state and does not start the next item', async (t) => {
  const { queue, renderer } = await controlled(t);
  queue.resume();
  await until(() => renderer.calls.length === 1);
  queue.beginClose();
  await until(() => queue.snapshot().items[0].state === 'interrupted');
  assert.equal(queue.snapshot().items[1].state, 'queued');
  assert.equal(renderer.calls.length, 1);
});

test('library provenance is durable and part of idempotent batch admission', async (t) => {
  const { directory, input, store, cleanup } = await fixture(t);
  const request = { ...input, library_id: 'library-original-001' };
  const [job] = store.enqueue('library-batch-001', [request]);
  assert.equal(store.get(job.id).input.library_id, request.library_id);
  assert.equal(store.enqueue('library-batch-001', [request])[0].id, job.id);
  assert.throws(
    () => store.enqueue('library-batch-001', [{ ...request, library_id: 'library-separate-002' }]),
    { code: 'DUPLICATE_REQUEST' },
  );
  store.close();
  const reopened = new BatchStore(path.join(directory, 'queue.sqlite'));
  cleanup.push(() => reopened.close());
  assert.equal(reopened.get(job.id).input.library_id, request.library_id);
  assert.throws(
    () => reopened.enqueue('invalid-library-001', [{ ...input, library_id: '../outside' }]),
    { code: 'INVALID_REQUEST' },
  );
});

test('shared queue forwards the saved recipe, model pins and stage progress on every attempt', async (t) => {
  const f = await fixture(t);
  const renderer = new ControlledRenderer(),
    worker = new ControlledWorker(f.input.video.sha256);
  const queue = new BatchQueue(f.store, worker, renderer);
  f.cleanup.push(async () => {
    queue.beginClose();
    await queue.finishClose();
  });
  const processing = {
    version: 1,
    inpaint: {
      target: 'manual',
      padding_px: 4,
      region: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
    },
  };
  const processing_models = { inpainting: digest('exact model') };
  const snapshot = queue.enqueue('processing-queued', [
    { ...f.input, processing, processing_models },
  ]);
  const id = snapshot.items[0].id;
  assert.deepEqual(snapshot.items[0].processing, processing);
  queue.resume();
  await until(() => renderer.calls.length === 1);
  assert.deepEqual(renderer.calls[0].input.processing, processing);
  assert.deepEqual(renderer.calls[0].modelFingerprints, processing_models);
  renderer.emit('job', {
    v: 1,
    id: renderer.calls[0].input.request_id,
    revision: 1,
    event: 'progress',
    data: { phase: 'processingInpaint', fraction: 0.5 },
  });
  assert.deepEqual(queue.snapshot().items[0].progress, {
    phase: 'processingInpaint',
    fraction: 0.5,
  });
  renderer.calls[0].reject(new RemoteError('PROCESSING_MODELS_CHANGED'));
  await until(() => queue.snapshot().items[0].state === 'failed');
  assert.equal(queue.snapshot().paused, false);
  queue.retry(id);
  await until(() => renderer.calls.length === 2);
  assert.deepEqual(renderer.calls[1].modelFingerprints, processing_models);
  await queue.cancel(id);
  await until(() => queue.snapshot().items[0].state === 'cancelled');
});
