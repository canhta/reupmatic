import assert from 'node:assert/strict';
import test from 'node:test';
import { walkDouyinChannel } from '../../dist-core/sources/douyin-channel-walk.js';
import { classifyDouyinResponse } from '../../dist-core/sources/douyin-discovery.js';

const SEC_UID = 'MS4wLjABAAAA-sec-uid';

function aweme(id) {
  return {
    aweme_id: id,
    desc: `clip ${id}`,
    create_time: 1_758_153_600,
    author: { uid: 'u-1', nickname: 'Quán Cô Ba', sec_uid: SEC_UID, avatar_thumb: { uri: 'a' } },
    statistics: { digg_count: 10, comment_count: 1, share_count: 2, collect_count: 3 },
  };
}

/** A raw `aweme/post` response body, classified exactly as the real transport would. */
function page(payload, httpStatus = 200) {
  return classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/post/',
    httpStatus,
    body: JSON.stringify(payload),
  });
}

function postPage(ids, { maxCursor = 0, hasMore = false } = {}) {
  return page({
    status_code: 0,
    aweme_list: ids.map(aweme),
    max_cursor: maxCursor,
    has_more: hasMore ? 1 : 0,
  });
}

/** A fetch port backed by one fixed sequence of already-classified responses, one per call. */
function scripted(...responses) {
  const calls = [];
  return {
    calls,
    fetchPage: async (secUid, maxCursor) => {
      calls.push({ secUid, maxCursor });
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      return next;
    },
  };
}

const noSleep = async () => {};
const walkOptions = (fetchPage, extra = {}) => ({
  fetchPage,
  pageCap: 5,
  sleep: noSleep,
  backoffMs: [],
  betweenPagesMs: 0,
  ...extra,
});

test('a full walk folds every page and stops at has_more: 0', async () => {
  const { fetchPage, calls } = scripted(
    postPage(['1'], { maxCursor: 100, hasMore: true }),
    postPage(['2'], { maxCursor: 200, hasMore: true }),
    postPage(['3'], { maxCursor: 300, hasMore: false }),
  );
  const result = await walkDouyinChannel(SEC_UID, walkOptions(fetchPage));
  assert.deepEqual(
    result.videos.map((video) => video.awemeId),
    ['1', '2', '3'],
  );
  assert.equal(result.stopReason, 'end');
  assert.equal(result.mayHaveMore, false);
  assert.equal(result.truncated, false);
  assert.equal(result.failure, null);
  assert.equal(result.pages, 3);
  // The cursor read from each page feeds the next request.
  assert.deepEqual(
    calls.map((call) => call.maxCursor),
    [0, 100, 200],
  );
});

test('a has_more stuck true with a cursor that never advances stops as stalled, not the end', async () => {
  const { fetchPage } = scripted(
    postPage(['1'], { maxCursor: 0, hasMore: true }),
    // Never reached: the stall is caught on the first page since max_cursor echoes the request (0).
  );
  const result = await walkDouyinChannel(SEC_UID, walkOptions(fetchPage));
  assert.deepEqual(
    result.videos.map((video) => video.awemeId),
    ['1'],
  );
  assert.equal(result.stopReason, 'stalled');
  assert.equal(result.mayHaveMore, true);
  assert.equal(result.truncated, true);
  assert.equal(result.failure, null);
});

test('aweme_list: null is a failure that keeps the pages already retrieved, never a silent end', async () => {
  const { fetchPage } = scripted(
    postPage(['1'], { maxCursor: 100, hasMore: true }),
    page({ status_code: 0, aweme_list: null, has_more: 0 }),
  );
  const result = await walkDouyinChannel(SEC_UID, walkOptions(fetchPage));
  assert.deepEqual(
    result.videos.map((video) => video.awemeId),
    ['1'],
  );
  assert.equal(result.stopReason, 'failure');
  assert.equal(result.failure?.kind, 'malformed');
  assert.equal(result.truncated, false);
});

test('an empty body (session missing) is a failure, never an empty channel', async () => {
  // A `200` with a literally empty body — the no-cookie evidence D-62 records — rather than one
  // built from `page()`, which always carries JSON.
  const emptyBody = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/post/',
    httpStatus: 200,
    body: '',
  });
  const result = await walkDouyinChannel(
    SEC_UID,
    walkOptions(async () => emptyBody),
  );
  assert.deepEqual(result.videos, []);
  assert.equal(result.stopReason, 'failure');
  assert.equal(result.failure?.kind, 'login_required');
});

test('an Argus refusal is a failure and is never retried', async () => {
  const refusal = classifyDouyinResponse({
    path: '/aweme/v1/web/aweme/post/',
    httpStatus: 403,
    body: 'Blocked by ArgusSecurityPlugin Uifid Not Found',
  });
  let calls = 0;
  const fetchPage = async () => {
    calls += 1;
    return refusal;
  };
  const result = await walkDouyinChannel(SEC_UID, walkOptions(fetchPage, { backoffMs: [1, 2, 3] }));
  assert.equal(result.stopReason, 'failure');
  assert.equal(result.failure?.kind, 'verification_required');
  assert.equal(result.failure?.retryable, false);
  assert.equal(calls, 1, 'a refusal must not be retried');
});

test('a 5xx is retried with bounded backoff, and a later 200 is used once it lands', async () => {
  const { fetchPage, calls } = scripted(
    page({}, 500),
    postPage(['1', '2'], { maxCursor: 100, hasMore: false }),
  );
  const waited = [];
  const result = await walkDouyinChannel(
    SEC_UID,
    walkOptions(fetchPage, {
      backoffMs: [10, 20],
      sleep: async (ms) => {
        waited.push(ms);
      },
    }),
  );
  assert.deepEqual(
    result.videos.map((video) => video.awemeId),
    ['1', '2'],
  );
  assert.equal(result.stopReason, 'end');
  assert.equal(result.failure, null);
  assert.equal(calls.length, 2, 'the first attempt plus one retry');
  assert.deepEqual(waited, [10]);
});

test('a has_more stuck true that keeps advancing normally stops at the hard page cap', async () => {
  const pages = [1, 2, 3, 4, 5].map((n) =>
    postPage([String(n)], { maxCursor: n * 100, hasMore: true }),
  );
  const { fetchPage } = scripted(...pages);
  const result = await walkDouyinChannel(SEC_UID, walkOptions(fetchPage, { pageCap: 5 }));
  assert.equal(result.pages, 5);
  assert.equal(result.stopReason, 'cap');
  assert.equal(result.truncated, true);
  assert.equal(result.mayHaveMore, true);
});

test('duplicate aweme_ids within one walk collapse to one candidate', async () => {
  const { fetchPage } = scripted(
    postPage(['1', '2'], { maxCursor: 100, hasMore: true }),
    postPage(['2', '3'], { maxCursor: 200, hasMore: false }),
  );
  const result = await walkDouyinChannel(SEC_UID, walkOptions(fetchPage));
  assert.deepEqual(
    result.videos.map((video) => video.awemeId),
    ['1', '2', '3'],
  );
});

test('the walk sleeps between pages but not before the first request', async () => {
  const { fetchPage } = scripted(
    postPage(['1'], { maxCursor: 100, hasMore: true }),
    postPage(['2'], { maxCursor: 200, hasMore: false }),
  );
  const waited = [];
  await walkDouyinChannel(
    SEC_UID,
    walkOptions(fetchPage, {
      betweenPagesMs: 750,
      sleep: async (ms) => {
        waited.push(ms);
      },
    }),
  );
  assert.deepEqual(waited, [750]);
});
