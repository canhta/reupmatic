import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentLibrary } from '../../dist-core/library/content-library.js';
import { LibraryStore } from '../../dist-core/library/library-store.js';

async function store(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-filters-')));
  const value = new LibraryStore(path.join(root, 'library.sqlite'));
  t.after(async () => {
    value.close();
    await rm(root, { recursive: true, force: true });
  });
  return value;
}

function source(overrides = {}) {
  return {
    path: '/tmp/clip.mp4',
    name: 'clip.mp4',
    sha256: 'a'.repeat(64),
    size_bytes: 1000,
    media_kind: 'video',
    video: { duration_ms: 5000, width: 320, height: 180, has_audio: true },
    audio: null,
    ...overrides,
  };
}

function seed(library) {
  library.addContent('content-local', source({ sha256: '1'.repeat(64) }), 'reference');
  library.addContent(
    'content-image',
    source({
      sha256: '2'.repeat(64),
      name: 'post.jpg',
      path: '/tmp/post.jpg',
      media_kind: 'image',
      video: null,
      size_bytes: 2000,
    }),
    'reference',
  );
  library.addContent(
    'content-douyin',
    source({
      sha256: '3'.repeat(64),
      name: 'douyin.mp4',
      size_bytes: 8000,
      video: { duration_ms: 20000, width: 1080, height: 1920, has_audio: true },
      origin: {
        kind: 'douyin',
        aweme_id: '7600224486650121526',
        sec_uid: null,
        share_url: null,
      },
      published_at: 1_700_000_000_000,
    }),
    'reference',
  );
  library.addContent(
    'content-old',
    source({
      sha256: '4'.repeat(64),
      name: 'old.mp4',
      origin: { kind: 'douyin', aweme_id: '7600224486650121527', sec_uid: null, share_url: null },
      published_at: 1_500_000_000_000,
    }),
    'reference',
  );
  library.setAvailability('content-old', 'missing');
}

const all = (library, filters = {}) =>
  library.listContent({ search: '', offset: 0, limit: 50, ...filters });

test('media type and origin filters select exactly the requested kinds', async (t) => {
  const library = await store(t);
  seed(library);

  assert.deepEqual(
    all(library, { media_kinds: ['video'] })
      .items.map((item) => item.id)
      .sort(),
    ['content-douyin', 'content-local', 'content-old'],
  );
  assert.deepEqual(
    all(library, { origins: ['douyin'] })
      .items.map((item) => item.id)
      .sort(),
    ['content-douyin', 'content-old'],
  );
  assert.equal(all(library, { origins: [] }).total, 4);
});

test('availability, size and linked filters compose over one matching set', async (t) => {
  const library = await store(t);
  seed(library);

  assert.deepEqual(
    all(library, { availability: ['missing'] }).items.map((item) => item.id),
    ['content-old'],
  );
  assert.deepEqual(
    all(library, { size_bytes: { min: 1500 } })
      .items.map((item) => item.id)
      .sort(),
    ['content-douyin', 'content-image'],
  );
  assert.deepEqual(
    all(library, { media_kinds: ['video'], size_bytes: { max: 5000 } })
      .items.map((item) => item.id)
      .sort(),
    ['content-local', 'content-old'],
  );
});

test('a facet a row lacks excludes nothing: images survive a duration filter', async (t) => {
  const library = await store(t);
  seed(library);

  const long = all(library, { duration_ms: { min: 10000 } });
  assert.ok(long.items.some((item) => item.id === 'content-image'));
  assert.deepEqual(
    long.items
      .filter((item) => item.id !== 'content-image')
      .map((item) => item.id)
      .sort(),
    ['content-douyin'],
  );
  assert.equal(long.total, 2);
});

test('resolution is the orientation-independent short edge, and ignores non-video rows', async (t) => {
  const library = await store(t);
  seed(library);

  assert.deepEqual(
    all(library, { resolution: { min: 720 } })
      .items.map((item) => item.id)
      .sort(),
    ['content-douyin', 'content-image'],
  );
  const wide = all(library, { resolution: { max: 400 } });
  assert.deepEqual(wide.items.map((item) => item.id).sort(), [
    'content-image',
    'content-local',
    'content-old',
  ]);
});

test('published_at is scoped to origins that have it, and never drops local rows', async (t) => {
  const library = await store(t);
  seed(library);

  const recent = all(library, { published_at: { min: 1_600_000_000_000 } });
  assert.deepEqual(recent.items.map((item) => item.id).sort(), [
    'content-douyin',
    'content-image',
    'content-local',
  ]);
  assert.equal(recent.total, 3);
});

test('a numeric range rejects an inverted, non-finite or wrong-typed bound', async (t) => {
  const library = await store(t);
  seed(library);

  assert.throws(() => all(library, { size_bytes: 'big' }), /INVALID_REQUEST/);
  assert.throws(() => all(library, { size_bytes: { min: '1' } }), /INVALID_REQUEST/);
  assert.throws(() => all(library, { size_bytes: { min: 10, max: 5 } }), /INVALID_REQUEST/);
  assert.throws(() => all(library, { size_bytes: { min: Number.NaN } }), /INVALID_REQUEST/);
  assert.throws(() => all(library, { media_kinds: ['movie'] }), /INVALID_REQUEST/);
  assert.throws(() => all(library, { origins: ['youtube'] }), /INVALID_REQUEST/);
  assert.throws(() => all(library, { linked: ['thumbnail'] }), /INVALID_REQUEST/);
  assert.throws(() => all(library, { published_at: { min: -1 } }), /INVALID_REQUEST/);
});

test('sorting by a key a row lacks keeps the row, and filters never reorder ties', async (t) => {
  const library = await store(t);
  seed(library);

  const byPublished = all(library, { sort_by: 'published_at', sort_dir: 'descending' });
  assert.equal(byPublished.total, 4);
  assert.equal(byPublished.items.length, 4);
  assert.deepEqual(
    byPublished.items.map((item) => item.id),
    ['content-douyin', 'content-old', 'content-image', 'content-local'],
  );

  library.addContent('content-tie-a', source({ sha256: '5'.repeat(64) }), 'reference');
  library.addContent('content-tie-b', source({ sha256: '6'.repeat(64) }), 'reference');
  const byName = all(library, { sort_by: 'name', sort_dir: 'ascending' });
  const ties = byName.items.filter((item) => item.name === 'clip.mp4').map((item) => item.id);
  assert.deepEqual(ties, ['content-tie-b', 'content-tie-a', 'content-local']);
});

test('labels filter through the shared taxonomy contract, not a library tag field', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-labels-')));
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
  const labels = [
    { id: 'content-tagged', label_ids: ['hashtag-1'] },
    { id: 'content-other', label_ids: ['hashtag-2'] },
  ];
  const library = new ContentLibrary(
    path.join(root, 'library.sqlite'),
    path.join(root, 'managed'),
    {
      inspectOriginal: inspect,
      contentLabels: () => labels,
    },
  );
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });

  const tagged = path.join(root, 'tagged.mp4');
  const other = path.join(root, 'other.mp4');
  await writeFile(tagged, 'tagged bytes');
  await writeFile(other, 'other bytes');
  const first = (
    await library.importOriginal(tagged, { mode: 'reference', duplicates: 'separate' })
  ).item;
  const second = (
    await library.importOriginal(other, { mode: 'reference', duplicates: 'separate' })
  ).item;
  labels[0] = { id: first.id, label_ids: ['hashtag-1'] };
  labels[1] = { id: second.id, label_ids: ['hashtag-2'] };

  assert.deepEqual(
    library
      .listContent({ search: '', offset: 0, limit: 10, label_ids: ['hashtag-1'] })
      .items.map((item) => item.id),
    [first.id],
  );
  assert.equal(
    library.listContent({ search: '', offset: 0, limit: 10, label_ids: ['missing'] }).total,
    0,
  );
});

test('linked filters match rows carrying that dependent asset, and nothing else', async (t) => {
  const library = await store(t);
  seed(library);
  library.addAsset('content-local', 'project', '/tmp/project.json', {
    sha256: '9'.repeat(64),
    size_bytes: 10,
  });
  library.addAsset('content-douyin', 'export', '/tmp/export.mp4', {
    sha256: '8'.repeat(64),
    size_bytes: 10,
  });

  assert.deepEqual(
    all(library, { linked: ['project'] }).items.map((item) => item.id),
    ['content-local'],
  );
  assert.deepEqual(
    all(library, { linked: ['project', 'export'] })
      .items.map((item) => item.id)
      .sort(),
    ['content-douyin', 'content-local'],
  );
  assert.equal(all(library, { linked: ['subtitle'] }).total, 0);
});

test('an empty filter result is a real, counted empty page', async (t) => {
  const library = await store(t);
  seed(library);
  const page = all(library, { origins: ['douyin'], media_kinds: ['image'] });
  assert.equal(page.total, 0);
  assert.deepEqual(page.items, []);
});
