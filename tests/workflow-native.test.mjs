import { LibraryAssets } from '../dist-core/library/library-assets.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WorkspaceCatalog } from '../dist-core/catalog/workspace-catalog.js';
import { WorkflowService } from '../dist-core/automation/workflow-service.js';
import { workflowRunState } from '../dist-core/automation/run-state.js';
import { LibraryService } from '../dist-core/library/library-service.js';
import { LibraryStore } from '../dist-core/library/library-store.js';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { BatchQueue } from '../dist-core/batch/batch-queue.js';
import { RenderCoordinator } from '../dist-core/rendering/render-coordinator.js';
import { WorkerClient } from '../dist-core/worker/worker-client.js';
import { hashFile } from '../dist-core/media/files.js';
import { pythonExecutable } from '../scripts/python.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function until(predicate) {
  const deadline = Date.now() + 30000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Workflow native test timed out');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

test('real saved workflow -> shared SQLite queue -> FFmpeg -> Library export -> one local destination post', { timeout: 45000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-workflow-native-'));
  const source = path.join(directory, 'Nguồn Việt.mp4');
  const output = path.join(directory, 'exports');
  await mkdir(output);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=12:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-shortest', '-n', source]);
  const sourceHash = await hashFile(source);
  const worker = new WorkerClient(pythonExecutable(root), path.join(root, 'worker/main.py'), path.join(directory, 'workspace'));
  const renderer = new RenderCoordinator(worker);
  const libraryStore = new LibraryStore(path.join(directory, 'library.sqlite'));
  const catalogPath = path.join(directory, 'catalog.sqlite');
  const catalog = new WorkspaceCatalog(catalogPath);
  const batchStore = new BatchStore(path.join(directory, 'batch.sqlite'));
  const queue = new BatchQueue(batchStore, worker, renderer);
  const library = new LibraryService(libraryStore, path.join(directory, 'managed'), async filename => {
    const asset = await worker.request('asset.register', { path: filename, kind: 'video' }).result;
    const info = await worker.request('media.probe', { asset_id: asset.asset_id }).result;
    return { path: filename, name: path.basename(filename), sha256: asset.sha256, ...info };
  });
  const service = new WorkflowService(catalog.workflows, { queue,
    resolveLibrary: id => library.resolve(id), async checkOutput() {},
    async resolveModels() { throw new Error('No models should run in this plain workflow'); },
  });
  try {
    const { item } = await library.importFile(source, { mode: 'reference', duplicates: 'reuse' });
    const label = catalog.taxonomy.save({ id: 'label_native_01', expected_revision: null, name: 'Đồ nhà', kind: 'category', archived: false });
    catalog.taxonomy.assignContent({ id: item.id, expected_revision: null, label_ids: [label.id] });
    const workflow = catalog.workflows.save({ id: 'workflow_native_01', expected_revision: null,
      name: 'Xuất bản local', item_ids: [item.id], processing: null, archived: false }, output);
    assert.equal(queue.snapshot().items.length, 0);
    const run = await service.run(workflow.id, workflow.revision, 'run_native_01');
    await service.run(workflow.id, workflow.revision, run.id);
    assert.equal(queue.snapshot().items.length, 1);
    assert.equal(queue.snapshot().paused, true);
    queue.resume();
    await until(() => ['complete', 'failed'].includes(queue.snapshot().items[0].state));
    const job = batchStore.list()[0];
    assert.equal(job.state, 'complete', job.error_code);
    assert.equal(workflowRunState(catalog.workflows.runs()[0], queue.snapshot().items), 'complete');
    await new LibraryAssets(libraryStore).register(item.id, 'export', job.output.path, job.output.sha256);
    const exported = libraryStore.get(item.id).links.find(link => link.kind === 'export');
    assert.ok(libraryStore.exports().some(choice => choice.export_id === exported.id));
    const channel = catalog.distribution.saveChannel({ id: 'channel_native_01', expected_revision: null,
      name: 'Kênh thử', platform: 'youtube', url: 'https://www.youtube.com/@example', label_ids: [label.id], archived: false });
    const link = catalog.distribution.saveLink({ id: 'link_native_01', expected_revision: null,
      name: 'Link thủ công', url: 'https://shopee.vn/example?af_siteid=original', label_ids: [label.id], archived: false });
    const post = catalog.posts.create({ id: 'post_native_01', expected_revision: null,
      title: 'Nội dung thử', body: '', channel_id: channel.id, library_id: item.id, export_id: exported.id,
      link_ids: [link.id], planned: { instant: Date.parse('2026-09-16T03:30:00Z'), timezone: 'Asia/Bangkok' } },
    { library_id: item.id, link_id: exported.id, name: exported.name, path: exported.path, sha256: await hashFile(exported.path) });
    assert.equal(post.state, 'draft');
    assert.equal(channel.can_publish, false);
    assert.equal(catalog.posts.usage()[link.id], 1);
    assert.equal(await hashFile(source), sourceHash);
    const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', exported.path], { encoding: 'utf8' }));
    assert.ok(probe.streams.some(stream => stream.codec_type === 'audio'));
    catalog.close();
    const reopened = new WorkspaceCatalog(catalogPath);
    try {
      assert.equal(reopened.posts.get(post.id).export.sha256, job.output.sha256);
      assert.equal(reopened.workflows.runs()[0].job_ids[0], job.id);
      assert.equal(reopened.posts.list({ search: '', view: 'published', offset: 0, limit: 25 }).total, 0);
    } finally { reopened.close(); }
  } finally {
    await service.close(); queue.beginClose();
    await renderer.close(); await worker.stop(); queue.finishClose();
    catalog.close(); libraryStore.close();
    await rm(directory, { recursive: true, force: true });
  }
});
