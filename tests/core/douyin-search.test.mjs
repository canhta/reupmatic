import assert from 'node:assert/strict';
import test from 'node:test';
import { sourcesOperations } from '../../dist-core/host-bridge/operations/sources.js';
import {
  classifyDouyinResponse,
  mapDouyinDetail,
} from '../../dist-core/sources/douyin-discovery.js';
import {
  DOUYIN_SEARCH_PAGE_CAP,
  searchDouyinLink,
  searchDouyinText,
  toSearchView,
} from '../../dist-core/sources/douyin-search.js';

const AWEME = '7600224486650121526';
const SEC_UID = 'MS4wLjABAAAA-sec-uid';
const NICKNAME = 'Quán Cô Ba';

function aweme(id, overrides = {}) {
  return {
    aweme_id: id,
    desc: `clip ${id}`,
    create_time: 1_758_153_600,
    author: { uid: 'u-1', nickname: NICKNAME, sec_uid: SEC_UID, avatar_thumb: { uri: 'a' } },
    statistics: { digg_count: 10, comment_count: 1, share_count: 2, collect_count: 3 },
    video: {
      duration: 19_000,
      ratio: '1080p',
      format: 'mp4',
      cover: { uri: 'cover' },
      bit_rate: [
        { gear_name: 'normal_1080_0', play_addr: { width: 1080, height: 1920, data_size: 5_000 } },
      ],
    },
    ...overrides,
  };
}

function classified(payload, httpStatus = 200) {
  return classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus,
    body: JSON.stringify(payload),
  });
}

function detailOutcome(id = AWEME, overrides = {}) {
  const outcome = classified({ status_code: 0, aweme_detail: aweme(id, overrides) });
  if (!outcome.ok) return outcome;
  return mapDouyinDetail(outcome.value, 1);
}

function postPageOutcome(videos, { maxCursor = 0, hasMore = false } = {}) {
  return classified({
    status_code: 0,
    aweme_list: videos.map((video) => aweme(video)),
    max_cursor: maxCursor,
    has_more: hasMore ? 1 : 0,
  });
}

const link = (kind, id) => ({
  status: 'recognized',
  kind,
  id,
  canonicalUrl: '',
  intent: {},
  labelKey: '',
});

/** A search whose detail fetch and channel walk are backed by fixed sequences of outcomes. */
function fixture({ detail = detailOutcome(), posts = [] } = {}) {
  const detailCalls = [];
  const pageCalls = [];
  return {
    detailCalls,
    pageCalls,
    fetchDetail: async (awemeId) => {
      detailCalls.push(awemeId);
      return detail;
    },
    fetchChannelPage: async (secUid, maxCursor) => {
      pageCalls.push({ secUid, maxCursor });
      return posts[Math.min(pageCalls.length - 1, posts.length - 1)];
    },
  };
}

const noSleep = async () => {};
const options = (fixtureResult, extra = {}) => ({
  fetchDetail: fixtureResult.fetchDetail,
  fetchChannelPage: fixtureResult.fetchChannelPage,
  sleep: noSleep,
  backoffMs: [],
  betweenPagesMs: 0,
  ...extra,
});

test('a detail the host already holds is reused instead of a repeat request', async () => {
  const held = detailOutcome();
  assert.equal(held.ok, true);
  const fx = fixture({ posts: [postPageOutcome([])] });
  const outcome = await searchDouyinLink(
    link('video', AWEME),
    options(fx, { observedDetail: (id) => (id === AWEME ? held.value : null) }),
  );
  assert.equal(outcome.status, 'recognized');
  assert.equal(outcome.result.exact?.awemeId, AWEME);
  assert.equal(outcome.result.channel?.secUid, SEC_UID);
  // The channel listing is still walked: only the detail response is reused.
  assert.equal(fx.detailCalls.length, 0);
  assert.equal(fx.pageCalls.length, 1);
});

test('a video link returns the exact item first, then its channel and listed videos', async () => {
  const fx = fixture({ posts: [postPageOutcome([AWEME, '2', '3'])] });
  const outcome = await searchDouyinLink(link('video', AWEME), options(fx));
  assert.equal(outcome.status, 'recognized');
  const { result } = outcome;
  assert.equal(result.exact?.awemeId, AWEME);
  assert.equal(result.channel?.secUid, SEC_UID);
  assert.equal(result.channel?.nickname, NICKNAME);
  assert.deepEqual(
    result.videos.map((video) => video.awemeId),
    [AWEME, '2', '3'],
  );
  assert.equal(result.retrieved, 3);
  assert.equal(result.mayHaveMore, false);
  assert.equal(result.truncated, false);
  assert.equal(result.partialFailure, null);
  // Detail fetched first, then the channel walk — never the reverse.
  assert.equal(fx.detailCalls.length, 1);
  assert.equal(fx.pageCalls.length, 1);
});

test('a channel link returns the channel and its videos with no fabricated exact match', async () => {
  const fx = fixture({ posts: [postPageOutcome(['21', '22'])] });
  const outcome = await searchDouyinLink(link('channel', SEC_UID), options(fx));
  assert.equal(outcome.status, 'recognized');
  assert.equal(outcome.result.exact, null);
  assert.equal(outcome.result.channel?.secUid, SEC_UID);
  assert.deepEqual(
    outcome.result.videos.map((video) => video.awemeId),
    ['21', '22'],
  );
  assert.equal(fx.detailCalls.length, 0);
  assert.equal(fx.pageCalls.length, 1);
});

test('a has_more stuck at true stops at the hard page cap and is reported as truncated', async () => {
  const pages = Array.from({ length: DOUYIN_SEARCH_PAGE_CAP }, (_, index) =>
    postPageOutcome([String(index + 1)], { maxCursor: (index + 1) * 100, hasMore: true }),
  );
  const fx = fixture({ posts: pages });
  const outcome = await searchDouyinLink(link('channel', SEC_UID), options(fx));
  assert.equal(outcome.result.retrieved, DOUYIN_SEARCH_PAGE_CAP);
  assert.equal(outcome.result.truncated, true);
  assert.equal(outcome.result.mayHaveMore, true);
  assert.equal(fx.pageCalls.length, DOUYIN_SEARCH_PAGE_CAP);
});

test('a cut-off mid-listing keeps the retrieved items and records the failure', async () => {
  const refusal = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/post/',
    httpStatus: 403,
    body: 'Blocked by ArgusSecurityPlugin Uifid Not Found',
  });
  const fx = fixture({
    posts: [postPageOutcome(['1', '2'], { maxCursor: 100, hasMore: true }), refusal],
  });
  const outcome = await searchDouyinLink(link('channel', SEC_UID), options(fx));
  assert.equal(outcome.status, 'recognized');
  assert.deepEqual(
    outcome.result.videos.map((video) => video.awemeId),
    ['1', '2'],
  );
  assert.equal(outcome.result.retrieved, 2);
  assert.equal(outcome.result.partialFailure?.kind, 'verification_required');
  assert.equal(outcome.result.partialFailure?.retryable, false);
});

test('a first-page login prompt is a partial result carrying login_required, never 0 videos', async () => {
  const fx = fixture({ posts: [classified({ status_code: 2483, status_msg: '请先登录' })] });
  const outcome = await searchDouyinLink(link('channel', SEC_UID), options(fx));
  assert.equal(outcome.status, 'recognized');
  assert.equal(outcome.result.retrieved, 0);
  assert.equal(outcome.result.partialFailure?.kind, 'login_required');
});

test('a detail refusal is a source failure, not a result with no item', async () => {
  const refusal = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 403,
    body: 'Blocked by ArgusSecurityPlugin',
  });
  const fx = fixture({ detail: refusal });
  const outcome = await searchDouyinLink(link('video', AWEME), options(fx));
  assert.equal(outcome.status, 'failure');
  assert.equal(outcome.failure.kind, 'verification_required');
  assert.equal(outcome.failure.retryable, false);
});

test('an expired session during a detail search is login_required, never 0 results', async () => {
  const expired = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/detail/',
    httpStatus: 200,
    body: JSON.stringify({ status_code: 2483, status_msg: '请先登录' }),
  });
  const fx = fixture({ detail: expired });
  const outcome = await searchDouyinLink(link('video', AWEME), options(fx));
  assert.equal(outcome.status, 'failure');
  assert.equal(outcome.failure.kind, 'login_required');
});

test('a video whose detail carries no sec_uid returns the exact item and no channel', async () => {
  const fx = fixture({
    detail: detailOutcome(AWEME, { author: { uid: 'u', nickname: 'anon', sec_uid: null } }),
  });
  const outcome = await searchDouyinLink(link('video', AWEME), options(fx));
  assert.equal(outcome.result.exact?.awemeId, AWEME);
  assert.equal(outcome.result.channel, null);
  assert.deepEqual(outcome.result.videos, []);
  assert.equal(outcome.result.retrieved, 0);
  assert.equal(fx.pageCalls.length, 0);
});

test('an unsupported pasted text is rejected with its reason, and never searched', async () => {
  const outcome = await searchDouyinText('not a douyin link', {
    recognize: async () => ({
      status: 'unsupported',
      reasonKey: 'douyinLinkUnsupportedHost',
      input: '',
    }),
  });
  assert.deepEqual(outcome, { status: 'unsupported', reasonKey: 'douyinLinkUnsupportedHost' });
});

test('the renderer view keeps the projection and drops the raw payload', async () => {
  const fx = fixture({ posts: [postPageOutcome([AWEME])] });
  const outcome = await searchDouyinLink(link('video', AWEME), options(fx));
  // Core keeps the raw payload at the discovery boundary...
  assert.equal(typeof outcome.result.exact.raw, 'object');
  const view = toSearchView(outcome);
  assert.equal(view.status, 'recognized');
  // ...and the boundary-crossing view does not.
  assert.equal('raw' in view.result.exact, false);
  assert.equal('raw' in view.result.videos[0], false);
  assert.equal(view.result.exact.awemeId, AWEME);
  assert.equal(view.result.videos[0].video.tiers.length, 1);
  // A non-recognized outcome passes through untouched.
  const unsupported = { status: 'unsupported', reasonKey: 'douyinLinkUnsupportedHost' };
  assert.deepEqual(toSearchView(unsupported), unsupported);
});

test('douyin-search host-bridge validation bounds the pasted text', () => {
  const validate = sourcesOperations['douyin-search'].validate;
  assert.deepEqual(validate({ text: 'https://v.douyin.com/iAbCdEfG/' }), {
    text: 'https://v.douyin.com/iAbCdEfG/',
  });
  assert.throws(() => validate({ text: '' }), /INVALID_REQUEST/);
  assert.throws(() => validate({ text: 'x'.repeat(4097) }), /INVALID_REQUEST/);
  assert.throws(() => validate({ text: 'x', extra: true }), /INVALID_REQUEST/);
});

test('an injected recognizer drives the whole search through one entry point', async () => {
  const fx = fixture({ posts: [postPageOutcome(['1'])] });
  const outcome = await searchDouyinText('https://www.douyin.com/user/x', {
    ...options(fx),
    recognize: async () => link('channel', SEC_UID),
  });
  assert.equal(outcome.status, 'recognized');
  assert.equal(outcome.result.channel?.secUid, SEC_UID);
});
