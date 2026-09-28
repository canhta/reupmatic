import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { workflowRunState } from '../../dist-core/automation/run-state.js';
import { WorkflowService } from '../../dist-core/automation/workflow-service.js';
import { BatchStore } from '../../dist-core/batch/batch-store.js';
import { WorkspaceCatalog } from '../../dist-core/catalog/workspace-catalog.js';

async function unusedExport() {
  throw new Error('UNUSED_EXPORT');
}

const workflow = {
  id: 'workflow_001',
  expected_revision: null,
  name: 'Quy trình',
  item_ids: ['library_001'],
  processing: null,
  archived: false,
};
const video = {
  path: path.resolve('source.mp4'),
  name: 'Tiếng Việt.mp4',
  sha256: 'a'.repeat(64),
  duration_ms: 5000,
  width: 640,
  height: 360,
  has_audio: true,
};
const directory = path.resolve('output');
function fixture() {
  const catalog = new WorkspaceCatalog(':memory:', unusedExport);
  const batch = new BatchStore(':memory:');
  let resolves = 0;
  const host = {
    queue: {
      enqueue(id, inputs) {
        batch.enqueue(id, inputs);
        return this.snapshot();
      },
      snapshot() {
        return { items: batch.list().map((job) => ({ ...job, batch_id: job.batch_id })) };
      },
    },
    async resolveLibrary() {
      resolves++;
      return video;
    },
    async resolveModels() {
      return { ocr_en: 'b'.repeat(64) };
    },
    async checkOutput() {},
  };
  const saved = catalog.saveWorkflow(workflow, directory);
  const service = new WorkflowService(catalog, host);
  return {
    catalog,
    batch,
    service,
    saved,
    host,
    get resolves() {
      return resolves;
    },
    async close() {
      await service.close();
      catalog.close();
      batch.close();
    },
  };
}

test('SC-08: workflow save has no execution side effects and duplicate run admission is stable', async () => {
  const f = fixture();
  try {
    assert.equal(f.batch.list().length, 0);
    const [one, two] = await Promise.all([
      f.service.run(f.saved.id, 1, 'request_001'),
      f.service.run(f.saved.id, 1, 'request_001'),
    ]);
    assert.equal(one.id, two.id);
    assert.equal(one.admission, 'admitted');
    assert.equal(f.batch.list().length, 1);
    assert.equal(f.resolves, 1);
    const before = f.batch.list()[0];
    await f.service.run(f.saved.id, 1, 'request_001');
    assert.equal(f.batch.list()[0].id, before.id);
    assert.equal(f.catalog.dependencies('library_001').workflows, 1);
  } finally {
    await f.close();
  }
});

test('SC-07/08: prepared admission reuses captured recipe and model versions after edits', async () => {
  const f = fixture();
  try {
    const processing = { ocr: { language: 'en', sample_ms: 500, min_confidence: 0.7 } };
    const saved = f.catalog.saveWorkflow(
      { ...workflow, expected_revision: 1, processing },
      directory,
    );
    const input = {
      video: { path: video.path, name: video.name, sha256: video.sha256 },
      library_id: 'library_001',
      output_dir: directory,
      encoding: 'review',
      processing,
      processing_models: { ocr_en: 'c'.repeat(64) },
    };
    f.catalog.prepareWorkflowRun('request_002', saved, [input]);
    f.catalog.saveWorkflow(
      { ...workflow, expected_revision: 2, name: 'New settings', archived: true },
      directory,
    );
    const result = await f.service.run(saved.id, 2, 'request_002');
    assert.equal(result.workflow_revision, 2);
    assert.deepEqual(f.batch.list()[0].input.processing_models, { ocr_en: 'c'.repeat(64) });
    assert.equal(f.resolves, 0);
    const state = workflowRunState(f.catalog.snapshot(true).runs[0], f.batch.list());
    assert.equal(state, 'queued');
  } finally {
    await f.close();
  }
});

test('SC-08: reusing a prepared request for another workflow is rejected', async () => {
  const f = fixture();
  try {
    await f.service.run(f.saved.id, 1, 'request_003');
    const second = f.catalog.saveWorkflow({ ...workflow, id: 'workflow_002' }, directory);
    await assert.rejects(f.service.run(second.id, 1, 'request_003'), /DUPLICATE_REQUEST/);
    assert.equal(f.batch.list().length, 1);
  } finally {
    await f.close();
  }
});

test('SC-08: stale/archived or missing-input workflows cannot partially enqueue', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.service.run(f.saved.id, 9, 'request_004'), /REVISION_CONFLICT/);
    f.host.resolveLibrary = async () => {
      throw new Error('SOURCE_UNAVAILABLE');
    };
    await assert.rejects(f.service.run(f.saved.id, 1, 'request_005'), /SOURCE_UNAVAILABLE/);
    assert.equal(f.batch.list().length, 0);
    assert.equal(f.catalog.snapshot(true).runs.length, 0);
    f.catalog.saveWorkflow({ ...workflow, expected_revision: 1, archived: true }, directory);
    await assert.rejects(f.service.run(f.saved.id, 2, 'request_006'), /WORKFLOW_ARCHIVED/);
  } finally {
    await f.close();
  }
});

test('SC-08: change during source resolution is detected before a run is saved', async () => {
  const f = fixture();
  try {
    f.host.resolveLibrary = async () => {
      f.catalog.saveWorkflow(
        { ...workflow, expected_revision: 1, name: 'Changed mid-flight' },
        directory,
      );
      return video;
    };
    await assert.rejects(f.service.run(f.saved.id, 1, 'request_007'), /REVISION_CONFLICT/);
    assert.equal(f.batch.list().length, 0);
    assert.equal(f.catalog.snapshot(true).runs.length, 0);
  } finally {
    await f.close();
  }
});

test('SC-07: missing jobs and mixed outcomes cannot be called a completed workflow', () => {
  const run = { admission: 'admitted', job_ids: ['job_0001', 'job_0002'] };
  assert.equal(workflowRunState(run, [{ id: 'job_0001', state: 'complete' }]), 'interrupted');
  assert.equal(
    workflowRunState(run, [
      { id: 'job_0001', state: 'complete' },
      { id: 'job_0002', state: 'failed' },
    ]),
    'partial',
  );
  assert.equal(
    workflowRunState(run, [
      { id: 'job_0001', state: 'complete' },
      { id: 'job_0002', state: 'complete' },
    ]),
    'complete',
  );
});

test('SC-07/08: a crash after queue commit but before run update cannot create duplicate jobs', async () => {
  const f = fixture();
  try {
    const input = {
      video: { path: video.path, name: video.name, sha256: video.sha256 },
      library_id: 'library_001',
      output_dir: directory,
      encoding: 'review',
    };
    const prepared = f.catalog.prepareWorkflowRun('request_crash_01', f.saved, [input]);
    f.host.queue.enqueue(prepared.id, prepared.inputs);
    const original = f.batch.list()[0].id;
    const resumed = await f.service.run(f.saved.id, 1, prepared.id);
    assert.equal(resumed.admission, 'admitted');
    assert.deepEqual(resumed.job_ids, [original]);
    assert.equal(f.batch.list().length, 1);
    assert.equal(f.resolves, 0);
  } finally {
    await f.close();
  }
});
