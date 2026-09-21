import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentLibrary } from '../../dist-core/library/content-library.js';
import { createProject, saveProject } from '../../dist-core/projects/project.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'library-assets-')));
  const original = path.join(root, 'Nguồn 100%_.mp4');
  await writeFile(original, 'source');
  const source = {
    media_kind: 'video',
    path: original,
    sha256: createHash('sha256').update('source').digest('hex'),
    name: path.basename(original),
    duration_ms: 4000,
    width: 160,
    height: 90,
    has_audio: false,
  };
  const library = new ContentLibrary(
    path.join(root, 'library.sqlite'),
    path.join(root, 'managed'),
    {
      inspectOriginal: async (filename) => ({
        ...source,
        path: filename,
        name: path.basename(filename),
      }),
    },
  );
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });
  const item = (await library.importOriginal(original, { mode: 'reference', duplicates: 'reuse' }))
    .item;
  return { root, library, item, source };
}
const query = { kind: 'all', search: '', offset: 0, limit: 20 };

test('asset association is immutable by content and repeated registration is idempotent', async (t) => {
  const { root, library, item } = await fixture(t);
  const file = path.join(root, 'output.mp4');
  await writeFile(file, 'first output');
  const first = await library.registerAsset(item.id, 'export', file);
  assert.equal((await library.registerAsset(item.id, 'export', file)).id, first.id);
  await writeFile(file, 'other output');
  const second = await library.registerAsset(item.id, 'export', file);
  assert.notEqual(first.id, second.id);
  assert.equal(library.getContent(item.id).links.length, 2);
  await assert.rejects(library.resolveAsset(item.id, first.id), /SOURCE_CHANGED/);
  assert.equal((await library.resolveAsset(item.id, second.id)).sha256, second.sha256);
  await assert.rejects(
    library.registerAsset(item.id, 'export', file, first.sha256),
    /SOURCE_CHANGED/,
  );
  assert.equal(library.getContent(item.id).links.length, 2);
});

test('derived audio and export remain accessible without the original and detect same-size timestamp changes', async (t) => {
  const { root, source, item, library } = await fixture(t);
  const file = path.join(root, 'music.wav');
  await writeFile(file, 'abcd');
  const link = await library.registerAsset(item.id, 'audio', file);
  const before = await stat(file);
  await rm(source.path);
  assert.equal((await library.resolveAsset(item.id, link.id)).id, link.id);
  assert.ok(library.protectedPaths().includes(file));
  await writeFile(file, 'dcba');
  await utimes(file, before.atime, before.mtime);
  await assert.rejects(library.resolveAsset(item.id, link.id), /SOURCE_CHANGED/);
  await rm(file);
  await assert.rejects(library.resolveAsset(item.id, link.id), /SOURCE_UNAVAILABLE/);
  assert.equal(library.listAssets(query).total, 1);
});

test('asset views filter type, content, literal search, pagination and hidden content', async (t) => {
  const { root, source, library, item } = await fixture(t);
  for (const [index, kind] of ['project', 'subtitle', 'export', 'audio'].entries()) {
    const filename = path.join(root, kind === 'project' ? 'project.reupmatic.json' : `${kind}.bin`);
    if (kind === 'project') {
      await saveProject(
        filename,
        createProject(
          { path: source.path, sha256: source.sha256 },
          { cues: [], sample: { start_ms: 0, end_ms: 1000 } },
        ),
      );
    } else {
      await writeFile(filename, String(index).repeat(index + 1));
    }
    await library.registerAsset(item.id, kind, filename);
  }
  const secondPath = path.join(root, 'separate.mp4');
  await writeFile(secondPath, await readFile(source.path));
  const second = (
    await library.importOriginal(secondPath, { mode: 'reference', duplicates: 'separate' })
  ).item;
  const audio = path.join(root, 'voice.wav');
  await writeFile(audio, 'voice');
  await library.registerAsset(second.id, 'audio', audio);
  assert.equal(library.listAssets(query).total, 5);
  assert.equal(library.listAssets({ ...query, kind: 'audio' }).total, 2);
  assert.equal(library.listAssets({ ...query, item_id: item.id, kind: 'audio' }).total, 1);
  assert.equal(library.listAssets({ ...query, search: '100%_' }).total, 4);
  assert.equal(library.listAssets({ ...query, search: "' OR 1=1 --" }).total, 0);
  assert.deepEqual(library.listAssets({ ...query, offset: 10001 }).items, []);
  const first = library.listAssets({ ...query, limit: 2 });
  const next = library.listAssets({ ...query, offset: 2, limit: 2 });
  assert.equal(new Set([...first.items, ...next.items].map((asset) => asset.id)).size, 4);
  assert.throws(() => library.listAssets({ ...query, kind: 'random' }), /INVALID_REQUEST/);
  assert.throws(() => library.listAssets({ ...query, limit: 1000 }), /INVALID_REQUEST/);
  assert.throws(() => library.listAssets({ ...query, item_id: {} }), /INVALID_REQUEST/);
  library.removeContent(second.id);
  assert.equal(library.listAssets(query).total, 4);
  assert.equal(await readFile(audio, 'utf8'), 'voice');
});

test('project association verifies the source content before it is recorded', async (t) => {
  const { root, item, source, library } = await fixture(t);
  const file = path.join(root, 'project.reupmatic.json');
  const snapshot = { cues: [], sample: { start_ms: 0, end_ms: 1000 } };
  await saveProject(
    file,
    createProject({ path: source.path, sha256: 'f'.repeat(64) }, snapshot),
    [],
  );
  await assert.rejects(library.registerAsset(item.id, 'project', file), /LIBRARY_ASSET_SOURCE/);
  assert.equal(library.listAssets(query).total, 0);
  await saveProject(
    file,
    createProject({ path: source.path, sha256: source.sha256 }, snapshot),
    [],
  );
  const link = await library.registerAsset(item.id, 'project', file);
  assert.equal((await library.resolveAsset(item.id, link.id)).kind, 'project');
});

test('a composition project may belong to a member source, but not unrelated content', async (t) => {
  const { root, item, source, library } = await fixture(t);
  const member = {
    path: source.path,
    name: source.name,
    sha256: source.sha256,
    duration_ms: source.duration_ms,
  };
  const composition = {
    canvas: { width: 320, height: 180, fps: 30 },
    clips: [{ id: 'member', source: member, start_ms: 0, end_ms: 2000, speed: 1, enabled: true }],
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
  const linked = await library.registerAsset(item.id, 'project', filename);
  assert.equal((await library.resolveAsset(item.id, linked.id)).sha256, linked.sha256);
  project.composition.clips[0].source.sha256 = 'f'.repeat(64);
  await saveProject(filename, project);
  await assert.rejects(library.registerAsset(item.id, 'project', filename), /LIBRARY_ASSET_SOURCE/);
});
