import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeContentFilterCount,
  EMPTY_CONTENT_FILTERS,
  hasContentFilters,
  hasPublishedScopedFilter,
  toContentFilterQuery,
} from '../../dist-core/library/content-filters.js';

const now = 2_000_000_000_000;

test('an empty selection sends no filter keys at all', () => {
  assert.deepEqual(toContentFilterQuery(EMPTY_CONTENT_FILTERS, now), {});
  assert.equal(activeContentFilterCount(EMPTY_CONTENT_FILTERS), 0);
  assert.equal(hasContentFilters(EMPTY_CONTENT_FILTERS), false);
});

test('every preset maps to the range it names', () => {
  assert.deepEqual(
    toContentFilterQuery(
      {
        ...EMPTY_CONTENT_FILTERS,
        media_kinds: ['video'],
        origins: ['douyin'],
        availability: ['missing'],
        linked: ['project'],
        label_ids: ['label-1'],
      },
      now,
    ),
    {
      media_kinds: ['video'],
      origins: ['douyin'],
      availability: ['missing'],
      linked: ['project'],
      label_ids: ['label-1'],
    },
  );
  assert.deepEqual(
    toContentFilterQuery({ ...EMPTY_CONTENT_FILTERS, duration: '1mTo5m' }, now).duration_ms,
    { min: 60_000, max: 300_000 },
  );
  assert.deepEqual(
    toContentFilterQuery({ ...EMPTY_CONTENT_FILTERS, resolution: 'fhd' }, now).resolution,
    { min: 1080 },
  );
  assert.deepEqual(
    toContentFilterQuery({ ...EMPTY_CONTENT_FILTERS, size: 'over100mb' }, now).size_bytes,
    { min: 100 * 1024 * 1024 },
  );
  assert.deepEqual(
    toContentFilterQuery({ ...EMPTY_CONTENT_FILTERS, added: 'last7' }, now).added_at,
    {
      min: now - 7 * 86_400_000,
    },
  );
  assert.deepEqual(
    toContentFilterQuery({ ...EMPTY_CONTENT_FILTERS, published: 'last30' }, now).published_at,
    { min: now - 30 * 86_400_000 },
  );
});

test('an unknown preset is treated as unset rather than as an empty range', () => {
  assert.deepEqual(
    toContentFilterQuery({ ...EMPTY_CONTENT_FILTERS, duration: 'forever' }, now),
    {},
  );
});

test('the active count and the scoped-publish notice follow the selection', () => {
  const active = {
    ...EMPTY_CONTENT_FILTERS,
    media_kinds: ['video'],
    duration: 'over20m',
    published: 'last7',
  };
  assert.equal(activeContentFilterCount(active), 3);
  assert.equal(hasContentFilters(active), true);
  assert.equal(hasPublishedScopedFilter(active), true);
  assert.equal(hasPublishedScopedFilter(EMPTY_CONTENT_FILTERS), false);
});
