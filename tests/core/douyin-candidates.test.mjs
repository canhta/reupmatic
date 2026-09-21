import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateViews,
  EMPTY_CANDIDATE_QUERY,
  viewDouyinCandidates,
} from '../../dist-core/sources/douyin-candidates.js';

function item(id, overrides = {}) {
  return {
    awemeId: id,
    mediaType: 'video',
    description: `clip ${id}`,
    createTime: 1_000,
    shareUrl: null,
    author: { uid: null, nickname: null, secUid: null, avatarUri: null },
    statistics: {
      diggCount: null,
      commentCount: null,
      shareCount: null,
      collectCount: null,
      playCount: null,
      capturedAt: 1,
    },
    video: { durationMs: 10_000, ratio: null, format: null, coverUri: null, tiers: [] },
    ...overrides,
  };
}

const query = (overrides = {}) => ({ ...EMPTY_CANDIDATE_QUERY, ...overrides });

test('facet availability is false only when no candidate carries the facet', () => {
  const without = viewDouyinCandidates([item('a'), item('b')], query());
  assert.equal(without.facets.mediaType, true);
  assert.equal(without.facets.duration, true);
  assert.equal(without.facets.resolution, false);
  assert.equal(without.facets.views, false);

  const withValues = viewDouyinCandidates(
    [
      item('a', {
        statistics: { ...item('a').statistics, playCount: 500 },
        video: { ...item('a').video, tiers: [{ height: 1080, dataSize: 10, width: 1920 }] },
      }),
    ],
    query(),
  );
  assert.equal(withValues.facets.resolution, true);
  assert.equal(withValues.facets.views, true);
});

test('the media-type filter is the one facet every candidate can answer', () => {
  const items = [item('v'), item('i', { mediaType: 'image' }), item('s', { mediaType: 'slides' })];
  const view = viewDouyinCandidates(items, query({ media_types: ['image', 'slides'] }));
  assert.deepEqual(
    view.items.map((candidate) => candidate.awemeId),
    ['i', 's'],
  );
  assert.equal(view.total, 3);
  assert.equal(view.matched, 2);
});

test('a candidate with no duration survives a duration filter and is never treated as zero', () => {
  const items = [
    item('short'),
    item('long', { video: { ...item('long').video, durationMs: 400_000 } }),
    item('unknown', { video: null }),
  ];
  const view = viewDouyinCandidates(items, query({ duration: 'over5m' }));
  assert.deepEqual(
    view.items.map((candidate) => candidate.awemeId),
    ['long', 'unknown'],
  );
});

test('a resolution filter keeps candidates that offer no quality ladder', () => {
  const items = [
    item('sd', {
      video: { ...item('sd').video, tiers: [{ width: 640, height: 360, dataSize: 1 }] },
    }),
    item('fhd', {
      video: { ...item('fhd').video, tiers: [{ width: 1920, height: 1080, dataSize: 2 }] },
    }),
    item('none', { video: null }),
  ];
  const view = viewDouyinCandidates(items, query({ resolution: 'fhd' }));
  assert.deepEqual(
    view.items.map((candidate) => candidate.awemeId),
    ['fhd', 'none'],
  );
});

test('a withheld play count never reads as zero, so it cannot fail an at-least filter', () => {
  const items = [
    item('popular', { statistics: { ...item('popular').statistics, playCount: 20_000 } }),
    item('quiet', { statistics: { ...item('quiet').statistics, playCount: 10 } }),
    item('unknown'),
    // Douyin's public endpoints answer `play_count: 0` for a video they withhold; that is
    // unavailable, not a real zero.
    item('zeroed', { statistics: { ...item('zeroed').statistics, playCount: 0 } }),
  ];
  assert.equal(candidateViews(items[2]), null);
  assert.equal(candidateViews(items[3]), null);
  const view = viewDouyinCandidates(items, query({ min_views: '10k' }));
  assert.deepEqual(
    view.items.map((candidate) => candidate.awemeId),
    ['popular', 'unknown', 'zeroed'],
  );
});

test('sorting by views is descending with withheld values last and ties in input order', () => {
  const items = [
    item('tie-a', { statistics: { ...item('tie-a').statistics, playCount: 100 } }),
    item('unknown'),
    item('tie-b', { statistics: { ...item('tie-b').statistics, playCount: 100 } }),
    item('top', { statistics: { ...item('top').statistics, playCount: 900 } }),
  ];
  const view = viewDouyinCandidates(items, query({ sort: 'views' }));
  assert.deepEqual(
    view.items.map((candidate) => candidate.awemeId),
    ['top', 'tie-a', 'tie-b', 'unknown'],
  );
});

test('sorting by duration is ascending and by publish date is newest first', () => {
  const items = [
    item('mid', {
      createTime: 2_000,
      video: { ...item('mid').video, durationMs: 30_000 },
    }),
    item('short', {
      createTime: 3_000,
      video: { ...item('short').video, durationMs: 5_000 },
    }),
    item('long', {
      createTime: 1_000,
      video: { ...item('long').video, durationMs: 90_000 },
    }),
  ];
  assert.deepEqual(
    viewDouyinCandidates(items, query({ sort: 'duration' })).items.map((c) => c.awemeId),
    ['short', 'mid', 'long'],
  );
  assert.deepEqual(
    viewDouyinCandidates(items, query({ sort: 'published' })).items.map((c) => c.awemeId),
    ['short', 'mid', 'long'],
  );
});

test('relevance is the source order, untouched', () => {
  const items = [item('b'), item('a'), item('c')];
  assert.deepEqual(
    viewDouyinCandidates(items, query()).items.map((candidate) => candidate.awemeId),
    ['b', 'a', 'c'],
  );
});

test('filters compose and an empty filter set matches everything', () => {
  const items = [
    item('keep', {
      statistics: { ...item('keep').statistics, playCount: 50_000 },
      video: { ...item('keep').video, durationMs: 90_000 },
    }),
    item('quiet', {
      statistics: { ...item('quiet').statistics, playCount: 5 },
      video: { ...item('quiet').video, durationMs: 90_000 },
    }),
    item('too-long', {
      statistics: { ...item('too-long').statistics, playCount: 50_000 },
      video: { ...item('too-long').video, durationMs: 400_000 },
    }),
  ];
  const view = viewDouyinCandidates(
    items,
    query({ duration: '1mTo5m', min_views: '10k', media_types: ['video'] }),
  );
  assert.deepEqual(
    view.items.map((candidate) => candidate.awemeId),
    ['keep'],
  );
  assert.equal(view.matched, 1);
  assert.equal(view.total, 3);
  assert.equal(viewDouyinCandidates(items, query()).matched, 3);
});
