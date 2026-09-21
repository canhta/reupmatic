import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { CatalogDatabase } from '../../dist-core/catalog/catalog-database.js';
import {
  buildDouyinIntake,
  MAX_DOUYIN_TAG_LENGTH,
  probeFactsFromDownload,
  resolvedVideoFacts,
  sanitizeDouyinTag,
} from '../../dist-core/library/douyin/intake.js';
import {
  assignDouyinTags,
  douyinTagLabelData,
} from '../../dist-core/library/douyin/intake-tags.js';
import { LibraryStore } from '../../dist-core/library/library-store.js';
import { mapDouyinDetail } from '../../dist-core/sources/douyin-discovery.js';
import { TaxonomyStore } from '../../dist-core/taxonomy/taxonomy-store.js';

const AWEME_ID = '7600224486650121526';
const CAPTURED_AT = 1_758_200_000_000;
const DOWNLOADED_AT = CAPTURED_AT + 60_000;

/**
 * The documented payload shape, with every facet ticket 09 must persist. `url_list` mirrors are
 * present on purpose so the tests can prove they never reach durable state.
 */
function payload(overrides = {}) {
  return {
    status_code: 0,
    aweme_detail: {
      aweme_id: AWEME_ID,
      desc: 'Bánh mì Sài Gòn#streetfood',
      create_time: 1_758_153_600,
      duration: 19_000,
      aweme_type: 0,
      is_top: 1,
      share_info: { share_url: `https://www.douyin.com/video/${AWEME_ID}` },
      author: {
        uid: 'u-1',
        nickname: 'Quán Cô Ba',
        sec_uid: 'MS4wLjABAAAA-sec-uid',
        avatar_thumb: { uri: 'avatar/abc', url_list: ['https://cdn.example/avatar.jpg'] },
      },
      statistics: {
        digg_count: 5000,
        comment_count: 120,
        share_count: 40,
        collect_count: 77,
      },
      text_extra: [
        { hashtag_name: 'streetfood', hashtag_id: 'h-1' },
        { hashtag_name: '越南美食', hashtag_id: 'h-2' },
        { type: 0, nickname: 'Bếp Nhà', sec_uid: 'ms-2' },
      ],
      music: { id: 123, title: 'Nhạc nền', author: 'Ca sĩ' },
      mix_info: { mix_id: 'mix-1', mix_name: 'Phố ẩm thực' },
      anchor_info: {
        type: 'product',
        content: JSON.stringify({ title: 'Nồi chiên', url: 'https://shop.example/item' }),
      },
      video: {
        duration: 19_000,
        ratio: '1080p',
        format: 'mp4',
        cover: { uri: 'cover/abc', url_list: ['https://cdn.example/cover.jpg?Expires=1'] },
        bit_rate: [
          {
            gear_name: 'normal_1080_0',
            bit_rate: 2_400_000,
            is_h265: 1,
            play_addr: {
              width: 1080,
              height: 1920,
              data_size: 5_700_000,
              uri: 'v/high',
              url_list: ['https://cdn.example/v/high?Expires=1'],
            },
          },
          {
            gear_name: 'normal_540_0',
            bit_rate: 900_000,
            play_addr: {
              width: 540,
              height: 960,
              data_size: 2_100_000,
              uri: 'v/low',
              url_list: ['https://cdn.example/v/low?Expires=1'],
            },
          },
        ],
      },
      ...overrides,
    },
  };
}

function projection(overrides = {}, input = {}) {
  const outcome = mapDouyinDetail(payload(overrides), CAPTURED_AT);
  assert.equal(outcome.ok, true);
  const { value } = outcome;
  const intake = buildDouyinIntake({
    detail: value,
    downloadedAt: DOWNLOADED_AT,
    takenTierIndex: 0,
    ...input,
  });
  return { intake, raw: value.raw };
}

const PROBE = {
  container: 'mov,mp4,m4a,3gp,3g2,mj2',
  codec: 'h264',
  width: 1080,
  height: 1920,
  durationMs: 20_000,
  frameRate: '30/1',
  hasAudio: true,
};

async function store(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-douyin-')));
  const library = new LibraryStore(path.join(root, 'library.sqlite'));
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });
  return { library, root };
}

/** Adds a Douyin-origin content item whose `aweme_id` matches the fixture. */
function addItem(library, { mediaKind = 'video', withVideo = true } = {}) {
  return library.addContent(
    `content-${mediaKind}`,
    {
      path: `/tmp/${mediaKind}.mp4`,
      name: `${mediaKind}.mp4`,
      sha256: 'd'.repeat(64),
      size_bytes: 1000,
      media_kind: mediaKind,
      video: withVideo ? { duration_ms: 20_000, width: 1080, height: 1920, has_audio: true } : null,
      audio: null,
      origin: {
        kind: 'douyin',
        aweme_id: AWEME_ID,
        sec_uid: 'MS4wLjABAAAA-sec-uid',
        share_url: `https://www.douyin.com/video/${AWEME_ID}`,
      },
      published_at: 1_758_153_600_000,
    },
    'reference',
  );
}

test('hashtags are read from text_extra, mentions stay distinct, no-space captions work', () => {
  const { intake } = projection();
  assert.deepEqual(
    intake.tags.map((tag) => tag.name),
    ['streetfood', '越南美食'],
  );
  assert.equal(intake.tags[0].hashtagId, 'h-1');
  assert.equal(intake.tags[1].hashtagId, 'h-2');
  // The mention is a mention, not a hashtag.
  assert.deepEqual(intake.mentions, [{ nickname: 'Bếp Nhà', secUid: 'ms-2' }]);
});

test('a Chinese caption with glued hashtags is not split out of desc', () => {
  const { intake } = projection({
    desc: '越南街头美食#美食#小吃',
    text_extra: [
      { hashtag_name: '美食', hashtag_id: 'h-c1' },
      { hashtag_name: '小吃', hashtag_id: 'h-c2' },
    ],
  });
  assert.deepEqual(
    intake.tags.map((tag) => tag.name),
    ['美食', '小吃'],
  );
  assert.equal(intake.tags[1].hashtagId, 'h-c2');
});

test('a #hash that only exists in desc is never invented as a tag', () => {
  const { intake } = projection({ desc: '#decoy only in desc', text_extra: [] });
  assert.deepEqual(intake.tags, []);
});

test('a hostile tag is sanitized and capped before it can persist or display', () => {
  const hostile = `${'x'.repeat(400)}\u0000\n; rm -rf / $(id) \`whoami\``;
  const { intake } = projection({
    text_extra: [{ hashtag_name: `#  ${hostile}`, hashtag_id: 'h-bad' }],
  });
  const name = intake.tags[0].name;
  assert.ok([...name].length <= MAX_DOUYIN_TAG_LENGTH, 'tag was not length-capped');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters must never persist
  assert.ok(!/[\u0000-\u001f\u007f]/.test(name), 'a control character survived sanitization');
  assert.equal(sanitizeDouyinTag('#  a\u0000\nb   c'), 'a b c');
});

test('the whole offered ladder and the tier actually taken are both persisted', () => {
  const { intake } = projection();
  assert.equal(intake.video.tiers.length, 2);
  assert.deepEqual(intake.video.tiers[0], {
    gearName: 'normal_1080_0',
    bitRate: 2_400_000,
    codec: 'h265',
    width: 1080,
    height: 1920,
    dataSize: 5_700_000,
    uri: 'v/high',
  });
  assert.equal(intake.video.tiers[1].gearName, 'normal_540_0');
  assert.equal(intake.video.takenTierIndex, 0);
  assert.equal(intake.video.takenTier.gearName, 'normal_1080_0');
  assert.equal(intake.video.takenTier.dataSize, 5_700_000);
  // duration, ratio, format and the codec flag.
  assert.equal(intake.video.durationMs, 19_000);
  assert.equal(intake.video.ratio, '1080p');
  assert.equal(intake.video.format, 'mp4');
  assert.equal(intake.video.codec, 'h265');
});

test('no expiring CDN URL reaches durable state: only stable uris are kept', () => {
  const { intake } = projection();
  assert.equal(intake.video.coverUri, 'cover/abc');
  assert.equal(intake.video.tiers[0].uri, 'v/high');
  const serialized = JSON.stringify(intake);
  assert.ok(!serialized.includes('url_list'), 'a url_list survived into the projection');
  assert.ok(!serialized.includes('Expires'));
  assert.ok(!serialized.includes('cdn.example'));
});

test('the probe wins over the payload and the disagreement is recorded, not dropped', () => {
  const { intake } = projection({}, { probe: PROBE });
  assert.deepEqual([...intake.disagreements].sort(), ['codec', 'duration']);
  const facts = resolvedVideoFacts(intake);
  assert.equal(facts.durationMs, 20_000, 'payload claim beat the probe');
  assert.equal(facts.codec, 'h264');
  assert.equal(facts.frameRate, '30/1');
  assert.equal(facts.hasAudio, true);
});

test('the path that served the bytes is recorded rather than assumed', async (t) => {
  assert.equal(projection().intake.servedBy, 'direct');
  assert.equal(projection({}, { servedBy: 'page' }).intake.servedBy, 'page');

  const { library } = await store(t);
  const { intake, raw } = projection();
  const item = addItem(library);
  library.saveDouyinIntake(item.id, intake, raw);
  assert.equal(library.getDouyinIntake(item.id).intake.servedBy, 'direct');
  assert.throws(
    () => library.saveDouyinIntake(item.id, { ...intake, servedBy: 'telepathy' }, raw),
    /INVALID_INTAKE/,
  );
});

test('without a probe the payload is the only claim available', () => {
  const facts = resolvedVideoFacts(projection().intake);
  assert.equal(facts.durationMs, 19_000);
  assert.equal(facts.frameRate, null);
});

test('the worker download result maps onto probe facts without losing container or frame rate', () => {
  const probe = probeFactsFromDownload({
    path: '/tmp/clip.mp4',
    bytes: 5_700_000,
    sha256: 'a'.repeat(64),
    container: 'mov,mp4',
    codec: 'h264',
    duration_ms: 20_000,
    width: 1080,
    height: 1920,
    frame_rate: '30000/1001',
    has_audio: true,
    reused: false,
    resumed: false,
  });
  assert.deepEqual(probe, {
    container: 'mov,mp4',
    codec: 'h264',
    width: 1080,
    height: 1920,
    durationMs: 20_000,
    frameRate: '30000/1001',
    hasAudio: true,
  });
});

test('the original publish date and our download date are both kept and distinguishable', () => {
  const { intake } = projection();
  assert.equal(intake.publishedAt, 1_758_153_600 * 1000);
  assert.equal(intake.downloadedAt, DOWNLOADED_AT);
  assert.notEqual(intake.publishedAt, intake.downloadedAt);
});

test('identity, share link, music, collection, anchors and the top flag are persisted', () => {
  const { intake } = projection();
  assert.equal(intake.author.secUid, 'MS4wLjABAAAA-sec-uid');
  assert.equal(intake.author.nickname, 'Quán Cô Ba');
  assert.equal(intake.author.avatarUri, 'avatar/abc');
  assert.equal(intake.shareUrl, `https://www.douyin.com/video/${AWEME_ID}`);
  assert.deepEqual(intake.music, { id: '123', title: 'Nhạc nền', author: 'Ca sĩ' });
  assert.deepEqual(intake.mixInfo, { id: 'mix-1', name: 'Phố ẩm thực' });
  assert.deepEqual(intake.anchorLinks, [
    { kind: 'product', title: 'Nồi chiên', url: 'https://shop.example/item' },
  ]);
  assert.equal(intake.awemeType, 0);
  assert.equal(intake.isTop, true);
});

test('an image post is not stored video-shaped, and its media type survives a round trip', async (t) => {
  const image = projection({
    aweme_type: 68,
    images: [{ uri: 'img/1', width: 1080, height: 1440 }],
  }).intake;
  assert.equal(image.mediaType, 'image');
  assert.equal(image.video, null);
  assert.deepEqual(image.images, [{ uri: 'img/1', width: 1080, height: 1440 }]);

  const slides = projection({
    aweme_type: 68,
    images: [{ uri: 'i/1' }, { uri: 'i/2' }],
  }).intake;
  assert.equal(slides.mediaType, 'slides');

  const { library } = await store(t);
  const item = addItem(library, { mediaKind: 'image', withVideo: false });
  library.saveDouyinIntake(item.id, image, {});
  const record = library.getDouyinIntake(item.id);
  assert.equal(record.intake.mediaType, 'image');
  assert.equal(record.intake.video, null);
});

test('the raw payload is retained exactly once beside the projection and reads back intact', async (t) => {
  const { library, root } = await store(t);
  const { intake, raw } = projection({}, { probe: PROBE });
  const item = addItem(library);
  library.saveDouyinIntake(item.id, intake, raw);

  const record = library.getDouyinIntake(item.id);
  assert.deepEqual(record.intake, intake);
  assert.deepEqual(record.raw, raw);
  assert.ok(!('raw' in record.intake), 'the raw payload was duplicated into the projection');

  // Re-intake replaces the one row rather than accumulating copies.
  library.saveDouyinIntake(item.id, intake, raw);
  library.close();
  const inspect = new DatabaseSync(path.join(root, 'library.sqlite'));
  assert.equal(Number(inspect.prepare('SELECT COUNT(*) AS n FROM douyin_intake').get().n), 1);
  inspect.close();
});

test('a counter cannot be persisted without the instant it was captured', async (t) => {
  const { library } = await store(t);
  const { intake, raw } = projection();
  const item = addItem(library);
  assert.throws(
    () =>
      library.saveDouyinIntake(
        item.id,
        { ...intake, counters: { ...intake.counters, capturedAt: undefined } },
        raw,
      ),
    /DOUYIN_COUNTER_CAPTURED_AT_REQUIRED/,
  );
  assert.equal(library.getDouyinIntake(item.id), null);
});

test('an intake projection cannot be attached to a non-Douyin item', async (t) => {
  const { library } = await store(t);
  const { intake, raw } = projection();
  const local = library.addContent(
    'content-local1',
    {
      path: '/tmp/local.mp4',
      name: 'local.mp4',
      sha256: 'e'.repeat(64),
      size_bytes: 1000,
      media_kind: 'video',
      video: { duration_ms: 5000, width: 320, height: 180, has_audio: true },
      audio: null,
    },
    'reference',
  );
  assert.throws(() => library.saveDouyinIntake(local.id, intake, raw), /INVALID_REQUEST/);
});

test('a hashtag becomes a tag label through the shared taxonomy, with no parallel tag field', () => {
  const db = new CatalogDatabase(':memory:');
  const taxonomy = new TaxonomyStore(db);
  try {
    const { intake } = projection();
    const assigned = assignDouyinTags(taxonomy, 'content-douyin-1', intake.tags);
    assert.equal(assigned.label_ids.length, 2);
    const labels = taxonomy.list();
    assert.equal(labels.length, 2);
    assert.ok(labels.every((label) => label.kind === 'tag'));
    assert.deepEqual(labels.map((label) => label.name).sort(), ['streetfood', '越南美食'].sort());
    // The shared Label is not widened for one connector's provenance.
    assert.ok(labels.every((label) => !('hashtag_id' in label) && !('hashtagId' in label)));

    // Re-running is idempotent: the same hashtag maps to the same label.
    assignDouyinTags(taxonomy, 'content-douyin-1', intake.tags);
    assert.equal(taxonomy.list().length, 2);
  } finally {
    db.close();
  }
});

test('an existing hand-applied tag is reused rather than duplicated', () => {
  const db = new CatalogDatabase(':memory:');
  const taxonomy = new TaxonomyStore(db);
  try {
    taxonomy.save({
      id: 'label_manual01',
      expected_revision: null,
      name: 'STREETFOOD',
      kind: 'tag',
      archived: false,
    });
    const assigned = assignDouyinTags(taxonomy, 'content-douyin-2', [
      { name: 'streetfood', hashtagId: 'h-1' },
    ]);
    assert.equal(taxonomy.list().length, 1);
    assert.deepEqual(assigned.label_ids, ['label_manual01']);
  } finally {
    db.close();
  }
});

test('douyinTagLabelData dedupes by normalized name and never widens the label', () => {
  const labels = douyinTagLabelData([
    { name: 'Streetfood', hashtagId: 'a' },
    { name: 'streetfood', hashtagId: 'b' },
    { name: '  ', hashtagId: 'c' },
  ]);
  assert.deepEqual(labels, [{ name: 'Streetfood', kind: 'tag', archived: false }]);
});
