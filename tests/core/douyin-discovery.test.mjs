import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDouyinResponse,
  isDouyinChallengePath,
  mapDouyinDetail,
  mapDouyinProfilePage,
  summarizeDouyinBody,
} from '../../dist-core/sources/douyin-discovery.js';

const AWEME_ID = '7600224486650121526';

function body(payload) {
  return JSON.stringify(payload);
}

/** The shape the real endpoint returns, trimmed to the fields this module reads. */
function detailPayload(overrides = {}) {
  return {
    status_code: 0,
    aweme_detail: {
      aweme_id: AWEME_ID,
      desc: 'Bánh mì Sài Gòn #streetfood',
      create_time: 1758153600,
      duration: 19000,
      share_info: { share_url: 'https://www.douyin.com/video/7600224486650121526' },
      author: {
        uid: 'u-1',
        nickname: 'Quán Cô Ba',
        sec_uid: 'MS4wLjABAAAA-sec-uid',
        avatar_thumb: { uri: 'avatar/abc' },
      },
      statistics: {
        digg_count: 5000,
        comment_count: 120,
        share_count: 40,
        collect_count: 77,
      },
      video: {
        duration: 19000,
        ratio: '1080p',
        format: 'mp4',
        cover: { uri: 'cover/abc' },
        bit_rate: [
          {
            gear_name: 'normal_1080_0',
            bit_rate: 2_400_000,
            is_h265: 1,
            play_addr: { width: 1080, height: 1920, data_size: 5_700_000, uri: 'v/high' },
          },
          {
            gear_name: 'normal_540_0',
            bit_rate: 900_000,
            play_addr: { width: 540, height: 960, data_size: 2_100_000, uri: 'v/low' },
          },
        ],
      },
      ...overrides,
    },
  };
}

test('an Argus refusal is deterministic and reported as verification_required', () => {
  const outcome = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 403,
    body: 'Blocked by ArgusSecurityPlugin Uifid Not Found',
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'verification_required');
  assert.equal(outcome.failure.retryable, false);
});

test('the refusal marker outranks the status family, so a bare 403 stays retryable', () => {
  const marked = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 403,
    body: 'ArgusSecurityPlugin',
  });
  const bare = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 403,
    body: 'forbidden',
  });
  assert.equal(marked.failure.kind, 'verification_required');
  assert.equal(bare.failure.kind, 'rate_limited');
  assert.equal(bare.failure.retryable, true);
});

test('a 200 with an empty body is a missing session, never an empty channel', () => {
  const outcome = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/post/',
    httpStatus: 200,
    body: '',
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'login_required');
  assert.equal(outcome.failure.retryable, false);
});

test('a 429 or a 5xx is rate limiting, the one retryable kind', () => {
  for (const httpStatus of [429, 500, 503]) {
    const outcome = classifyDouyinResponse({
      path: '/aweme/v1/web/aweme/post/',
      httpStatus,
      body: 'slow down',
    });
    assert.equal(outcome.failure.kind, 'rate_limited', httpStatus);
    assert.equal(outcome.failure.retryable, true, httpStatus);
  }
});

test('status_code 2483 is a login prompt, never an empty result', () => {
  const outcome = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body({ status_code: 2483, status_msg: '请先登录' }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'login_required');
  assert.equal(outcome.failure.statusCode, 2483);
});

test('an unrecognised login message is caught even with an unknown status code', () => {
  const outcome = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body({ status_code: 9999, status_msg: '请先登录后再试' }),
  });
  assert.equal(outcome.failure.kind, 'login_required');
});

test('an unknown non-zero status is rejected rather than retried', () => {
  const outcome = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body({ status_code: 8, status_msg: 'unknown' }),
  });
  assert.equal(outcome.failure.kind, 'rejected');
  assert.equal(outcome.failure.retryable, false);
});

test('a non-JSON 200 is malformed, not success', () => {
  const outcome = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: '<!doctype html>',
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'malformed');
});

test('a clean 200 payload classifies as ok', () => {
  const outcome = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body(detailPayload()),
  });
  assert.equal(outcome.ok, true);
});

test('challenge traffic is recognised by pathname, and the API endpoints are not', () => {
  const CHALLENGE_TRAFFIC = [
    'https://www.douyin.com/verifycenter/captcha/v2',
    'https://sf1-cdn-tos.douyinstatic.com/obj/rc-verifycenter/1.0.0.1/mona.js',
    'https://lf-cdn-tos.douyinstatic.com/obj/static/sec_sdk_build/1.0.0.8/captcha/index.js',
    'https://www.douyin.com/captcha/reportFrontend',
  ];
  for (const url of CHALLENGE_TRAFFIC) {
    assert.equal(isDouyinChallengePath(new URL(url).pathname), true, url);
  }
  assert.equal(isDouyinChallengePath('/aweme/v1/web/aweme/detail/'), false);
  assert.equal(isDouyinChallengePath('/aweme/v1/web/aweme/post/'), false);
});

test('detail maps the ladder, the statistics and the durable author identity', () => {
  const classified = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body(detailPayload()),
  });
  assert.equal(classified.ok, true);
  const outcome = mapDouyinDetail(classified.value, 1_758_200_000_000);
  assert.equal(outcome.ok, true);
  const detail = outcome.value;
  assert.equal(detail.awemeId, AWEME_ID);
  assert.equal(detail.mediaType, 'video');
  assert.equal(detail.author.secUid, 'MS4wLjABAAAA-sec-uid');
  assert.equal(detail.shareUrl, 'https://www.douyin.com/video/7600224486650121526');
  assert.equal(detail.createTime, 1758153600);

  // The whole ladder the source offered, not just the one we would download.
  assert.equal(detail.video.tiers.length, 2);
  assert.deepEqual(detail.video.tiers[0], {
    gearName: 'normal_1080_0',
    bitRate: 2_400_000,
    width: 1080,
    height: 1920,
    dataSize: 5_700_000,
    codec: 'h265',
    uri: 'v/high',
  });
  assert.equal(detail.video.tiers[1].codec, 'h264');

  // Counters carry the moment they were read; a bare number would silently go stale.
  assert.equal(detail.statistics.diggCount, 5000);
  assert.equal(detail.statistics.capturedAt, 1_758_200_000_000);
  // A withheld counter is absent, never zero.
  assert.equal(detail.statistics.playCount, null);

  assert.equal(detail.raw.aweme_detail.aweme_id, AWEME_ID);
});

test('the tier ladder is sorted best-first (pixels desc, then bit_rate desc) — Douyin does not', () => {
  // Live evidence (coordinator): the reference downloader picks by most pixels then
  // highest bit_rate (`downloader_base.py:1436-1486`); Douyin's own `bit_rate[]` order is not
  // reliably best-first. This payload lists the low tier first and puts two same-resolution
  // entries in bit_rate-ascending order, so a naive "index 0 is best" read would pick the worst.
  const classified = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body(
      detailPayload({
        video: {
          duration: 19000,
          ratio: '1080p',
          format: 'mp4',
          cover: { uri: 'cover/abc' },
          bit_rate: [
            {
              gear_name: 'normal_540_0',
              bit_rate: 900_000,
              play_addr: { width: 540, height: 960, data_size: 2_100_000, uri: 'v/low' },
            },
            {
              gear_name: 'normal_1080_0_low_bitrate',
              bit_rate: 1_200_000,
              play_addr: { width: 1080, height: 1920, data_size: 3_000_000, uri: 'v/high-thin' },
            },
            {
              gear_name: 'normal_1080_0',
              bit_rate: 2_400_000,
              play_addr: { width: 1080, height: 1920, data_size: 5_700_000, uri: 'v/high' },
            },
            {
              gear_name: 'normal_unknown_0',
              bit_rate: 5_000_000,
              play_addr: { data_size: null, uri: 'v/unknown-resolution' },
            },
          ],
        },
      }),
    ),
  });
  assert.equal(classified.ok, true);
  const outcome = mapDouyinDetail(classified.value, 1_758_200_000_000);
  assert.equal(outcome.ok, true);
  const gearNames = outcome.value.video.tiers.map((tier) => tier.gearName);
  assert.deepEqual(gearNames, [
    'normal_1080_0', // most pixels, highest bit_rate among the 1080 tiers
    'normal_1080_0_low_bitrate', // same pixels, lower bit_rate
    'normal_540_0', // fewer pixels
    'normal_unknown_0', // no resolution reported at all — last, never assumed best
  ]);
});

test('an image post is not stored in a video-shaped record', () => {
  const classified = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body(detailPayload({ images: [{ uri: 'img/1' }] })),
  });
  const outcome = mapDouyinDetail(classified.value, 1);
  assert.equal(outcome.value.mediaType, 'image');
  assert.equal(outcome.value.video, null);
});

test('several images are slides, not one image', () => {
  const classified = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: body(detailPayload({ images: [{ uri: 'img/1' }, { uri: 'img/2' }] })),
  });
  const outcome = mapDouyinDetail(classified.value, 1);
  assert.equal(outcome.value.mediaType, 'slides');
});

test('a clean 200 carrying no aweme_detail fails instead of reporting an empty success', () => {
  const outcome = mapDouyinDetail({ status_code: 0 }, 1);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'malformed');
});

test('a page that parsed cleanly but lacks aweme_list is a failure, not an empty success', () => {
  const outcome = mapDouyinProfilePage({ status_code: 0 }, 1);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'malformed');
  // An empty list, by contrast, is a real page.
  const empty = mapDouyinProfilePage({ status_code: 0, aweme_list: [], has_more: 0 }, 1);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.value.videos, []);
});

test('aweme_list: null is a failure, never a silent end', () => {
  const outcome = mapDouyinProfilePage({ status_code: 0, aweme_list: null, has_more: 0 }, 1);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'malformed');
});

test('a captured body summarizes to values only, so a walk can say why it stopped', () => {
  assert.deepEqual(
    summarizeDouyinBody(
      JSON.stringify({
        status_code: 0,
        has_more: 1,
        max_cursor: 1_758_000_000_000,
        aweme_list: [{ aweme_id: '1', desc: 'untrusted caption' }, { aweme_id: '2' }],
      }),
    ),
    { kind: 'json', statusCode: 0, items: 2, hasMore: true, cursor: true },
  );
  // `aweme_list: null` is a risk-control answer, not an empty channel: it must stay distinguishable.
  assert.deepEqual(summarizeDouyinBody('{"status_code":0,"aweme_list":null,"has_more":0}'), {
    kind: 'json',
    statusCode: 0,
    items: null,
    hasMore: false,
    cursor: false,
  });
  assert.deepEqual(summarizeDouyinBody('{"aweme_detail":{"aweme_id":"1"},"status_code":0}'), {
    kind: 'json',
    statusCode: 0,
    items: 1,
    hasMore: null,
    cursor: false,
  });
  assert.equal(
    summarizeDouyinBody('Blocked by ArgusSecurityPlugin Uifid Not Found').kind,
    'refusal',
  );
  assert.equal(summarizeDouyinBody('').kind, 'empty');
  assert.equal(summarizeDouyinBody('<html>').kind, 'not-json');
  assert.doesNotMatch(
    JSON.stringify(summarizeDouyinBody('{"aweme_list":[{"desc":"untrusted caption"}]}')),
    /untrusted/,
  );
});
