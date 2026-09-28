import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LibraryStore } from '../../dist-core/library/library-store.js';

const SHA = 'a'.repeat(64);

async function store(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-record-')));
  const value = new LibraryStore(path.join(root, 'library.sqlite'));
  t.after(async () => {
    value.close();
    await rm(root, { recursive: true, force: true });
  });
  return value;
}

function videoSource(overrides = {}) {
  return {
    path: '/tmp/clip.mp4',
    name: 'clip.mp4',
    sha256: SHA,
    size_bytes: 4096,
    media_kind: 'video',
    video: { duration_ms: 5000, width: 320, height: 180, has_audio: true },
    audio: null,
    ...overrides,
  };
}

function id(suffix) {
  return `content-${suffix}`;
}

test('a video carries its probed facts and defaults to a local origin', async (t) => {
  const library = await store(t);
  const item = library.addContent(id('video'), videoSource(), 'reference');

  assert.equal(item.media_kind, 'video');
  assert.deepEqual(item.video, { duration_ms: 5000, width: 320, height: 180, has_audio: true });
  assert.equal(item.audio, null, 'a video never carries audio-kind facts');
  assert.deepEqual(item.origin, { kind: 'local' });
  assert.equal(item.published_at, null, 'a local import has no original publish date');
  assert.ok(item.added_at > 0);
});

test('an audio item carries its duration and no video facts', async (t) => {
  const library = await store(t);
  const item = library.addContent(
    id('audio'),
    videoSource({
      media_kind: 'audio',
      video: null,
      audio: { duration_ms: 12_000 },
      path: '/tmp/voice.mp3',
      name: 'voice.mp3',
    }),
    'reference',
  );
  assert.equal(item.media_kind, 'audio');
  assert.equal(item.video, null);
  assert.deepEqual(item.audio, { duration_ms: 12_000 });
});

test('a subtitle item carries neither video nor audio facts', async (t) => {
  const library = await store(t);
  const item = library.addContent(
    id('subtitle'),
    videoSource({
      media_kind: 'subtitle',
      video: null,
      path: '/tmp/captions.srt',
      name: 'captions.srt',
    }),
    'reference',
  );
  assert.equal(item.media_kind, 'subtitle');
  assert.equal(item.video, null);
  assert.equal(item.audio, null);
});

test('each kind must carry exactly its own facts', async (t) => {
  const library = await store(t);
  // An audio item without a duration, an audio item with video facts, and a video carrying an
  // audio fact are all the silent corruption the per-kind facts exist to prevent.
  assert.throws(
    () =>
      library.addContent(
        id('audio-missing'),
        videoSource({ media_kind: 'audio', video: null, audio: null }),
        'reference',
      ),
    /INVALID_MEDIA/,
  );
  assert.throws(
    () =>
      library.addContent(
        id('audio-video'),
        videoSource({ media_kind: 'audio', audio: { duration_ms: 1000 } }),
        'reference',
      ),
    /INVALID_MEDIA/,
  );
  assert.throws(
    () =>
      library.addContent(
        id('video-audio'),
        videoSource({ audio: { duration_ms: 1000 } }),
        'reference',
      ),
    /INVALID_MEDIA/,
  );
});

test('an image post is not stored in a video-shaped record', async (t) => {
  const library = await store(t);
  const item = library.addContent(
    id('image'),
    videoSource({ media_kind: 'image', video: null, path: '/tmp/post.jpg', name: 'post.jpg' }),
    'reference',
  );
  assert.equal(item.media_kind, 'image');
  assert.equal(item.video, null);
});

test('a non-video may not carry zeroed video facts, and a video may not omit them', async (t) => {
  const library = await store(t);
  // The silent corruption the media kind exists to prevent: an image with a zeroed duration.
  assert.throws(
    () =>
      library.addContent(
        id('bad-image'),
        videoSource({
          media_kind: 'slides',
          video: { duration_ms: 0, width: 0, height: 0, has_audio: false },
        }),
        'reference',
      ),
    /INVALID_MEDIA/,
  );
  assert.throws(
    () => library.addContent(id('bad-video'), videoSource({ video: null }), 'reference'),
    /INVALID_MEDIA/,
  );
});

test('a connector origin round-trips with its own facts, and local rows keep none', async (t) => {
  const library = await store(t);
  const connector = library.addContent(
    id('douyin'),
    videoSource({
      sha256: 'b'.repeat(64),
      origin: {
        kind: 'douyin',
        aweme_id: '7600224486650121526',
        sec_uid: 'MS4wLjABAAAA',
        share_url: 'https://www.douyin.com/video/7600224486650121526',
      },
      published_at: 1_758_153_600_000,
    }),
    'reference',
  );
  assert.equal(connector.origin.kind, 'douyin');
  assert.equal(connector.origin.aweme_id, '7600224486650121526');
  assert.equal(connector.origin.sec_uid, 'MS4wLjABAAAA');
  assert.equal(connector.published_at, 1_758_153_600_000);

  const local = library.addContent(id('local'), videoSource(), 'reference');
  // Per-source facts live inside the variant, so a local row has no connector keys at all.
  assert.deepEqual(Object.keys(local.origin), ['kind']);
});

test('a cover starts pending and both outcomes are recorded states', async (t) => {
  const library = await store(t);
  const item = library.addContent(id('cover'), videoSource(), 'reference');
  assert.equal(item.cover_state, 'pending');
  assert.equal(item.cover_path, null);

  const ready = library.setCover(item.id, { path: '/tmp/covers/a.jpg', state: 'ready' });
  assert.equal(ready.cover_state, 'ready');
  assert.equal(ready.cover_path, '/tmp/covers/a.jpg');

  // Failure is a designed state with a placeholder, not an error and not a blank path.
  const gone = library.setCover(item.id, { state: 'unavailable' });
  assert.equal(gone.cover_state, 'unavailable');
  assert.equal(gone.cover_path, null);
});

test('added_at and published_at are separately sortable and neither is just "date"', async (t) => {
  const library = await store(t);
  library.addContent(id('a'), videoSource({ sha256: 'c'.repeat(64) }), 'reference');
  library.addContent(
    id('b'),
    videoSource({ sha256: 'd'.repeat(64), published_at: 1_700_000_000_000 }),
    'reference',
  );

  for (const sort_by of ['added_at', 'published_at']) {
    const page = library.listContent({ search: '', offset: 0, limit: 10, sort_by });
    // Sorting by a key one row lacks must not drop that row.
    assert.equal(page.total, 2, `${sort_by} dropped a row`);
    assert.equal(page.items.length, 2, `${sort_by} dropped a row`);
  }
});

test('listing and sorting name no origin, so a third origin needs no query change', async () => {
  // The criterion this ticket is really about: the seam is in the right place only if adding
  // RedNote means one variant and one adapter, with no list or query code touched. Asserted
  // structurally, because a test cannot construct an origin the schema does not yet allow.
  const source = await readFile(
    new URL('../../app/core/library/library-store.ts', import.meta.url),
    'utf8',
  );
  const listing = source.slice(
    source.indexOf('listContent(query: ContentStoreQuery'),
    source.indexOf('addContent('),
  );
  assert.ok(listing.length > 0, 'could not locate the listing path');
  for (const marker of ['douyin', 'origin_kind', 'origin_aweme_id', 'rednote']) {
    assert.ok(!listing.includes(marker), `the listing path branches on ${marker}`);
  }
});
