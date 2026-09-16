import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkspaceCatalog } from '../dist-core/catalog/workspace-catalog.js';
import { parsePostPlan } from '../dist-core/distribution/post-store.js';

const channel = { id: 'channel_001', expected_revision: null, name: 'Kênh chính',
  platform: 'youtube', url: '', label_ids: [], archived: false };
const affiliate = { id: 'affiliate_001', expected_revision: null, name: 'Máy ảnh',
  url: 'https://s.shopee.vn/example?sub_id=Ti%E1%BA%BFng+Vi%E1%BB%87t&x=1', label_ids: [], archived: false };
const exported = { library_id: 'library_001', link_id: 'export_001', name: 'video.mp4',
  path: path.resolve('video.mp4'), sha256: 'a'.repeat(64) };
const draft = { id: 'post_0001', expected_revision: null, title: 'Tiếng Việt', body: 'Nội dung',
  channel_id: channel.id, library_id: exported.library_id, export_id: exported.link_id,
  link_ids: [affiliate.id], planned: null };
const query = { search: '', view: 'all', offset: 0, limit: 25 };
function seeded(filename = ':memory:') {
  const catalog = new WorkspaceCatalog(filename);
  catalog.distribution.saveChannel(channel);
  catalog.distribution.saveLink(affiliate);
  return catalog;
}

test('SC-10: one destination post owns exact export and link snapshots', () => {
  const catalog = seeded();
  try {
    const saved = catalog.posts.create(draft, exported);
    catalog.distribution.saveLink({ ...affiliate, expected_revision: 1, name: 'Changed', url: 'https://shopee.vn/new', archived: true });
    catalog.distribution.saveChannel({ ...channel, expected_revision: 1, name: 'Renamed' });
    const stored = catalog.posts.get(saved.id);
    assert.equal(stored.links[0].url, affiliate.url);
    assert.equal(stored.channel.name, channel.name);
    assert.equal(stored.export.sha256, exported.sha256);
    assert.equal(stored.state, 'draft');
    assert.equal(catalog.posts.list({ ...query, view: 'published' }).total, 0);
    assert.equal(catalog.posts.usage()[affiliate.id], 1);
    assert.throws(() => catalog.posts.create({ ...draft, id: 'post_0002' }, exported), /LINK_ARCHIVED/);
  } finally { catalog.close(); }
});

test('SC-09/10: per-channel count, retry conflict and cancellation never rewrite usage history', () => {
  const catalog = seeded();
  try {
    catalog.distribution.saveChannel({ ...channel, id: 'channel_002', platform: 'facebook_page' });
    const post = catalog.posts.create(draft, exported);
    catalog.posts.create({ ...draft, id: 'post_0002', channel_id: 'channel_002' }, exported);
    assert.throws(() => catalog.posts.create(draft, exported), /REVISION_CONFLICT/);
    assert.equal(catalog.posts.usage()[affiliate.id], 2);
    catalog.posts.edit({ id: post.id, expected_revision: post.revision, title: post.title,
      body: post.body, planned: null, state: 'cancelled' });
    assert.equal(catalog.posts.list({ ...query, link_id: affiliate.id }).total, 2);
    assert.equal(catalog.posts.list({ ...query, view: 'cancelled' }).total, 1);
    assert.deepEqual(catalog.posts.contentDependencies(exported.library_id), { posts: 2, pending_posts: 1 });
    assert.throws(() => catalog.posts.edit({ id: post.id, expected_revision: post.revision,
      title: 'Stale', body: '', planned: null, state: 'draft' }), /REVISION_CONFLICT/);
  } finally { catalog.close(); }
});

test('SC-10/14: planned instants retain explicit timezone and do not publish', () => {
  const catalog = seeded();
  try {
    const planned = { instant: Date.UTC(2026, 8, 20, 7, 30), timezone: 'Asia/Bangkok' };
    catalog.posts.create({ ...draft, planned }, exported);
    assert.deepEqual(catalog.posts.list({ ...query, view: 'upcoming' }).items[0].planned, planned);
    assert.equal(catalog.posts.list({ ...query, view: 'published' }).total, 0);
    assert.throws(() => parsePostPlan({ ...planned, timezone: 'Invalid/Place' }), /INVALID_SCHEDULE/);
    assert.throws(() => parsePostPlan({ ...planned, instant: NaN }), /INVALID_SCHEDULE/);
    assert.throws(() => catalog.posts.edit({ id: draft.id, expected_revision: 1, title: 'Title',
      body: '', planned, state: 'published' }), /INVALID_REQUEST/);
  } finally { catalog.close(); }
});

test('SC-02/09/10: catalog survives reopen with stable IDs and unchanged Unicode URLs', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'catalog-persist-'));
  const filename = path.join(directory, 'catalog.sqlite');
  try {
    const catalog = seeded(filename);
    catalog.posts.create(draft, exported);
    const version = catalog.db.version;
    catalog.close();
    const reopened = new WorkspaceCatalog(filename);
    try {
      assert.equal(reopened.db.version, version);
      assert.equal(reopened.distribution.links()[0].url, affiliate.url);
      assert.equal(reopened.posts.get(draft.id).title, 'Tiếng Việt');
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('catalog boundary rejects unknown fields, credentials, malformed IDs and forged permissions', () => {
  const catalog = seeded();
  try {
    assert.throws(() => catalog.distribution.saveChannel({ ...channel, can_publish: true }), /INVALID_REQUEST/);
    assert.throws(() => catalog.distribution.saveLink({ ...affiliate, url: 'https://user:password@shopee.vn/item' }), /INVALID_URL/);
    assert.throws(() => catalog.distribution.saveLink({ ...affiliate, url: 'javascript:alert(1)' }), /INVALID_URL/);
    assert.throws(() => catalog.posts.list({ ...query, channel_id: '../unsafe' }), /INVALID_REQUEST/);
    assert.throws(() => catalog.posts.list({ ...query, limit: 100000 }), /INVALID_REQUEST/);
    assert.throws(() => catalog.posts.create({ ...draft, link_ids: [affiliate.id, affiliate.id] }, exported), /INVALID_REQUEST/);
    assert.throws(() => catalog.posts.create(draft, { ...exported, link_id: 'export_002' }), /INVALID_EXPORT/);
  } finally { catalog.close(); }
});

test('shared label archival preserves existing references but prevents new assignment', () => {
  const catalog = seeded();
  try {
    const input = { id: 'label_001', expected_revision: null, name: 'Máy ảnh', kind: 'category', archived: false };
    const label = catalog.taxonomy.save(input);
    catalog.taxonomy.assignContent({ id: 'library_001', expected_revision: null, label_ids: [label.id] });
    catalog.taxonomy.save({ ...input, expected_revision: 1, archived: true });
    catalog.taxonomy.assignContent({ id: 'library_001', expected_revision: 1, label_ids: [label.id] });
    assert.throws(() => catalog.taxonomy.assignContent({ id: 'library_002', expected_revision: null, label_ids: [label.id] }), /LABEL_ARCHIVED/);
    assert.throws(() => catalog.taxonomy.save({ ...input, expected_revision: 2, kind: 'tag' }), /LABEL_KIND_LOCKED/);
  } finally { catalog.close(); }
});
