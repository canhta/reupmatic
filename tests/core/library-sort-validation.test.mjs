import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryOperations } from '../../dist-core/host-bridge/operations/library.js';

const validate = libraryOperations['library-assets'].validate;
const base = { kind: 'all', search: '', offset: 0, limit: 20 };

test('library-assets host-bridge validation rejects an unknown sort_by/sort_dir', () => {
  assert.throws(() => validate({ ...base, sort_by: 'bogus' }), /INVALID_REQUEST/);
  assert.throws(() => validate({ ...base, sort_dir: 'bogus' }), /INVALID_REQUEST/);
  assert.throws(() => validate({ ...base, kind: 'bogus' }), /INVALID_REQUEST/);
});

test('library-assets host-bridge validation accepts every declared sort key and direction', () => {
  for (const sort_by of ['name', 'kind', 'content_name', 'created_at']) {
    for (const sort_dir of ['ascending', 'descending']) {
      assert.deepEqual(validate({ ...base, sort_by, sort_dir }), {
        kind: 'all',
        search: '',
        offset: 0,
        limit: 20,
        sort_by,
        sort_dir,
      });
    }
  }
});

test('library-assets host-bridge validation accepts an omitted sort and an explicit item_id', () => {
  assert.deepEqual(validate(base), base);
  assert.deepEqual(validate({ ...base, item_id: 'item-00000001' }), {
    ...base,
    item_id: 'item-00000001',
  });
});

const listValidate = libraryOperations['library-list'].validate;
const listBase = { search: '', offset: 0, limit: 20 };

test('library-list host-bridge validation rejects an unknown filter key', () => {
  assert.throws(() => listValidate({ ...listBase, sort: 'name' }), /INVALID_REQUEST/);
});

test('library-list host-bridge validation normalizes every declared facet', () => {
  assert.deepEqual(
    listValidate({
      ...listBase,
      media_kinds: ['video'],
      origins: ['douyin'],
      availability: ['missing'],
      linked: ['project'],
      duration_ms: { min: 1000 },
      resolution: { min: 720, max: 2160 },
      size_bytes: { max: 5000 },
      added_at: { min: 1 },
      published_at: { max: 99 },
      label_ids: ['label-1'],
    }),
    {
      ...listBase,
      media_kinds: ['video'],
      origins: ['douyin'],
      availability: ['missing'],
      linked: ['project'],
      duration_ms: { min: 1000 },
      resolution: { min: 720, max: 2160 },
      size_bytes: { max: 5000 },
      added_at: { min: 1 },
      published_at: { max: 99 },
      label_ids: ['label-1'],
    },
  );
});

test('library-list host-bridge validation drops an empty facet list and rejects bad values', () => {
  assert.deepEqual(listValidate({ ...listBase, origins: [] }), listBase);
  assert.throws(() => listValidate({ ...listBase, media_kinds: ['movie'] }), /INVALID_REQUEST/);
  assert.throws(
    () => listValidate({ ...listBase, size_bytes: { min: 5, max: 1 } }),
    /INVALID_REQUEST/,
  );
  assert.throws(() => listValidate({ ...listBase, size_bytes: { min: -1 } }), /INVALID_REQUEST/);
  assert.throws(() => listValidate({ ...listBase, label_ids: 5 }), /INVALID_REQUEST/);
});
