import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { BatchQueue } from '../dist-core/batch/batch-queue.js';
import { FolderStore } from '../dist-core/folders/folder-store.js';
import { FolderMonitor } from '../dist-core/folders/folder-monitor.js';
import { WorkerClient } from '../dist-core/worker/worker-client.js';
import { RenderCoordinator } from '../dist-core/rendering/render-coordinator.js';
import { hashFile } from '../dist-core/media/files.js';
import { pythonExecutable } from '../scripts/python.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function until(predicate) {
  const end = Date.now() + 40000;
  while (!predicate()) { if (Date.now() > end) throw new Error('Native intake test timed out'); await new Promise(resolve => setTimeout(resolve, 20)); }
}

test('actual folder reconciliation -> SQLite queue -> Python/FFmpeg -> output, with failed-file isolation', { timeout: 60000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'reupmatic-intake-native-')));
  const source = path.join(dir, 'nguồn'), output = path.join(source, 'bản xuất'), workspace = path.join(dir, 'workspace');
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(workspace);
  const worker = new WorkerClient(pythonExecutable(root), path.join(root, 'worker/main.py'), workspace);
  const renderer = new RenderCoordinator(worker), store = new BatchStore(path.join(workspace, 'batch.sqlite'));
  const queue = new BatchQueue(store, worker, renderer); let now = 0;
  // This exercises filesystem reconciliation, NOT Chokidar OS event delivery.
  const monitor = new FolderMonitor(new FolderStore(path.join(workspace, 'intake.sqlite')), queue, {
    workspace, authorize: () => true, stableMs: 10000, reconcileMs: 0, now: () => now,
    attach: async () => ({ close: async () => {} }),
  });
  try {
    await fs.writeFile(path.join(source, 'bad.mp4'), 'invalid container');
    const good = path.join(source, 'video tự quay.mp4');
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=12:duration=1','-c:v','libx264','-threads','1','-n',good]);
    const original = await hashFile(good);
    const snapshot = await monitor.create({ source_dir: source, output_dir: output, include_existing: true, recursive: true });
    const id = snapshot.rules[0].id;
    await monitor.start(id); assert.equal(store.list().length, 0);
    now += 10001; await monitor.reconcile(id); assert.equal(store.list().length, 2);
    queue.resume(); await until(() => queue.snapshot().items.every(job => ['complete','failed'].includes(job.state)));
    assert.deepEqual(store.list().map(job => job.state), ['failed','complete']);
    const result = store.list()[1].output;
    assert.equal(await hashFile(result.path), result.sha256); assert.equal(await hashFile(good), original);
    const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v','error','-show_streams','-of','json',result.path],{encoding:'utf8'}));
    assert.ok(probe.streams.some(stream => stream.codec_type === 'video'));
    now += 10001; await monitor.reconcile(id); assert.equal(store.list().length, 2);
    assert.equal(monitor.snapshot().rules[0].admitted, 2); // Includes a failed job, not two successful videos.
    assert.equal((await fs.readdir(output)).length, 1);
  } finally {
    await monitor.close(); queue.beginClose(); await renderer.close(); await worker.stop(); await queue.finishClose();
    await fs.rm(dir, { recursive:true,force:true });
  }
});
