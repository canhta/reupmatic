import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { BatchQueue } from '../dist-core/batch/batch-queue.js';
import { FolderStore } from '../dist-core/folders/folder-store.js';
import { FolderMonitor, collectFiles, within } from '../dist-core/folders/folder-monitor.js';
import { RemoteError } from '../dist-core/worker/remote-error.js';

async function fixture(t, overrides = {}) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'reupmatic-folder-')));
  const source = path.join(dir, 'nguồn video'), output = path.join(source, 'bản xuất'), workspace = path.join(dir, 'workspace');
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(workspace);
  const batchStore = new BatchStore(path.join(workspace, 'batch.sqlite'));
  const renderer = new EventEmitter(); renderer.activeCount = 0;
  renderer.start = () => { throw new Error('Intake test must not render'); };
  const queue = new BatchQueue(batchStore, { request() { throw new Error('Intake test must not use the media worker'); } }, renderer);
  const store = new FolderStore(path.join(workspace, 'intake.sqlite'));
  let now = 0, handlesClosed = 0;
  const options = { workspace, authorize: () => true, stableMs: 10000, reconcileMs: 0, now: () => now,
    attach: async () => ({ close: async () => { handlesClosed++; } }), ...overrides };
  const monitor = new FolderMonitor(store, queue, options);
  const config = { source_dir: source, output_dir: output, include_existing: true, recursive: true };
  t.after(async () => { await monitor.close(); queue.beginClose(); await queue.finishClose(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, source, output, workspace, batchStore, queue, store, monitor, config, options,
    advance() { now += 10001; }, handlesClosed: () => handlesClosed };
}
async function create(f, changes = {}) {
  const result = await f.monitor.create({ ...f.config, ...changes }); return result.rules.at(-1).id;
}

test('folder config saves paused; access gate is checked at create and start', async t => {
  let permitted = true; const f = await fixture(t, { authorize: () => permitted });
  const id = await create(f); assert.equal(f.monitor.snapshot().rules[0].state, 'paused'); assert.equal(f.batchStore.list().length, 0);
  permitted = false;
  await assert.rejects(f.monitor.start(id), { code: 'AUTOMATION_UNAVAILABLE' });
  await assert.rejects(create(f), { code: 'AUTOMATION_UNAVAILABLE' });
});

test('stable file is admitted once; intake does not unpause the shared queue', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.source, 'a.mp4'), 'content');
  const id = await create(f); await f.monitor.start(id);
  assert.equal(f.batchStore.list().length, 0);
  f.advance(); await f.monitor.reconcile(id);
  assert.equal(f.batchStore.list().length, 1); assert.equal(f.queue.snapshot().paused, true);
  f.advance(); await f.monitor.reconcile(id); assert.equal(f.batchStore.list().length, 1);
  assert.equal(f.monitor.snapshot().rules[0].admitted, 1);
});

test('file changed while being observed resets the readiness window', async t => {
  const f = await fixture(t); const filename = path.join(f.source, 'copy.mp4'); await fs.writeFile(filename, 'one');
  const id = await create(f); await f.monitor.start(id); f.advance();
  await fs.appendFile(filename, 'two'); await f.monitor.reconcile(id); assert.equal(f.batchStore.list().length, 0);
  f.advance(); await f.monitor.reconcile(id); assert.equal(f.batchStore.list().length, 1);
});

test('new-only baselines existing path versions, receives later files and changed versions', async t => {
  const f = await fixture(t); const old = path.join(f.source, 'old.mp4'); await fs.writeFile(old, 'old');
  const id = await create(f, { include_existing: false }); await f.monitor.start(id); f.advance(); await f.monitor.reconcile(id);
  assert.equal(f.batchStore.list().length, 0);
  await fs.writeFile(path.join(f.source, 'new.mp4'), 'new'); await f.monitor.reconcile(id); f.advance(); await f.monitor.reconcile(id);
  assert.equal(f.batchStore.list().length, 1);
  await fs.writeFile(old, 'changed old'); await f.monitor.reconcile(id); f.advance(); await f.monitor.reconcile(id);
  assert.equal(f.batchStore.list().length, 2);
});

test('content receipts prevent re-admission of a renamed or copied admitted video', async t => {
  const f = await fixture(t); const original = path.join(f.source, 'one.mp4'); await fs.writeFile(original, 'same media');
  const id = await create(f); await f.monitor.start(id); f.advance(); await f.monitor.reconcile(id);
  await fs.rename(original, path.join(f.source, 'renamed.mp4')); await fs.writeFile(path.join(f.source, 'copy.mov'), 'same media');
  await f.monitor.reconcile(id); f.advance(); await f.monitor.reconcile(id);
  assert.equal(f.batchStore.list().length, 1);
});

test('receipt failure after queue commit retries the same admission ID', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.source, 'a.mp4'), 'content');
  const acknowledge = f.store.acknowledge.bind(f.store); let fail = true;
  f.store.acknowledge = (...args) => { if (fail) { fail = false; throw new RemoteError('STORAGE_FAILED'); } return acknowledge(...args); };
  const id = await create(f); await f.monitor.start(id); f.advance(); await f.monitor.reconcile(id);
  const jobId = f.batchStore.list()[0].id; assert.equal(f.monitor.snapshot().rules[0].admitted, 0);
  await f.monitor.reconcile(id); assert.equal(f.batchStore.list().length, 1);
  assert.equal(f.batchStore.list()[0].id, jobId); assert.equal(f.monitor.snapshot().rules[0].admitted, 1);
});

test('pause stops new intake without cancelling accepted jobs', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.source, 'a.mp4'), 'content');
  const id = await create(f); await f.monitor.start(id); f.advance(); await f.monitor.reconcile(id);
  await f.monitor.pause(id); await fs.writeFile(path.join(f.source, 'b.mp4'), 'other'); await f.monitor.reconcile(id);
  assert.equal(f.monitor.snapshot().rules[0].state, 'paused'); assert.equal(f.batchStore.list()[0].state, 'queued');
  assert.equal(f.batchStore.list().length, 1); assert.equal(f.handlesClosed(), 1);
});

test('restart preserves baseline/receipts, stays paused, then admits files missed while off', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.source, 'old.mp4'), 'old');
  const id = await create(f, { include_existing: false }); await f.monitor.start(id); await f.monitor.close();
  await fs.writeFile(path.join(f.source, 'offline.mp4'), 'offline arrival');
  const store = new FolderStore(path.join(f.workspace, 'intake.sqlite'));
  const monitor = new FolderMonitor(store, f.queue, f.options);
  try {
    assert.equal(monitor.snapshot().rules[0].state, 'paused'); await monitor.start(id); f.advance(); await monitor.reconcile(id);
    assert.equal(f.batchStore.list().length, 1); assert.equal(f.batchStore.list()[0].input.video.name, 'offline.mp4');
  } finally { await monitor.close(); }
});

test('scan skips output subtrees, hidden/partial files, symlinks, and known generated files', async t => {
  const f = await fixture(t); const child = path.join(f.source, 'child'); await fs.mkdir(child);
  await fs.writeFile(path.join(f.source, 'ok.mp4'), 'ok'); await fs.writeFile(path.join(child, 'nested.mov'), 'nested');
  for (const name of ['.hidden.mp4', 'copy.mp4.partial', 'notes.txt', 'known.mp4']) await fs.writeFile(path.join(f.source, name), 'ignore');
  await fs.writeFile(path.join(f.output, 'export.mp4'), 'export');
  await fs.symlink(path.join(f.source, 'ok.mp4'), path.join(f.source, 'link.mp4'));
  const files = await collectFiles(f.config, [f.output, f.workspace], new Set([path.join(f.source, 'known.mp4')]));
  assert.deepEqual(files.map(value => path.basename(value.path)).sort(), ['nested.mov', 'ok.mp4']);
  const shallow = await collectFiles({ ...f.config, recursive: false }, [f.output], new Set([path.join(f.source, 'known.mp4')]));
  assert.deepEqual(shallow.map(value => path.basename(value.path)), ['ok.mp4']);
});

test('reject equal roots, source inside output and linked automation loops', async t => {
  const f = await fixture(t);
  await assert.rejects(create(f, { output_dir: f.source }), { code: 'WATCH_OUTPUT_LOOP' });
  await assert.rejects(create(f, { source_dir: f.output, output_dir: f.source }), { code: 'WATCH_OUTPUT_LOOP' });
  await create(f);
  const other = path.join(f.dir, 'other'); await fs.mkdir(other);
  await assert.rejects(f.monitor.create({ ...f.config, source_dir: f.output, output_dir: other }), { code: 'WATCH_OUTPUT_LOOP' });
  assert.equal(within('/x/in', '/x/input/a.mp4'), false);
});

test('pause during async watcher attachment closes the late handle and admits nothing', async t => {
  let release, entered; const started = new Promise(resolve => { entered = resolve; }); let closed = 0;
  const f = await fixture(t, { attach: async () => { entered(); return new Promise(resolve => { release = () => resolve({ close: async () => { closed++; } }); }); } });
  const id = await create(f); const pending = f.monitor.start(id); await started; await f.monitor.pause(id); release(); await pending;
  assert.equal(closed, 1); assert.equal(f.monitor.snapshot().rules[0].state, 'paused'); assert.equal(f.batchStore.list().length, 0);
});

test('shutdown waits for a pending attachment before closing storage', async t => {
  let release, entered; const started = new Promise(resolve => { entered = resolve; }); let closed = 0;
  const f = await fixture(t, { attach: async () => { entered(); return new Promise(resolve => { release = () => resolve({ close: async () => { closed++; } }); }); } });
  const id = await create(f); const pending = f.monitor.start(id); await started;
  const closing = f.monitor.close(); release(); await pending; await closing;
  assert.equal(closed, 1); assert.equal(f.batchStore.list().length, 0);
});

test('missing source reports needs-attention, keeps queued data, can recover after restore', async t => {
  const f = await fixture(t); const id = await create(f); await f.monitor.start(id);
  const moved = path.join(f.dir, 'moved'); await fs.rename(f.source, moved); await f.monitor.reconcile(id);
  assert.equal(f.monitor.snapshot().rules[0].state, 'needs_attention');
  await fs.rename(moved, f.source); await f.monitor.reconcile(id);
  assert.equal(f.monitor.snapshot().rules[0].state, 'watching');
});

test('folder processing recipe and original model pins reach the existing queue only once', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, 'local.mp4'), 'source content');
  const processing = { version: 1, inpaint: { target: 'manual', padding_px: 4,
    region: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 } } };
  const processing_models = { inpainting: 'b'.repeat(64) };
  const id = await create(f, { processing, processing_models });
  assert.deepEqual(f.monitor.snapshot().rules[0].processing, processing);
  await f.monitor.start(id); f.advance(); await f.monitor.reconcile(id);
  const job = f.batchStore.list()[0];
  assert.deepEqual(job.input.processing, processing);
  assert.deepEqual(job.input.processing_models, processing_models);
  f.advance(); await f.monitor.reconcile(id);
  assert.equal(f.batchStore.list().length, 1);
  assert.equal(f.queue.snapshot().paused, true);
});
