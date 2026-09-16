import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { BatchQueue } from '../dist-core/batch/batch-queue.js';
import { WorkerClient } from '../dist-core/worker/worker-client.js';
import { RenderCoordinator } from '../dist-core/rendering/render-coordinator.js';
import { hashFile } from '../dist-core/media/files.js';
import { pythonExecutable } from '../scripts/python.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function waitFor(predicate) {
  const end = Date.now() + 40000;
  while (!predicate()) { if (Date.now() > end) throw new Error('native queue timeout'); await new Promise(resolve => setTimeout(resolve, 20)); }
}

test('actual SQLite batch -> shared Python/FFmpeg -> folder; restart retains outputs and revalidates inputs', { timeout: 60000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-native-batch-'));
  const dir = await realpath(temporary), outputDir = path.join(dir, 'bản xuất');
  await mkdir(outputDir);
  const video = path.join(dir, 'video tự quay.mp4'), broken = path.join(dir, 'broken.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=12:duration=1',
    '-c:v', 'libx264', '-threads', '1', '-n', video,
  ]);
  await writeFile(broken, 'invalid media');
  const originalHash = await hashFile(video);
  const worker = new WorkerClient(pythonExecutable(root), path.join(root, 'worker', 'main.py'), path.join(dir, 'workspace'));
  const renderer = new RenderCoordinator(worker);
  let queue, store;
  try {
    store = new BatchStore(path.join(dir, 'queue.sqlite')); queue = new BatchQueue(store, worker, renderer);
    const good = { video: { path: video, sha256: originalHash, name: path.basename(video) }, output_dir: outputDir, encoding: 'review' };
    queue.enqueue('native-batch-0001', [
      { ...good, video: { path: broken, sha256: await hashFile(broken), name: 'broken.mp4' } }, good,
    ]);
    assert.equal(queue.snapshot().paused, true); queue.resume();
    await waitFor(() => queue.snapshot().items[0].state === 'failed' && queue.snapshot().items[1].state === 'complete');
    const complete = store.list()[1];
    assert.equal(await hashFile(complete.output.path), complete.output.sha256);
    const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', complete.output.path], { encoding: 'utf8' }));
    assert.ok(probe.streams.some(stream => stream.codec_type === 'video'));
    assert.equal(await hashFile(video), originalHash);
    // Close host queue, reopen same journal without resubmitting any completed item.
    queue.beginClose(); await queue.finishClose(); queue = undefined;
    const doneId = complete.id;
    store = new BatchStore(path.join(dir, 'queue.sqlite')); queue = new BatchQueue(store, worker, renderer);
    assert.equal(queue.snapshot().items[1].id, doneId);
    assert.equal(queue.snapshot().items[1].state, 'complete'); assert.equal(queue.snapshot().paused, true);
    const another = queue.enqueue('native-batch-0002', [good]).items.at(-1).id;
    // Alter original after intake: this queued item must not use cached old input.
    await writeFile(video, 'source changed'); queue.resume();
    await waitFor(() => queue.snapshot().items.find(item => item.id === another)?.state === 'failed');
    assert.equal(queue.snapshot().items.find(item => item.id === another).error_code, 'SOURCE_CHANGED');
    assert.equal(await hashFile(complete.output.path), complete.output.sha256);
  } finally {
    queue?.beginClose(); await renderer.close(); await worker.stop();
    if (queue) await queue.finishClose(); else store?.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
