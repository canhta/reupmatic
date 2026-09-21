import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BatchQueue } from '../../dist-core/batch/batch-queue.js';
import { hashFile } from '../../dist-core/media/files.js';
import { RenderCoordinator } from '../../dist-core/rendering/render-coordinator.js';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';
import { pythonExecutable } from '../../scripts/python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function waitFor(predicate) {
  const end = Date.now() + 40000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('native queue timeout');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('actual SQLite batch -> shared Python/FFmpeg -> folder; restart retains outputs and revalidates inputs', {
  timeout: 60000,
}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-native-batch-'));
  const dir = await realpath(temporary),
    outputDir = path.join(dir, 'bản xuất');
  await mkdir(outputDir);
  const video = path.join(dir, 'video tự quay.mp4'),
    broken = path.join(dir, 'broken.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=12:duration=1',
    '-c:v',
    'libx264',
    '-threads',
    '1',
    '-n',
    video,
  ]);
  await writeFile(broken, 'invalid media');
  const originalHash = await hashFile(video);
  const worker = new WorkerClient(
    pythonExecutable(root),
    path.join(root, 'worker', 'main.py'),
    path.join(dir, 'workspace'),
  );
  const renderer = new RenderCoordinator(worker);
  let queue;
  try {
    queue = new BatchQueue(worker, renderer, {
      databasePath: path.join(dir, 'queue.sqlite'),
    });
    const good = {
      video: { path: video, sha256: originalHash, name: path.basename(video) },
      output_dir: outputDir,
      encoding: 'review',
    };
    queue.enqueue('native-batch-0001', [
      { ...good, video: { path: broken, sha256: await hashFile(broken), name: 'broken.mp4' } },
      good,
    ]);
    assert.equal(queue.snapshot().paused, true);
    queue.resume();
    await waitFor(
      () =>
        queue.snapshot().items[0].state === 'failed' &&
        queue.snapshot().items[1].state === 'complete',
    );
    const complete = queue.get(queue.snapshot().items[1].id);
    assert.equal(await hashFile(complete.output.path), complete.output.sha256);
    const probe = JSON.parse(
      execFileSync(
        process.env.FFPROBE_PATH || 'ffprobe',
        ['-v', 'error', '-show_streams', '-of', 'json', complete.output.path],
        { encoding: 'utf8' },
      ),
    );
    assert.ok(probe.streams.some((stream) => stream.codec_type === 'video'));
    assert.equal(await hashFile(video), originalHash);
    // Close host queue, reopen same journal without resubmitting any completed item.
    queue.beginClose();
    await queue.close();
    queue = undefined;
    const doneId = complete.id;
    queue = new BatchQueue(worker, renderer, {
      databasePath: path.join(dir, 'queue.sqlite'),
    });
    assert.equal(queue.snapshot().items[1].id, doneId);
    assert.equal(queue.snapshot().items[1].state, 'complete');
    assert.equal(queue.snapshot().paused, true);
    const another = queue.enqueue('native-batch-0002', [good]).items.at(-1).id;
    // Alter original after intake: this queued item must not use cached old input.
    await writeFile(video, 'source changed');
    queue.resume();
    await waitFor(
      () => queue.snapshot().items.find((item) => item.id === another)?.state === 'failed',
    );
    assert.equal(
      queue.snapshot().items.find((item) => item.id === another).error_code,
      'SOURCE_CHANGED',
    );
    assert.equal(await hashFile(complete.output.path), complete.output.sha256);
  } finally {
    queue?.beginClose();
    await renderer.close();
    await worker.stop();
    if (queue) await queue.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
