import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';
import { pythonExecutable } from '../../scripts/python.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('real Python protocol configures local files, rejects bad checksum and persists across restart; no inference', async (t) => {
  const override = process.env.REUPMATIC_MODEL_MANIFEST;
  delete process.env.REUPMATIC_MODEL_MANIFEST;
  t.after(() => {
    if (override === undefined) delete process.env.REUPMATIC_MODEL_MANIFEST;
    else process.env.REUPMATIC_MODEL_MANIFEST = override;
  });
  const directory = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'reupmatic-model-config-')),
  );
  const workspace = path.join(directory, 'workspace');
  const manifest = path.join(directory, 'manifest.json');
  const weights = path.join(directory, 'test-only.onnx');
  const bytes = Buffer.from('configuration fixture, not a working ONNX model');
  await writeFile(weights, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const good = { inpainting: { model: { path: 'test-only.onnx', sha256 } } };
  await writeFile(manifest, JSON.stringify(good));
  const start = () =>
    new WorkerClient(pythonExecutable(root), path.join(root, 'worker/main.py'), workspace);
  let worker = start();
  try {
    const result = await worker.request('models.configure', { path: manifest }).result;
    assert.equal(result.configured, true);
    assert.equal(result.models.inpainting.verified, false);
    const savedPath = path.join(workspace, 'local-models.json');
    const saved = await readFile(savedPath, 'utf8');
    assert.equal(JSON.parse(saved).inpainting.model.path, weights);
    await writeFile(
      manifest,
      JSON.stringify({
        ...good,
        inpainting: { model: { path: 'test-only.onnx', sha256: '0'.repeat(64) } },
      }),
    );
    await assert.rejects(worker.request('models.configure', { path: manifest }).result, {
      code: 'MODEL_HASH_MISMATCH',
    });
    assert.equal(await readFile(savedPath, 'utf8'), saved);
    await worker.stop();
    worker = start();
    const status = await worker.request('models.status', {}).result;
    assert.equal(status.inpainting.verified, false);
    assert.notEqual(status.inpainting.code, 'MODEL_MISSING');
    assert.equal(await readFile(savedPath, 'utf8'), saved);
  } finally {
    await worker.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
