import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LibraryStore } from '../dist-core/library/library-store.js';
import { LibraryService } from '../dist-core/library/library-service.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-library-'));
  await mkdir(path.join(root, 'managed'));
  const dbPath = path.join(root, 'library.sqlite');
  const store = new LibraryStore(dbPath);
  t.after(async () => { store.close(); await rm(root, { recursive: true, force: true }); });
  const inspect = async filename => {
    const data = await readFile(filename);
    return { path: filename, name: path.basename(filename), sha256: createHash('sha256').update(data).digest('hex'),
      duration_ms: 5000, width: 320, height: 180, has_audio: true };
  };
  const service = new LibraryService(store, path.join(root, 'managed'), inspect);
  const source = path.join(root, 'source.mp4');
  await writeFile(source, 'original bytes');
  return { root, store, service, source, dbPath };
}

test('reference import survives reopening without copying original content', async t => {
  const { service, store, source, dbPath } = await fixture(t);
  const result = await service.importFile(source, { mode: 'reference', duplicates: 'reuse' });
  assert.equal(result.reused, false);
  assert.equal(result.item.path, source);
  assert.equal(result.item.storage, 'reference');
  store.close();
  const reopened = new LibraryStore(dbPath);
  try { assert.equal(reopened.get(result.item.id).sha256, result.item.sha256); }
  finally { reopened.close(); }
});

test('same bytes are reused only under reuse policy; separate import is explicit', async t => {
  const { service, source, root, store } = await fixture(t);
  const first = await service.importFile(source, { mode: 'reference', duplicates: 'reuse' });
  const other = path.join(root, 'different-name.mp4');
  await writeFile(other, await readFile(source));
  const reuse = await service.importFile(other, { mode: 'reference', duplicates: 'reuse' });
  assert.equal(reuse.reused, true);
  assert.equal(reuse.item.id, first.item.id);
  const separate = await service.importFile(other, { mode: 'reference', duplicates: 'separate' });
  assert.notEqual(separate.item.id, first.item.id);
  assert.equal(store.list({ search: '', offset: 0, limit: 50 }).total, 2);
});

test('copy import has an independent verified destination and leaves source untouched', async t => {
  const { service, source, root } = await fixture(t);
  const { item } = await service.importFile(source, { mode: 'copy', duplicates: 'separate' });
  assert.equal(item.storage, 'copy');
  assert.ok(item.path.startsWith(path.join(root, 'managed') + path.sep));
  assert.notEqual(item.path, source);
  assert.deepEqual(await readFile(item.path), await readFile(source));
});

test('relink rejects different bytes without losing project associations', async t => {
  const { service, source, root, store } = await fixture(t);
  const { item } = await service.importFile(source, { mode: 'reference', duplicates: 'reuse' });
  store.link(item.id, 'project', path.join(root, 'edit.reupmatic.json'), { sha256: 'a'.repeat(64), size_bytes: 10 });
  const wrong = path.join(root, 'wrong.mp4');
  await writeFile(wrong, 'other bytes');
  await assert.rejects(service.relink(item.id, wrong), /SOURCE_CHANGED/);
  assert.equal(store.get(item.id).path, source);
  const moved = path.join(root, 'moved.mp4');
  await rename(source, moved);
  await service.relink(item.id, moved);
  assert.equal(store.get(item.id).path, moved);
  assert.equal(store.get(item.id).links.length, 1);
});

test('open detects changed source bytes; missing source retains library history', async t => {
  const { service, source, store } = await fixture(t);
  const { item } = await service.importFile(source, { mode: 'reference', duplicates: 'reuse' });
  await writeFile(source, 'modified bytes');
  await assert.rejects(service.resolve(item.id), /SOURCE_CHANGED/);
  assert.equal(store.get(item.id).availability, 'changed');
  await rm(source);
  await assert.rejects(service.resolve(item.id), /SOURCE_UNAVAILABLE/);
  assert.equal(store.get(item.id).availability, 'missing');
});

test('removing a listing never deletes originals, copies, projects or exports', async t => {
  const { service, source, root, store } = await fixture(t);
  const { item } = await service.importFile(source, { mode: 'copy', duplicates: 'separate' });
  const output = path.join(root, 'output.mp4');
  await writeFile(output, 'render');
  store.link(item.id, 'export', output, { sha256: createHash('sha256').update('render').digest('hex'), size_bytes: 6 });
  store.forget(item.id);
  assert.equal(store.list({ search: '', offset: 0, limit: 50 }).total, 0);
  assert.ok((await readFile(source)).length);
  assert.ok((await readFile(item.path)).length);
  assert.equal(await readFile(output, 'utf8'), 'render');
  assert.ok(store.protectedPaths().includes(item.path));
});

test('search treats SQL wildcard characters as literal text and caps pages', async t => {
  const { service, root, store } = await fixture(t);
  const special = path.join(root, '100%_done.mp4');
  await writeFile(special, 'unique');
  await service.importFile(special, { mode: 'reference', duplicates: 'separate' });
  assert.equal(store.list({ search: '%_', offset: 0, limit: 50 }).total, 1);
  assert.equal(store.list({ search: "' OR 1=1 --", offset: 0, limit: 50 }).total, 0);
  assert.throws(() => store.list({ search: '', offset: 0, limit: 1000 }), /INVALID_REQUEST/);
});

test('a failed copy is not recorded as an available library item', async t => {
  const { service, source, root, store } = await fixture(t);
  await rm(path.join(root, 'managed'), { recursive: true });
  await writeFile(path.join(root, 'managed'), 'not a folder');
  await assert.rejects(service.importFile(source, { mode: 'copy', duplicates: 'separate' }));
  assert.equal(store.list({ search: '', offset: 0, limit: 50 }).total, 0);
});


test('copy imports never mutate the inspector-owned media registration', async t => {
  const { root, store, source } = await fixture(t);
  const inspected = Object.freeze({ path: source, name: 'source.mp4',
    sha256: createHash('sha256').update(await readFile(source)).digest('hex'),
    duration_ms: 5000, width: 320, height: 180, has_audio: false });
  const service = new LibraryService(store, path.join(root, 'managed'), async () => inspected);
  const result = await service.importFile(source, { mode: 'copy', duplicates: 'separate' });
  assert.equal(inspected.path, source);
  assert.notEqual(result.item.path, source);
});

test('related output indexing is idempotent and distinguishes intentionally separate items', async t => {
  const { root, store, service, source } = await fixture(t);
  const options = { mode: 'reference', duplicates: 'separate' };
  const first = (await service.importFile(source, options)).item;
  const second = (await service.importFile(source, options)).item;
  const output = path.join(root, 'export.mp4');
  store.link(first.id, 'export', output, { sha256: 'b'.repeat(64), size_bytes: 20 });
  store.link(first.id, 'export', output, { sha256: 'b'.repeat(64), size_bytes: 20 });
  assert.equal(store.get(first.id).links.length, 1);
  assert.equal(store.get(second.id).links.length, 0);
});
