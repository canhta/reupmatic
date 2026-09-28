import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentLibrary } from '../../dist-core/library/content-library.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-library-')));
  await mkdir(path.join(root, 'managed'));
  const dbPath = path.join(root, 'library.sqlite');
  const inspect = async (filename) => {
    const data = await readFile(filename);
    return {
      media_kind: 'video',
      path: filename,
      name: path.basename(filename),
      sha256: createHash('sha256').update(data).digest('hex'),
      duration_ms: 5000,
      width: 320,
      height: 180,
      has_audio: true,
    };
  };
  const library = new ContentLibrary(dbPath, path.join(root, 'managed'), {
    inspectOriginal: inspect,
  });
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });
  const source = path.join(root, 'source.mp4');
  await writeFile(source, 'original bytes');
  return { root, library, source, dbPath, inspect };
}

test('reference import survives reopening without copying original content', async (t) => {
  const { library, source, dbPath, root, inspect } = await fixture(t);
  const result = await library.importOriginal(source, { mode: 'reference', duplicates: 'reuse' });
  assert.equal(result.reused, false);
  assert.equal(result.item.path, source);
  assert.equal(result.item.storage, 'reference');
  library.close();
  const reopened = new ContentLibrary(dbPath, path.join(root, 'managed'), {
    inspectOriginal: inspect,
  });
  try {
    assert.equal(reopened.getContent(result.item.id).sha256, result.item.sha256);
  } finally {
    reopened.close();
  }
});

test('same bytes are reused only under reuse policy; separate import is explicit', async (t) => {
  const { library, source, root } = await fixture(t);
  const first = await library.importOriginal(source, { mode: 'reference', duplicates: 'reuse' });
  const other = path.join(root, 'different-name.mp4');
  await writeFile(other, await readFile(source));
  const reuse = await library.importOriginal(other, { mode: 'reference', duplicates: 'reuse' });
  assert.equal(reuse.reused, true);
  assert.equal(reuse.item.id, first.item.id);
  const separate = await library.importOriginal(other, {
    mode: 'reference',
    duplicates: 'separate',
  });
  assert.notEqual(separate.item.id, first.item.id);
  assert.equal(library.listContent({ search: '', offset: 0, limit: 50 }).total, 2);
});

test('copy import has an independent verified destination and leaves source untouched', async (t) => {
  const { library, source, root } = await fixture(t);
  const { item } = await library.importOriginal(source, {
    mode: 'copy',
    duplicates: 'separate',
  });
  assert.equal(item.storage, 'copy');
  assert.ok(item.path.startsWith(path.join(root, 'managed') + path.sep));
  assert.notEqual(item.path, source);
  assert.deepEqual(await readFile(item.path), await readFile(source));
});

test('relink rejects different bytes without losing asset associations', async (t) => {
  const { library, source, root } = await fixture(t);
  const { item } = await library.importOriginal(source, {
    mode: 'reference',
    duplicates: 'reuse',
  });
  const subtitle = path.join(root, 'captions.srt');
  await writeFile(subtitle, '1\n00:00:00,000 --> 00:00:01,000\nHello\n');
  await library.registerAsset(item.id, 'subtitle', subtitle);
  const wrong = path.join(root, 'wrong.mp4');
  await writeFile(wrong, 'other bytes');
  await assert.rejects(library.relinkOriginal(item.id, wrong), /SOURCE_CHANGED/);
  assert.equal(library.getContent(item.id).path, source);
  const moved = path.join(root, 'moved.mp4');
  await rename(source, moved);
  await library.relinkOriginal(item.id, moved);
  assert.equal(library.getContent(item.id).path, moved);
  assert.equal(library.getContent(item.id).links.length, 1);
});

test('open detects changed source bytes; missing source retains library history', async (t) => {
  const { library, source } = await fixture(t);
  const { item } = await library.importOriginal(source, {
    mode: 'reference',
    duplicates: 'reuse',
  });
  await writeFile(source, 'modified bytes');
  await assert.rejects(library.resolveOriginal(item.id), /SOURCE_CHANGED/);
  assert.equal(library.getContent(item.id).availability, 'changed');
  await rm(source);
  await assert.rejects(library.resolveOriginal(item.id), /SOURCE_UNAVAILABLE/);
  assert.equal(library.getContent(item.id).availability, 'missing');
});

test('removing a listing never deletes originals, copies, projects or exports', async (t) => {
  const { library, source, root } = await fixture(t);
  const { item } = await library.importOriginal(source, { mode: 'copy', duplicates: 'separate' });
  const output = path.join(root, 'output.mp4');
  await writeFile(output, 'render');
  await library.registerAsset(item.id, 'export', output);
  library.removeContent(item.id);
  assert.equal(library.listContent({ search: '', offset: 0, limit: 50 }).total, 0);
  assert.ok((await readFile(source)).length);
  assert.ok((await readFile(item.path)).length);
  assert.equal(await readFile(output, 'utf8'), 'render');
  assert.ok(library.protectedPaths().includes(item.path));
});

test('search treats SQL wildcard characters as literal text and caps pages', async (t) => {
  const { library, root } = await fixture(t);
  const special = path.join(root, '100%_done.mp4');
  await writeFile(special, 'unique');
  await library.importOriginal(special, { mode: 'reference', duplicates: 'separate' });
  assert.equal(library.listContent({ search: '%_', offset: 0, limit: 50 }).total, 1);
  assert.equal(library.listContent({ search: "' OR 1=1 --", offset: 0, limit: 50 }).total, 0);
  assert.throws(
    () => library.listContent({ search: '', offset: 0, limit: 1000 }),
    /INVALID_REQUEST/,
  );
});

test('UI-CM05: sort_by/sort_dir orders the whole matching set before paging', async (t) => {
  const { library, root } = await fixture(t);
  const names = ['charlie.mp4', 'alpha.mp4', 'echo.mp4', 'bravo.mp4', 'delta.mp4'];
  for (const name of names) {
    const file = path.join(root, name);
    await writeFile(file, `bytes-${name}`);
    await library.importOriginal(file, { mode: 'reference', duplicates: 'separate' });
  }
  // A 2-row page sorted ascending by name must reflect the whole 5-item
  // set's order, not just re-sort whatever page the default order put
  // there first (sorting only the visible page is a bug).
  const page1 = library.listContent({
    search: '',
    offset: 0,
    limit: 2,
    sort_by: 'name',
    sort_dir: 'ascending',
  });
  assert.deepEqual(
    page1.items.map((item) => item.name),
    ['alpha.mp4', 'bravo.mp4'],
  );
  const page2 = library.listContent({
    search: '',
    offset: 2,
    limit: 2,
    sort_by: 'name',
    sort_dir: 'ascending',
  });
  assert.deepEqual(
    page2.items.map((item) => item.name),
    ['charlie.mp4', 'delta.mp4'],
  );
  const descending = library.listContent({
    search: '',
    offset: 0,
    limit: 5,
    sort_by: 'name',
    sort_dir: 'descending',
  });
  assert.deepEqual(
    descending.items.map((item) => item.name),
    ['echo.mp4', 'delta.mp4', 'charlie.mp4', 'bravo.mp4', 'alpha.mp4'],
  );
  assert.throws(
    () =>
      library.listContent({
        search: '',
        offset: 0,
        limit: 5,
        sort_by: 'name; DROP TABLE library_items;--',
      }),
    /INVALID_REQUEST/,
  );
});

test('UI-CM05: asset sort_by/sort_dir orders the whole matching set before paging', async (t) => {
  const { library, source, root } = await fixture(t);
  const { item } = await library.importOriginal(source, { mode: 'reference', duplicates: 'reuse' });
  const names = ['charlie.srt', 'alpha.srt', 'echo.srt', 'bravo.srt', 'delta.srt'];
  for (const name of names) {
    const file = path.join(root, name);
    await writeFile(file, `1\n00:00:00,000 --> 00:00:01,000\n${name}\n`);
    await library.registerAsset(item.id, 'subtitle', file);
  }
  // A 2-row page sorted ascending by name must reflect the whole 5-item
  // set's order, not just re-sort whatever page the default order put
  // there first (sorting only the visible page is a bug).
  const page1 = library.listAssets({
    kind: 'all',
    search: '',
    offset: 0,
    limit: 2,
    sort_by: 'name',
    sort_dir: 'ascending',
  });
  assert.deepEqual(
    page1.items.map((asset) => asset.name),
    ['alpha.srt', 'bravo.srt'],
  );
  const page2 = library.listAssets({
    kind: 'all',
    search: '',
    offset: 2,
    limit: 2,
    sort_by: 'name',
    sort_dir: 'ascending',
  });
  assert.deepEqual(
    page2.items.map((asset) => asset.name),
    ['charlie.srt', 'delta.srt'],
  );
  const descending = library.listAssets({
    kind: 'all',
    search: '',
    offset: 0,
    limit: 5,
    sort_by: 'name',
    sort_dir: 'descending',
  });
  assert.deepEqual(
    descending.items.map((asset) => asset.name),
    ['echo.srt', 'delta.srt', 'charlie.srt', 'bravo.srt', 'alpha.srt'],
  );
  assert.throws(
    () =>
      library.listAssets({
        kind: 'all',
        search: '',
        offset: 0,
        limit: 5,
        sort_by: 'name; DROP TABLE library_links;--',
      }),
    /INVALID_REQUEST/,
  );
});

test('a failed copy is not recorded as an available library item', async (t) => {
  const { library, source, root } = await fixture(t);
  await rm(path.join(root, 'managed'), { recursive: true });
  await writeFile(path.join(root, 'managed'), 'not a folder');
  await assert.rejects(library.importOriginal(source, { mode: 'copy', duplicates: 'separate' }));
  assert.equal(library.listContent({ search: '', offset: 0, limit: 50 }).total, 0);
});

test('copy imports never mutate the inspector-owned media registration', async (t) => {
  const { root, library: fixtureLibrary, source } = await fixture(t);
  const inspected = Object.freeze({
    media_kind: 'video',
    path: source,
    name: 'source.mp4',
    sha256: createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
    duration_ms: 5000,
    width: 320,
    height: 180,
    has_audio: false,
  });
  fixtureLibrary.close();
  const library = new ContentLibrary(
    path.join(root, 'library.sqlite'),
    path.join(root, 'managed'),
    {
      inspectOriginal: async () => inspected,
    },
  );
  const result = await library.importOriginal(source, { mode: 'copy', duplicates: 'separate' });
  assert.equal(inspected.path, source);
  assert.notEqual(result.item.path, source);
  library.close();
});

test('related output indexing is idempotent and distinguishes intentionally separate items', async (t) => {
  const { root, library, source } = await fixture(t);
  const options = { mode: 'reference', duplicates: 'separate' };
  const first = (await library.importOriginal(source, options)).item;
  const second = (await library.importOriginal(source, options)).item;
  const output = path.join(root, 'export.mp4');
  await writeFile(output, 'export');
  await library.registerAsset(first.id, 'export', output);
  await library.registerAsset(first.id, 'export', output);
  assert.equal(library.getContent(first.id).links.length, 1);
  assert.equal(library.getContent(second.id).links.length, 0);
});

test('dependency inspection and removal admission are owned by the Library interface', async (t) => {
  const { root, source } = await fixture(t);
  const library = new ContentLibrary(
    path.join(root, 'references.sqlite'),
    path.join(root, 'managed-references'),
    {
      inspectOriginal: async (filename) => ({
        media_kind: 'video',
        path: filename,
        name: path.basename(filename),
        sha256: createHash('sha256')
          .update(await readFile(filename))
          .digest('hex'),
        duration_ms: 5000,
        width: 320,
        height: 180,
        has_audio: true,
      }),
      inspectReferences: () => ({ pending_jobs: 1, posts: 2, pending_posts: 1, workflows: 3 }),
    },
  );
  t.after(() => library.close());
  const { item } = await library.importOriginal(source, {
    mode: 'reference',
    duplicates: 'reuse',
  });
  assert.deepEqual(library.dependencies(item.id), {
    item,
    known_links_only: true,
    pending_jobs: 1,
    posts: 2,
    pending_posts: 1,
    workflows: 3,
  });
  assert.throws(() => library.removeContent(item.id), /LIBRARY_IN_USE/);
  assert.equal(library.getContent(item.id).id, item.id);
  assert.equal('store' in library, false);
});

test('a local import maps audio and subtitle kinds onto their own facts', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-library-kinds-')));
  await mkdir(path.join(root, 'managed'));
  const audio = path.join(root, 'voice.mp3');
  const subtitle = path.join(root, 'captions.srt');
  await writeFile(audio, 'audio bytes');
  await writeFile(subtitle, 'subtitle bytes');
  const inspect = async (filename) => {
    const sha256 = createHash('sha256')
      .update(await readFile(filename))
      .digest('hex');
    if (path.extname(filename) === '.mp3')
      return {
        media_kind: 'audio',
        path: filename,
        name: path.basename(filename),
        sha256,
        duration_ms: 7000,
      };
    return { media_kind: 'subtitle', path: filename, name: path.basename(filename), sha256 };
  };
  const library = new ContentLibrary(
    path.join(root, 'library.sqlite'),
    path.join(root, 'managed'),
    { inspectOriginal: inspect },
  );
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });

  // Copy mode accepts the new kinds through the same extension allowlist it already had for video.
  const audioItem = (await library.importOriginal(audio, { mode: 'copy', duplicates: 'separate' }))
    .item;
  assert.equal(audioItem.media_kind, 'audio');
  assert.deepEqual(audioItem.audio, { duration_ms: 7000 });
  assert.equal(audioItem.video, null);
  assert.notEqual(audioItem.path, audio, 'copy mode owns the bytes');

  const subtitleItem = (
    await library.importOriginal(subtitle, { mode: 'reference', duplicates: 'reuse' })
  ).item;
  assert.equal(subtitleItem.media_kind, 'subtitle');
  assert.equal(subtitleItem.video, null);
  assert.equal(subtitleItem.audio, null);

  const listed = library.listContent({ search: '', offset: 0, limit: 10, media_kinds: ['audio'] });
  assert.deepEqual(
    listed.items.map((entry) => entry.id),
    [audioItem.id],
  );
});
