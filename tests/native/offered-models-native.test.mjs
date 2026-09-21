import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installOfferedModels } from '../../dist-node/electron/features/speech/offered-models.js';

const CATALOGUE = path.join(process.cwd(), 'app/core/speech/catalogue.json');

function controllableInstall() {
  let release;
  const started = new Promise((resolve) => {
    release = resolve;
  });
  let seen = null;
  return {
    started,
    install: (options) => {
      seen = options;
      release(options);
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('CANCELLED')));
      });
    },
    progress: (phase, fraction) => seen.onProgress?.({ phase, fraction }),
  };
}

async function harness(overrides = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-offered-'));
  const events = [];
  const offered = installOfferedModels({
    worker: { request: () => ({ result: Promise.resolve({}) }) },
    workspace,
    cataloguePaths: [CATALOGUE],
    installEvent: (message) => events.push(message),
    modelsChanged: () => {},
    errorCode: (error) => error?.code ?? 'WORKER_FAILURE',
    ...overrides,
  });
  return { offered, events, workspace };
}

test('a running install belongs to the host, so a panel that goes away and returns re-attaches to it', async (t) => {
  const driver = controllableInstall();
  const { offered, workspace } = await harness({ install: driver.install });
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const before = await offered.list();
  assert.equal(before.active, null, 'nothing is running before a deliberate Download');

  const { request_id } = await offered.start({
    catalogue_id: before.models[0].id,
  });
  await driver.started;

  driver.progress('downloading', 0.42);

  const during = await offered.list();
  assert.equal(during.active?.request_id, request_id);
  assert.equal(during.active?.catalogue_id, before.models[0].id);
  assert.equal(during.active?.phase, 'downloading');
  assert.equal(during.active?.fraction, 0.42, 'the panel re-attaches at the progress reached');
  assert.equal(offered.activeCount, 1, 'leaving the panel did not cancel the transfer');

  await offered.close();
});

test('the explicit Cancel does stop it, and the catalogue then reports nothing running', async (t) => {
  const driver = controllableInstall();
  const { offered, events, workspace } = await harness({ install: driver.install });
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const before = await offered.list();
  const { request_id } = await offered.start({
    catalogue_id: before.models[0].id,
  });
  await driver.started;

  await offered.cancel(request_id);
  await new Promise((resolve) => setImmediate(resolve));

  const after = await offered.list();
  assert.equal(after.active, null);
  assert.equal(offered.activeCount, 0);
  assert.deepEqual(events.at(-1), {
    id: request_id,
    event: 'error',
    data: { code: 'CANCELLED' },
  });
});

test('activating a downloaded model re-runs its own configure against the manifest on disk', async (t) => {
  const calls = [];
  const { offered, workspace } = await harness({
    worker: {
      request: (operation, args) => {
        calls.push([operation, args]);
        return { result: Promise.resolve({}) };
      },
    },
  });
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const { models } = await offered.list();
  const recognition = models.find((model) => model.task === 'recognition');
  const synthesis = models.find((model) => model.task === 'synthesis');

  await assert.rejects(offered.activate(recognition.id), (error) => error.code === 'MODEL_MISSING');
  await assert.rejects(
    offered.activate('not-a-model'),
    (error) => error.code === 'MODEL_NOT_OFFERED',
  );

  const directory = path.join(workspace, 'speech-models');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${recognition.id}.json`), '{}');
  await writeFile(path.join(directory, `${synthesis.id}.json`), '{}');

  assert.deepEqual(await offered.activate(recognition.id), { activated: true });
  assert.deepEqual(await offered.activate(synthesis.id), { activated: true });
  assert.deepEqual(calls, [
    ['speech.configure', { path: path.join(directory, `${recognition.id}.json`) }],
    ['synthesis.configure', { path: path.join(directory, `${synthesis.id}.json`) }],
  ]);
});

test('removing a downloaded entry forgets its engine store, then deletes the bundle', async (t) => {
  const calls = [];
  const { offered, workspace } = await harness({
    worker: {
      request: (operation, args) => {
        calls.push([operation, args]);
        return { result: Promise.resolve({}) };
      },
    },
  });
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const { models } = await offered.list();
  const recognition = models.find((model) => model.task === 'recognition');
  const synthesis = models.find((model) => model.task === 'synthesis');
  const directory = path.join(workspace, 'speech-models');
  await mkdir(directory, { recursive: true });

  assert.deepEqual(await offered.remove(recognition.id), { removed: false });
  await assert.rejects(
    offered.remove('not-a-model'),
    (error) => error.code === 'MODEL_NOT_OFFERED',
  );

  const bundle = path.join(directory, recognition.id);
  await mkdir(bundle, { recursive: true });
  await writeFile(path.join(bundle, 'model.bin'), 'bytes');
  await writeFile(path.join(directory, `${recognition.id}.json`), '{}');

  assert.deepEqual(await offered.remove(recognition.id), { removed: true });
  assert.deepEqual(calls, [['speech.unconfigure', { directory: bundle }]]);
  assert.equal(existsSync(bundle), false, 'the bundle directory is gone');
  assert.equal(
    existsSync(path.join(directory, `${recognition.id}.json`)),
    false,
    'its manifest is gone',
  );

  const voice = path.join(directory, synthesis.id);
  await mkdir(voice, { recursive: true });
  await writeFile(path.join(directory, `${synthesis.id}.json`), '{}');
  assert.deepEqual(await offered.remove(synthesis.id), { removed: true });
  assert.deepEqual(calls.at(-1), ['synthesis.unconfigure', { directory: voice }]);
});
