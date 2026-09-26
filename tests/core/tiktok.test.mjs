import assert from 'node:assert/strict';
import test from 'node:test';
import { destinationAvailable } from '../../dist-core/distribution/publishing/destinations.js';
import {
  parseTikTokOptions,
  TIKTOK_CAPABILITIES,
  TIKTOK_DEFAULT_OPTIONS,
  TIKTOK_MAX_DIMENSION,
  TIKTOK_MAX_FPS,
  TIKTOK_MIN_FPS,
  tiktokCaptionTitle,
  tiktokDisclosure,
  tiktokPostInfo,
  tiktokPreflight,
  tiktokUploadPlan,
} from '../../dist-core/distribution/publishing/tiktok.js';
import { parseFrameRate } from '../../dist-core/media/frame-rate.js';

const post = {
  title: 'Tiêu đề',
  body: 'Nội dung',
  links: [],
  planned: null,
};
const good = {
  duration_ms: 60_000,
  width: 1080,
  height: 1920,
  size_bytes: 10_000_000,
  fps: 30,
};

const blocking = (problems) =>
  problems.filter((problem) => problem.severity === 'blocking').map((problem) => problem.code);

test('TikTok has no native schedule, so any planned post fails preflight and nothing is sent', () => {
  assert.equal(TIKTOK_CAPABILITIES.native_schedule, null);
  assert.deepEqual(blocking(tiktokPreflight(post, good, 0)), []);
  const planned = { ...post, planned: { instant: 10_000_000, timezone: 'UTC' } };
  assert.deepEqual(blocking(tiktokPreflight(planned, good, 0)), ['PUBLISH_SCHEDULE_UNSUPPORTED']);
});

test('TikTok preflight enforces the verified media envelope including creator max duration', () => {
  const codes = (media, limits) => blocking(tiktokPreflight(post, media, 0, limits));
  assert.deepEqual(codes({ ...good, duration_ms: 10 * 60 * 1000 + 1 }), ['PUBLISH_MEDIA_TOO_LONG']);
  assert.deepEqual(codes(good, { max_video_post_duration_ms: 30_000 }), ['PUBLISH_MEDIA_TOO_LONG']);
  assert.deepEqual(codes(good, { max_video_post_duration_ms: 120_000 }), []);
  assert.deepEqual(codes({ ...good, size_bytes: TIKTOK_CAPABILITIES.media.max_bytes + 1 }), [
    'PUBLISH_MEDIA_TOO_LARGE',
  ]);
  assert.deepEqual(codes({ ...good, width: 359, height: 1080 }), ['PUBLISH_MEDIA_RESOLUTION']);
  assert.deepEqual(codes({ ...good, width: TIKTOK_MAX_DIMENSION + 1, height: 1080 }), [
    'PUBLISH_MEDIA_RESOLUTION',
  ]);
  assert.deepEqual(codes({ ...good, fps: TIKTOK_MIN_FPS - 1 }), ['PUBLISH_MEDIA_FRAMERATE']);
  assert.deepEqual(codes({ ...good, fps: TIKTOK_MAX_FPS + 1 }), ['PUBLISH_MEDIA_FRAMERATE']);

  // The problems carry the destination's real limits (including the creator max) for the UI copy.
  const params = (media, limits) =>
    Object.fromEntries(
      tiktokPreflight(post, media, 0, limits).map((problem) => [problem.code, problem.params]),
    );
  assert.deepEqual(params({ ...good, duration_ms: 700_000 }, undefined).PUBLISH_MEDIA_TOO_LONG, {
    seconds: 600,
  });
  assert.deepEqual(params(good, { max_video_post_duration_ms: 30_000 }).PUBLISH_MEDIA_TOO_LONG, {
    seconds: 30,
  });
  assert.deepEqual(
    params({ ...good, width: 100, height: 100 }, undefined).PUBLISH_MEDIA_RESOLUTION,
    {
      min_width: 360,
      min_height: 360,
    },
  );
  assert.deepEqual(params({ ...good, fps: 10 }, undefined).PUBLISH_MEDIA_FRAMERATE, {
    min: 23,
    max: 60,
  });
  assert.deepEqual(
    params({ ...good, size_bytes: TIKTOK_CAPABILITIES.media.max_bytes + 1 }, undefined)
      .PUBLISH_MEDIA_TOO_LARGE,
    { gigabytes: 4 },
  );
});

test('caption composition becomes the TikTok title and a clip is a warning, not a silent cut', () => {
  const link = (id, url) => ({ id, name: id, url });
  assert.equal(
    tiktokCaptionTitle({ ...post, links: [link('a', 'https://a.example/1')] }),
    'Nội dung\nhttps://a.example/1',
  );
  const clipped = tiktokPreflight({ ...post, body: 'x'.repeat(2300), links: [] }, good, 0);
  assert.deepEqual(
    clipped.map((p) => [p.code, p.severity]),
    [['PUBLISH_CAPTION_CLIPPED', 'warning']],
  );
  assert.equal(tiktokCaptionTitle({ ...post, body: 'x'.repeat(2300), links: [] }).length, 2200);
});

test('TikTok interaction toggles are off by default, as the content-sharing guidelines require', () => {
  assert.equal(TIKTOK_DEFAULT_OPTIONS.allow_comment, false);
  assert.equal(TIKTOK_DEFAULT_OPTIONS.allow_duet, false);
  assert.equal(TIKTOK_DEFAULT_OPTIONS.allow_stitch, false);
  // No disclosure or AI label is preselected, and privacy still has no default.
  assert.equal(TIKTOK_DEFAULT_OPTIONS.brand_content_toggle, false);
  assert.equal(TIKTOK_DEFAULT_OPTIONS.brand_organic_toggle, false);
  assert.equal(TIKTOK_DEFAULT_OPTIONS.is_aigc, false);
  assert.equal(TIKTOK_DEFAULT_OPTIONS.privacy_level, '');
});

test('commercial disclosure: a bare disclosure needs a choice and a paid partnership cannot be private', () => {
  const withOptions = (tiktok) => ({ ...post, options: { youtube: null, tiktok } });
  const codes = (tiktok) => blocking(tiktokPreflight(withOptions(tiktok), good, 0));

  const privateBase = { ...TIKTOK_DEFAULT_OPTIONS, privacy_level: 'SELF_ONLY' };
  assert.deepEqual(codes({ ...privateBase, disclose: true, brand_content_toggle: true }), [
    'PUBLISH_PRIVACY_BRANDED_SELF_ONLY',
  ]);
  assert.deepEqual(codes({ ...privateBase, disclose: true }), ['PUBLISH_DISCLOSURE_REQUIRED']);
  assert.deepEqual(
    codes({ ...privateBase, disclose: true, brand_organic_toggle: true }),
    [],
    'promotional content may stay private',
  );
  assert.deepEqual(
    codes({
      ...privateBase,
      disclose: true,
      brand_content_toggle: true,
      privacy_level: 'PUBLIC_TO_EVERYONE',
    }),
    [],
  );

  const label = (brand_content_toggle, brand_organic_toggle) =>
    tiktokDisclosure({ brand_content_toggle, brand_organic_toggle });
  assert.equal(label(false, false), null);
  assert.equal(label(false, true), 'promotional_content');
  assert.equal(label(true, false), 'paid_partnership');
  assert.equal(label(true, true), 'paid_partnership', 'a partnership label wins');
});

test('privacy has no default: options are exactly the fields the creator UI supplies', () => {
  assert.equal(parseTikTokOptions(null), null);
  assert.equal(parseTikTokOptions(undefined), null);
  const options = {
    privacy_level: 'SELF_ONLY',
    allow_comment: false,
    allow_duet: false,
    allow_stitch: false,
    disclose: true,
    brand_content_toggle: true,
    brand_organic_toggle: false,
    is_aigc: true,
  };
  assert.deepEqual(parseTikTokOptions(options), options);
  assert.throws(() => parseTikTokOptions({ ...options, privacy_level: '' }), /INVALID_REQUEST/);
  const { privacy_level: _privacy, ...missing } = options;
  assert.throws(() => parseTikTokOptions(missing), /INVALID_REQUEST/);
  assert.throws(() => parseTikTokOptions({ ...options, allow_comment: 'yes' }), /INVALID_REQUEST/);
  assert.deepEqual(tiktokPostInfo(post, options), {
    title: 'Nội dung',
    privacy_level: 'SELF_ONLY',
    disable_comment: true,
    disable_duet: true,
    disable_stitch: true,
    brand_content_toggle: true,
    brand_organic_toggle: false,
    is_aigc: true,
  });
});

test('FILE_UPLOAD chunks stay within the documented 5–64 MB / 1–1000 envelope', () => {
  assert.deepEqual(tiktokUploadPlan(1024), { chunk_size: 1024, total_chunk_count: 1 });
  assert.deepEqual(tiktokUploadPlan(5 * 1024 * 1024), {
    chunk_size: 5 * 1024 * 1024,
    total_chunk_count: 1,
  });
  const big = tiktokUploadPlan(4 * 1024 * 1024 * 1024);
  assert.ok(big.chunk_size >= 5 * 1024 * 1024 && big.chunk_size <= 64 * 1024 * 1024);
  assert.ok(big.total_chunk_count <= 1000);
  assert.equal(big.chunk_size * (big.total_chunk_count - 1) < 4 * 1024 * 1024 * 1024, true);
  assert.throws(() => tiktokUploadPlan(0), /INVALID_MEDIA/);
});

test('TikTok is a publishable platform on the shared destination seam', () => {
  assert.equal(destinationAvailable('tiktok'), true);
  assert.equal(destinationAvailable('facebook_page'), true);
  assert.equal(destinationAvailable('youtube'), true);
});

test('ffprobe ratio frame rates parse to decimals for the TikTok fps envelope', () => {
  assert.equal(parseFrameRate('30'), 30);
  assert.equal(parseFrameRate('30000/1001'), 30000 / 1001);
  assert.equal(parseFrameRate('60/1'), 60);
  assert.throws(() => parseFrameRate('0'), /INVALID_FRAME_RATE/);
  assert.throws(() => parseFrameRate('30/0'), /INVALID_FRAME_RATE/);
  assert.throws(() => parseFrameRate(''), /INVALID_FRAME_RATE/);
});
