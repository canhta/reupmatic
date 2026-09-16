import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PreferencesStore } from '../dist-core/settings/preferences-store.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-settings-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, filename: path.join(root, 'preferences.json') };
}

test('new settings do not guess a save folder or manufacture account status', async (t) => {
  const { filename } = await fixture(t);
  const settings = await PreferencesStore.open(filename);
  assert.deepEqual(settings.snapshot(), { version: 1, revision: 0, default_output_dir: null });
});

test('output default persists; changing it leaves previous output files in place', async (t) => {
  const { filename, root } = await fixture(t);
  const output = path.join(root, 'processed.mp4');
  await writeFile(output, 'render');
  const settings = await PreferencesStore.open(filename);
  await settings.setOutputDirectory(root);
  assert.equal((await PreferencesStore.open(filename)).snapshot().default_output_dir, root);
  await settings.setOutputDirectory(null);
  assert.equal(await readFile(output, 'utf8'), 'render');
  assert.equal(settings.snapshot().revision, 2);
});

test('corrupt and future-version settings are preserved rather than silently replaced', async (t) => {
  const { filename } = await fixture(t);
  for (const value of ['bad json', JSON.stringify({ version: 99 })]) {
    await writeFile(filename, value);
    await assert.rejects(PreferencesStore.open(filename), /SETTINGS_INVALID|SETTINGS_VERSION/);
    assert.equal(await readFile(filename, 'utf8'), value);
  }
});

test('parallel writes are serialized and snapshot callers cannot mutate saved defaults', async (t) => {
  const { root, filename } = await fixture(t);
  const settings = await PreferencesStore.open(filename);
  await Promise.all([settings.setOutputDirectory(root), settings.setOutputDirectory(null)]);
  assert.equal(settings.snapshot().revision, 2);
  const snapshot = settings.snapshot();
  snapshot.default_output_dir = '/not-the-saved-path';
  assert.equal(settings.snapshot().default_output_dir, null);
});

test('invalid directories do not replace the last valid settings', async (t) => {
  const { root, filename } = await fixture(t);
  const settings = await PreferencesStore.open(filename);
  await settings.setOutputDirectory(root);
  await assert.rejects(settings.setOutputDirectory('relative/path'), /INVALID_REQUEST/);
  await assert.rejects(
    settings.setOutputDirectory(path.join(root, 'missing')),
    /OUTPUT_DIRECTORY_MISSING/,
  );
  assert.equal(settings.snapshot().default_output_dir, root);
});
