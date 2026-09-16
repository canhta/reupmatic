import { LibraryAssets } from '../dist-core/library/library-assets.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LibraryService } from '../dist-core/library/library-service.js';
import { LibraryStore } from '../dist-core/library/library-store.js';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { BatchQueue } from '../dist-core/batch/batch-queue.js';
import { RenderCoordinator } from '../dist-core/rendering/render-coordinator.js';
import { WorkerClient } from '../dist-core/worker/worker-client.js';
import { createProject, loadProject, saveProject } from '../dist-core/projects/project.js';
import { hashFile } from '../dist-core/media/files.js';
import { pythonExecutable } from '../scripts/python.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function until(predicate) {
  const end = Date.now() + 40000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('native library batch timeout');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

test('real Library -> relink -> saved project -> SQLite batch -> FFmpeg with audio', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-library-native-'));
  const source = path.join(directory, 'video Việt.mp4');
  const outputs = path.join(directory, 'exports');
  await mkdir(outputs);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=12:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-shortest', '-n', source]);
  const before = await hashFile(source);
  const worker = new WorkerClient(pythonExecutable(root), path.join(root, 'worker/main.py'), path.join(directory, 'workspace'));
  const renderer = new RenderCoordinator(worker);
  const dbPath = path.join(directory, 'library.sqlite');
  const libraryStore = new LibraryStore(dbPath);
  const batchStore = new BatchStore(path.join(directory, 'batch.sqlite'));
  const queue = new BatchQueue(batchStore, worker, renderer);
  const inspect = async filename => {
    const asset = await worker.request('asset.register', { path: filename, kind: 'video' }).result;
    const info = await worker.request('media.probe', { asset_id: asset.asset_id }).result;
    return { path: filename, name: path.basename(filename), sha256: asset.sha256, ...info };
  };
  const library = new LibraryService(libraryStore, path.join(directory, 'managed'), inspect);
  try {
    const { item } = await library.importFile(source, { mode: 'reference', duplicates: 'reuse' });
    const copied = await library.importFile(source, { mode: 'copy', duplicates: 'separate' });
    assert.equal(item.has_audio, true);
    assert.equal(await hashFile(copied.item.path), before);
    const projectPath = path.join(directory, 'edit.reupmatic.json');
    await saveProject(projectPath, createProject({ path: source, sha256: before }, {
      cues: [], sample: { start_ms: 0, end_ms: 500 },
    }), [source]);
    await new LibraryAssets(libraryStore).register(item.id, 'project', projectPath);
    const moved = path.join(directory, 'moved.mp4');
    await rename(source, moved);
    await assert.rejects(library.resolve(item.id), /SOURCE_UNAVAILABLE/);
    await library.relink(item.id, moved);
    const resolved = await library.resolve(item.id);
    assert.equal((await loadProject(projectPath)).source.sha256, resolved.sha256);
    queue.enqueue('library-native-001', [{
      video: { path: resolved.path, sha256: resolved.sha256, name: item.name },
      library_id: item.id, output_dir: outputs, encoding: 'review',
    }]);
    assert.equal(queue.snapshot().paused, true);
    queue.resume();
    await until(() => ['complete', 'failed'].includes(queue.snapshot().items[0].state));
    const job = batchStore.list()[0];
    assert.equal(job.state, 'complete', job.error_code);
    assert.equal(job.input.library_id, item.id);
    await new LibraryAssets(libraryStore).register(item.id, 'export', job.output.path, job.output.sha256);
    assert.equal(await hashFile(job.output.path), job.output.sha256);
    const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v', 'error', '-show_streams', '-of', 'json', job.output.path,
    ], { encoding: 'utf8' }));
    assert.ok(probe.streams.some(stream => stream.codec_type === 'audio'));
    assert.ok(probe.streams.some(stream => stream.codec_type === 'video'));
    assert.equal(await hashFile(moved), before);
    assert.equal(await hashFile(copied.item.path), before);
    libraryStore.close();
    const reopened = new LibraryStore(dbPath);
    try {
      assert.equal(reopened.get(item.id).links.length, 2);
      assert.equal(reopened.get(item.id).path, moved);
      assert.equal(reopened.get(item.id).availability, 'unchecked');
      assert.ok((await readFile(projectPath)).length);
    } finally { reopened.close(); }
  } finally {
    queue.beginClose();
    await renderer.close();
    await worker.stop();
    queue.finishClose();
    libraryStore.close();
    await rm(directory, { recursive: true, force: true });
  }
});
