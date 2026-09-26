import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BatchStore } from '../../dist-core/batch/batch-store.js';
import { FolderStore } from '../../dist-core/folders/folder-store.js';
import {
  createProject,
  loadProject,
  parseProject,
  saveProject,
} from '../../dist-core/projects/project.js';

const recipe = () => ({
  inpaint: { target: 'manual', padding_px: 4, region: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 } },
});
const pins = () => ({ inpainting: 'b'.repeat(64) });
async function workspace(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'processing-persistence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('one current project schema round-trips both plain and processing snapshots', async (t) => {
  const directory = await workspace(t);
  const source = { path: path.join(directory, 'video.mp4'), sha256: 'a'.repeat(64) };
  const snapshot = { cues: [] };
  const plain = createProject(source, snapshot);
  assert.deepEqual(parseProject(plain), plain);
  const processing = recipe();
  const project = createProject(source, { ...snapshot, processing });
  processing.inpaint.padding_px = 10;
  assert.equal(project.processing.inpaint.padding_px, 4);
  const filename = path.join(directory, 'edit.reupmatic.json');
  await saveProject(filename, project);
  assert.deepEqual(await loadProject(filename), project);
  const plainFile = path.join(directory, 'plain.reupmatic.json');
  await saveProject(plainFile, plain);
  assert.deepEqual(await loadProject(plainFile), plain);
  assert.throws(() => parseProject({ ...plain, processing: undefined }), /INVALID_PROJECT/);
  assert.throws(
    () =>
      createProject(source, {
        ...snapshot,
        cues: [{ id: 'one', start_ms: 0, end_ms: 1000, text: 'User edit' }],
        processing: { ocr: { language: 'en', sample_ms: 500, min_confidence: 0.5 } },
      }),
    /INVALID_PROJECT/,
  );
});

test('batch recipe and model pins survive restart, interruption and explicit retry', async (t) => {
  const directory = await workspace(t);
  const filename = path.join(directory, 'queue.sqlite');
  const input = {
    video: { path: path.join(directory, 'video.mp4'), name: 'video.mp4', sha256: 'a'.repeat(64) },
    output_dir: directory,
    encoding: 'review',
    processing: recipe(),
    processing_models: pins(),
  };
  const store = new BatchStore(filename);
  const [job] = store.enqueue('processing-job-01', [input]);
  const original = structuredClone(input);
  input.processing.inpaint.padding_px = 15;
  input.processing_models.inpainting = 'c'.repeat(64);
  assert.deepEqual(store.get(job.id).input, original);
  assert.equal(store.enqueue('processing-job-01', [original])[0].id, job.id);
  assert.throws(() => store.enqueue('processing-job-01', [input]), { code: 'DUPLICATE_REQUEST' });
  store.claim();
  store.close();
  const reopened = new BatchStore(filename);
  t.after(() => reopened.close());
  assert.equal(reopened.recover(), 1);
  reopened.retry(job.id);
  const retry = reopened.claim();
  assert.equal(retry.id, job.id);
  assert.equal(retry.attempt, 2);
  assert.deepEqual(retry.input, original);
});

test('batch rejects unpinned processing and subtitle conflicts atomically', async (t) => {
  const directory = await workspace(t);
  const store = new BatchStore(path.join(directory, 'queue.sqlite'));
  t.after(() => store.close());
  const file = {
    path: path.join(directory, 'video.mp4'),
    name: 'video.mp4',
    sha256: 'a'.repeat(64),
  };
  const input = { video: file, output_dir: directory, encoding: 'review' };
  assert.throws(
    () => store.enqueue('processing-job-02', [input, { ...input, processing: recipe() }]),
    /INVALID_PROCESSING_MODELS/,
  );
  assert.throws(
    () =>
      store.enqueue('processing-job-03', [
        {
          ...input,
          subtitle: file,
          processing: { ocr: { language: 'en', sample_ms: 500, min_confidence: 0.5 } },
          processing_models: { ocr_en: 'b'.repeat(64) },
        },
      ]),
    /PROCESSING_SUBTITLE_CONFLICT/,
  );
  assert.equal(store.list().length, 0);
});

test('folder rule persists its immutable recipe and refuses a model-free recipe', async (t) => {
  const directory = await workspace(t);
  const filename = path.join(directory, 'folders.sqlite');
  const config = {
    source_dir: directory,
    output_dir: path.join(directory, 'output'),
    recursive: true,
    include_existing: false,
    processing: recipe(),
    processing_models: pins(),
  };
  const store = new FolderStore(filename);
  const saved = store.add(config);
  config.processing.inpaint.region.y = 0.2;
  assert.equal(store.get(saved.id).processing.inpaint.region.y, 0.7);
  store.close();
  const reopened = new FolderStore(filename);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.get(saved.id), saved);
  assert.throws(
    () => reopened.add({ ...config, processing_models: undefined }),
    /INVALID_PROCESSING_MODELS/,
  );
});
