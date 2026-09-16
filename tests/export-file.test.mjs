import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, link, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { saveChosenExport, hashFile } from '../dist-core/media/files.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-export-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'artifact.mp4');
  const target = path.join(directory, 'chosen.mp4');
  await writeFile(source, 'new complete export');
  await writeFile(target, 'previous user export');
  return { directory, source, target };
}

test('chosen export atomically replaces only the explicitly selected destination', async t => {
  const { source, target, directory } = await fixture(t);
  const before = await hashFile(source);
  await saveChosenExport(source, target, [source]);
  assert.equal(await hashFile(target), before);
  assert.equal(await hashFile(source), before);
  assert.equal((await readdir(directory)).filter(name => name.endsWith('.partial')).length, 0);
});

test('failure before commit preserves an earlier export and cleans the temporary', async t => {
  const { source, target, directory } = await fixture(t);
  let checks = 0;
  await assert.rejects(saveChosenExport(source, target, [], () => {
    if (++checks === 2) throw new Error('CANCELLED');
  }), /CANCELLED/);
  assert.equal(await readFile(target, 'utf8'), 'previous user export');
  assert.equal((await readdir(directory)).filter(name => name.endsWith('.partial')).length, 0);
});

test('a source or hardlink alias cannot be overwritten by export saving', async t => {
  const { source, target, directory } = await fixture(t);
  await assert.rejects(saveChosenExport(target, source, [source]), /SOURCE_OVERWRITE/);
  const alias = path.join(directory, 'alias.mp4');
  await link(source, alias);
  await assert.rejects(saveChosenExport(target, alias, [source]), /SOURCE_OVERWRITE/);
  assert.equal(await readFile(source, 'utf8'), 'new complete export');
});

test('missing render output does not truncate a previously saved export', async t => {
  const { target, directory } = await fixture(t);
  await assert.rejects(saveChosenExport(path.join(directory, 'missing.mp4'), target, []));
  assert.equal(await readFile(target, 'utf8'), 'previous user export');
});

test('symlink destinations are rejected rather than followed', async t => {
  const { source, target, directory } = await fixture(t);
  const alias = path.join(directory, 'link.mp4');
  try { await symlink(target, alias); }
  catch (error) { if (['EPERM', 'ENOTSUP'].includes(error.code)) { t.skip('symlinks unavailable'); return; } throw error; }
  await assert.rejects(saveChosenExport(source, alias, []), /OUTPUT_CONFLICT/);
  assert.equal(await readFile(target, 'utf8'), 'previous user export');
});


test('the render artifact itself stays protected when no originals were supplied', async t => {
  const { source, directory } = await fixture(t);
  await assert.rejects(saveChosenExport(source, source, []), /SOURCE_OVERWRITE/);
  const alias = path.join(directory, 'artifact-alias.mp4');
  await link(source, alias);
  await assert.rejects(saveChosenExport(source, alias, []), /SOURCE_OVERWRITE/);
  assert.equal(await readFile(source, 'utf8'), 'new complete export');
});
