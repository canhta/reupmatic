import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WorkspaceCatalog } from '../../dist-core/catalog/workspace-catalog.js';
import { parsePostPlan } from '../../dist-core/distribution/post-schedule.js';

const channel = {
  id: 'channel_001',
  expected_revision: null,
  name: 'Kênh chính',
  platform: 'youtube',
  url: '',
  label_ids: [],
  archived: false,
};
const affiliate = {
  id: 'affiliate_001',
  expected_revision: null,
  name: 'Máy ảnh',
  url: 'https://s.shopee.vn/example?sub_id=Ti%E1%BA%BFng+Vi%E1%BB%87t&x=1',
  label_ids: [],
  archived: false,
};
const exported = {
  library_id: 'library_001',
  link_id: 'export_001',
  name: 'video.mp4',
  path: path.resolve('video.mp4'),
  sha256: 'a'.repeat(64),
};
const draft = {
  id: 'post_0001',
  expected_revision: null,
  title: 'Tiếng Việt',
  body: 'Nội dung',
  channel_id: channel.id,
  library_id: exported.library_id,
  export_id: exported.link_id,
  link_ids: [affiliate.id],
  planned: null,
};
const query = { search: '', view: 'all', offset: 0, limit: 25 };
async function resolveExport(contentId, exportId) {
  if (contentId !== exported.library_id || exportId !== exported.link_id)
    throw new Error('INVALID_EXPORT');
  return {
    id: exported.link_id,
    kind: 'export',
    name: exported.name,
    path: exported.path,
    sha256: exported.sha256,
    size_bytes: 0,
    created_at: 0,
  };
}
function seeded(filename = ':memory:') {
  const catalog = new WorkspaceCatalog(filename, resolveExport);
  catalog.saveChannel(channel);
  catalog.saveLink(affiliate);
  return catalog;
}

test('SC-10: one destination post owns exact export and link snapshots', async () => {
  const catalog = seeded();
  try {
    const saved = await catalog.createPost(draft);
    catalog.saveLink({
      ...affiliate,
      expected_revision: 1,
      name: 'Changed',
      url: 'https://shopee.vn/new',
      archived: true,
    });
    catalog.saveChannel({ ...channel, expected_revision: 1, name: 'Renamed' });
    const stored = catalog.getPost(saved.id);
    assert.equal(stored.links[0].url, affiliate.url);
    assert.equal(stored.channel.name, channel.name);
    assert.equal(stored.export.sha256, exported.sha256);
    assert.equal(stored.state, 'draft');
    assert.equal(catalog.listPosts({ ...query, view: 'published' }).total, 0);
    assert.equal(catalog.snapshot(true).link_usage[affiliate.id], 1);
    await assert.rejects(catalog.createPost({ ...draft, id: 'post_0002' }), /LINK_ARCHIVED/);
  } finally {
    catalog.close();
  }
});

test('SC-09/10: per-channel count, retry conflict and cancellation never rewrite usage history', async () => {
  const catalog = seeded();
  try {
    catalog.saveChannel({ ...channel, id: 'channel_002', platform: 'facebook_page' });
    const post = await catalog.createPost(draft);
    await catalog.createPost({ ...draft, id: 'post_0002', channel_id: 'channel_002' });
    await assert.rejects(catalog.createPost(draft), /REVISION_CONFLICT/);
    assert.equal(catalog.snapshot(true).link_usage[affiliate.id], 2);
    catalog.editPost({
      id: post.id,
      expected_revision: post.revision,
      title: post.title,
      body: post.body,
      planned: null,
      state: 'cancelled',
    });
    assert.equal(catalog.listPosts({ ...query, link_id: affiliate.id }).total, 2);
    assert.equal(catalog.listPosts({ ...query, view: 'cancelled' }).total, 1);
    assert.deepEqual(catalog.dependencies(exported.library_id), {
      posts: 2,
      pending_posts: 1,
      workflows: 0,
    });
    assert.throws(
      () =>
        catalog.editPost({
          id: post.id,
          expected_revision: post.revision,
          title: 'Stale',
          body: '',
          planned: null,
          state: 'draft',
        }),
      /REVISION_CONFLICT/,
    );
  } finally {
    catalog.close();
  }
});

test('UI-CM05: post list sort_by/sort_dir orders the whole matching set before paging', async () => {
  const catalog = seeded();
  try {
    catalog.saveChannel({ ...channel, id: 'channel_002', name: 'Alpha channel' });
    const titles = ['Charlie', 'Alpha', 'Echo', 'Bravo', 'Delta'];
    for (const [index, title] of titles.entries()) {
      await catalog.createPost({
        ...draft,
        id: `post_sort_${index}`,
        title,
        channel_id: index % 2 === 0 ? channel.id : 'channel_002',
      });
    }
    // Sort applies to the whole 5-post set, then a 2-row page slices it —
    // not the other way around (sorting only the visible page is a bug).
    const page1 = catalog.listPosts({
      ...query,
      limit: 2,
      offset: 0,
      sort_by: 'title',
      sort_dir: 'ascending',
    });
    assert.deepEqual(
      page1.items.map((post) => post.title),
      ['Alpha', 'Bravo'],
    );
    const page2 = catalog.listPosts({
      ...query,
      limit: 2,
      offset: 2,
      sort_by: 'title',
      sort_dir: 'ascending',
    });
    assert.deepEqual(
      page2.items.map((post) => post.title),
      ['Charlie', 'Delta'],
    );
    const descending = catalog.listPosts({
      ...query,
      limit: 5,
      sort_by: 'title',
      sort_dir: 'descending',
    });
    assert.deepEqual(
      descending.items.map((post) => post.title),
      ['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'],
    );
    const byChannel = catalog.listPosts({ ...query, limit: 5, sort_by: 'channel' });
    assert.deepEqual(
      byChannel.items.map((post) => post.channel.name),
      ['Alpha channel', 'Alpha channel', channel.name, channel.name, channel.name],
    );
    assert.throws(() => catalog.listPosts({ ...query, sort_by: 'unknown' }), /INVALID_REQUEST/);
  } finally {
    catalog.close();
  }
});

test('SC-10/14: planned instants retain explicit timezone and do not publish', async () => {
  const catalog = seeded();
  try {
    const planned = { instant: Date.UTC(2026, 8, 20, 7, 30), timezone: 'Asia/Bangkok' };
    await catalog.createPost({ ...draft, planned });
    assert.deepEqual(catalog.listPosts({ ...query, view: 'upcoming' }).items[0].planned, planned);
    assert.equal(catalog.listPosts({ ...query, view: 'published' }).total, 0);
    assert.throws(
      () => parsePostPlan({ ...planned, timezone: 'Invalid/Place' }),
      /INVALID_SCHEDULE/,
    );
    assert.throws(() => parsePostPlan({ ...planned, instant: NaN }), /INVALID_SCHEDULE/);
    assert.throws(
      () =>
        catalog.editPost({
          id: draft.id,
          expected_revision: 1,
          title: 'Title',
          body: '',
          planned,
          state: 'published',
        }),
      /INVALID_REQUEST/,
    );
  } finally {
    catalog.close();
  }
});

test('SC-02/09/10: catalog survives reopen with stable IDs and unchanged Unicode URLs', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'catalog-persist-'));
  const filename = path.join(directory, 'catalog.sqlite');
  try {
    const catalog = seeded(filename);
    await catalog.createPost(draft);
    const revision = catalog.snapshot(true).revision;
    catalog.close();
    const reopened = new WorkspaceCatalog(filename, resolveExport);
    try {
      assert.equal(reopened.snapshot(true).revision, revision);
      assert.equal(reopened.listLinks()[0].url, affiliate.url);
      assert.equal(reopened.getPost(draft.id).title, 'Tiếng Việt');
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('catalog boundary rejects unknown fields, credentials, malformed IDs and forged permissions', async () => {
  const catalog = seeded();
  try {
    assert.throws(() => catalog.saveChannel({ ...channel, can_publish: true }), /INVALID_REQUEST/);
    assert.throws(
      () =>
        catalog.saveLink({
          ...affiliate,
          url: 'https://user:password@shopee.vn/item',
        }),
      /INVALID_URL/,
    );
    assert.throws(
      () => catalog.saveLink({ ...affiliate, url: 'javascript:alert(1)' }),
      /INVALID_URL/,
    );
    assert.throws(
      () => catalog.listPosts({ ...query, channel_id: '../unsafe' }),
      /INVALID_REQUEST/,
    );
    assert.throws(() => catalog.listPosts({ ...query, limit: 100000 }), /INVALID_REQUEST/);
    await assert.rejects(
      catalog.createPost({ ...draft, link_ids: [affiliate.id, affiliate.id] }),
      /INVALID_REQUEST/,
    );
    await assert.rejects(
      catalog.createPost({ ...draft, export_id: 'export_002' }),
      /INVALID_EXPORT/,
    );
  } finally {
    catalog.close();
  }
});

test('shared label archival preserves existing references but prevents new assignment', () => {
  const catalog = seeded();
  try {
    const input = {
      id: 'label_001',
      expected_revision: null,
      name: 'Máy ảnh',
      kind: 'category',
      archived: false,
    };
    const label = catalog.saveLabel(input);
    catalog.assignContentLabel({
      id: 'library_001',
      expected_revision: null,
      label_ids: [label.id],
    });
    catalog.saveLabel({ ...input, expected_revision: 1, archived: true });
    catalog.assignContentLabel({
      id: 'library_001',
      expected_revision: 1,
      label_ids: [label.id],
    });
    assert.throws(
      () =>
        catalog.assignContentLabel({
          id: 'library_002',
          expected_revision: null,
          label_ids: [label.id],
        }),
      /LABEL_ARCHIVED/,
    );
    assert.throws(
      () => catalog.saveLabel({ ...input, expected_revision: 2, kind: 'tag' }),
      /LABEL_KIND_LOCKED/,
    );
  } finally {
    catalog.close();
  }
});
