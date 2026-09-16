import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LibraryAssets } from '../dist-core/library/library-assets.js';
import { LibraryStore } from '../dist-core/library/library-store.js';
import { createProject, saveProject } from '../dist-core/projects/project.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'library-assets-')));
  const store = new LibraryStore(path.join(root, 'library.sqlite'));
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const original = path.join(root, 'Nguồn 100%_.mp4');
  await writeFile(original, 'source');
  const source = {
    path: original,
    sha256: createHash('sha256').update('source').digest('hex'),
    name: path.basename(original),
    duration_ms: 4000,
    width: 160,
    height: 90,
    has_audio: false,
  };
  const item = store.add(randomUUID(), source, 'reference');
  return { root, store, item, source, assets: new LibraryAssets(store) };
}
const query = { kind: 'all', search: '', offset: 0, limit: 20 };

test('asset association is immutable by content and repeated registration is idempotent', async (t) => {
  const { root, store, item, assets } = await fixture(t);
  const file = path.join(root, 'output.mp4');
  await writeFile(file, 'first output');
  const first = await assets.register(item.id, 'export', file);
  assert.equal((await assets.register(item.id, 'export', file)).id, first.id);
  await writeFile(file, 'other output');
  const second = await assets.register(item.id, 'export', file);
  assert.notEqual(first.id, second.id);
  assert.equal(store.get(item.id).links.length, 2);
  await assert.rejects(assets.resolve(item.id, first.id), /SOURCE_CHANGED/);
  assert.equal((await assets.resolve(item.id, second.id)).sha256, second.sha256);
  await assert.rejects(assets.register(item.id, 'export', file, first.sha256), /SOURCE_CHANGED/);
  assert.equal(store.get(item.id).links.length, 2);
});

test('derived audio and export remain accessible without the original and detect same-size timestamp changes', async (t) => {
  const { root, source, item, assets, store } = await fixture(t);
  const file = path.join(root, 'music.wav');
  await writeFile(file, 'abcd');
  const link = await assets.register(item.id, 'audio', file);
  const before = await stat(file);
  await rm(source.path);
  assert.equal((await assets.resolve(item.id, link.id)).id, link.id);
  assert.ok(store.protectedPaths().includes(file));
  await writeFile(file, 'dcba');
  await utimes(file, before.atime, before.mtime);
  await assert.rejects(assets.resolve(item.id, link.id), /SOURCE_CHANGED/);
  await rm(file);
  await assert.rejects(assets.resolve(item.id, link.id), /SOURCE_UNAVAILABLE/);
  assert.equal(store.assets(query).total, 1);
});

test('asset views filter type, content, literal search, pagination and hidden content', async (t) => {
  const { root, source, store, item, assets } = await fixture(t);
  for (const [index, kind] of ['project', 'subtitle', 'export', 'audio'].entries()) {
    store.link(item.id, kind, path.join(root, `${kind}.bin`), {
      sha256: String(index).repeat(64),
      size_bytes: index + 1,
    });
  }
  const second = store.add(randomUUID(), { ...source, name: 'Separate content' }, 'reference');
  const audio = path.join(root, 'voice.wav');
  await writeFile(audio, 'voice');
  await assets.register(second.id, 'audio', audio);
  assert.equal(store.assets(query).total, 5);
  assert.equal(store.assets({ ...query, kind: 'audio' }).total, 2);
  assert.equal(store.assets({ ...query, item_id: item.id, kind: 'audio' }).total, 1);
  assert.equal(store.assets({ ...query, search: '100%_' }).total, 4);
  assert.equal(store.assets({ ...query, search: "' OR 1=1 --" }).total, 0);
  assert.deepEqual(store.assets({ ...query, offset: 10001 }).items, []);
  const first = store.assets({ ...query, limit: 2 });
  const next = store.assets({ ...query, offset: 2, limit: 2 });
  assert.equal(new Set([...first.items, ...next.items].map((asset) => asset.id)).size, 4);
  assert.throws(() => store.assets({ ...query, kind: 'random' }), /INVALID_REQUEST/);
  assert.throws(() => store.assets({ ...query, limit: 1000 }), /INVALID_REQUEST/);
  assert.throws(() => store.assets({ ...query, item_id: {} }), /INVALID_REQUEST/);
  store.forget(second.id);
  assert.equal(store.assets(query).total, 4);
  assert.equal(await readFile(audio, 'utf8'), 'voice');
});

test('project association verifies the source content before it is recorded', async (t) => {
  const { root, item, source, store, assets } = await fixture(t);
  const file = path.join(root, 'project.reupmatic.json');
  const snapshot = { cues: [], sample: { start_ms: 0, end_ms: 1000 } };
  await saveProject(
    file,
    createProject({ path: source.path, sha256: 'f'.repeat(64) }, snapshot),
    [],
  );
  await assert.rejects(assets.register(item.id, 'project', file), /LIBRARY_ASSET_SOURCE/);
  assert.equal(store.assets(query).total, 0);
  await saveProject(
    file,
    createProject({ path: source.path, sha256: source.sha256 }, snapshot),
    [],
  );
  const link = await assets.register(item.id, 'project', file);
  assert.equal((await assets.resolve(item.id, link.id)).kind, 'project');
});

test('a composition project may belong to a member source, but not unrelated content', async (t) => {
  const { root, item, source, assets } = await fixture(t);
  const member = {
    path: source.path,
    name: source.name,
    sha256: source.sha256,
    duration_ms: source.duration_ms,
  };
  const composition = {
    version: 1,
    canvas: { width: 320, height: 180, fps: 30 },
    clips: [{ id: 'member', source: member, start_ms: 0, end_ms: 2000, speed: 1 }],
  };
  const project = createProject(
    { path: path.join(root, 'anchor.mp4'), sha256: 'e'.repeat(64) },
    {
      cues: [],
      sample: { start_ms: 0, end_ms: 1000 },
      composition,
    },
  );
  const filename = path.join(root, 'composition.reupmatic.json');
  await saveProject(filename, project);
  const linked = await assets.register(item.id, 'project', filename);
  assert.equal((await assets.resolve(item.id, linked.id)).sha256, linked.sha256);
  project.composition.clips[0].source.sha256 = 'f'.repeat(64);
  await saveProject(filename, project);
  await assert.rejects(assets.register(item.id, 'project', filename), /LIBRARY_ASSET_SOURCE/);
});
