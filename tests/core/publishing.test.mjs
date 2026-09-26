import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WorkspaceCatalog } from '../../dist-core/catalog/workspace-catalog.js';
import { composeCaption } from '../../dist-core/distribution/publishing/caption.js';
import {
  FACEBOOK_CAPABILITIES,
  facebookPreflight,
} from '../../dist-core/distribution/publishing/facebook.js';
import { parsePostOptions } from '../../dist-core/distribution/publishing/options.js';
import {
  canStartAttempt,
  markFailed,
  markPublished,
  markScheduled,
  markSubmitted,
  markUnknown,
  startAttempt,
} from '../../dist-core/distribution/publishing/publication.js';
import {
  YOUTUBE_CAPABILITIES,
  youtubePreflight,
} from '../../dist-core/distribution/publishing/youtube.js';
import { operations } from '../../dist-core/host-bridge/operations.js';

const attempt = (now = 1000) =>
  startAttempt(null, { attempt_id: 'attempt_0001', remote_ref: 'v1', now });

test('SC-16: a second attempt is refused until the previous one is a definite failure', () => {
  assert.equal(canStartAttempt(null), true);
  const uploading = attempt();
  assert.equal(uploading.phase, 'uploading');
  assert.equal(canStartAttempt(uploading), false);
  assert.throws(
    () => startAttempt(uploading, { attempt_id: 'attempt_0002', remote_ref: 'v2', now: 2 }),
    /PUBLICATION_ALREADY_ATTEMPTED/,
  );
  for (const phase of ['submitted', 'scheduled', 'published', 'unknown']) {
    const current = { ...uploading, phase };
    assert.equal(canStartAttempt(current), false, phase);
    assert.throws(
      () => startAttempt(current, { attempt_id: 'attempt_0002', remote_ref: 'v2', now: 2 }),
      /PUBLICATION_ALREADY_ATTEMPTED/,
      phase,
    );
  }
  const failed = markFailed(markSubmitted(uploading, 2), { error: 'PUBLISH_FAILED' }, 3);
  assert.equal(canStartAttempt(failed), true);
  const retried = startAttempt(failed, { attempt_id: 'attempt_0002', remote_ref: 'v2', now: 4 });
  assert.equal(retried.phase, 'uploading');
  assert.equal(retried.remote_ref, 'v2');
});

test('SC-16: an interrupted create reconciles only, and illegal phase jumps are rejected', () => {
  const uploading = attempt();
  const unknown = markUnknown(uploading, { error: 'PUBLISH_UNKNOWN' }, 2);
  assert.throws(() => markSubmitted(unknown, 3), /PUBLICATION_TRANSITION/);
  const reconciled = markPublished(
    unknown,
    { remote_post_id: 'p1', remote_url: 'https://x/p1' },
    4,
  );
  assert.equal(reconciled.phase, 'published');
  assert.equal(reconciled.remote_post_id, 'p1');
  assert.equal(reconciled.attempt_id, 'attempt_0001');
  assert.throws(
    () => markScheduled(uploading, { scheduled_for: 5, remote_post_id: null, remote_url: null }, 6),
    /PUBLICATION_TRANSITION/,
    'uploading cannot jump straight to scheduled',
  );
  const scheduled = markScheduled(
    markSubmitted(uploading, 2),
    { scheduled_for: 5, remote_post_id: null, remote_url: null },
    3,
  );
  assert.equal(scheduled.phase, 'scheduled');
  assert.equal(scheduled.scheduled_for, 5);
  assert.throws(
    () =>
      markUnknown(
        markPublished(scheduled, { remote_post_id: 'p', remote_url: null }, 4),
        { error: null },
        5,
      ),
    /PUBLICATION_TRANSITION/,
    'published is terminal',
  );
});

test('Facebook preflight enforces the verified Reels media and schedule window', () => {
  const post = { title: 'Hi', body: 'Body', links: [], planned: null };
  const good = { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: 10_000_000 };
  assert.deepEqual(facebookPreflight(post, good, 0), []);
  const codes = (media, planned, now) =>
    facebookPreflight({ ...post, planned }, media, now)
      .filter((problem) => problem.severity === 'blocking')
      .map((problem) => problem.code);
  assert.deepEqual(codes({ ...good, duration_ms: 2_000 }, null, 0), ['PUBLISH_MEDIA_TOO_SHORT']);
  assert.deepEqual(codes({ ...good, duration_ms: 90_001 }, null, 0), ['PUBLISH_MEDIA_TOO_LONG']);
  assert.deepEqual(codes({ ...good, width: 500, height: 900 }, null, 0), [
    'PUBLISH_MEDIA_RESOLUTION',
  ]);
  assert.deepEqual(codes({ ...good, width: 1920, height: 1080 }, null, 0), [
    'PUBLISH_MEDIA_ASPECT',
  ]);
  assert.deepEqual(
    codes({ ...good, size_bytes: FACEBOOK_CAPABILITIES.media.max_bytes + 1 }, null, 0),
    ['PUBLISH_MEDIA_TOO_LARGE'],
  );
  const now = 1_000_000;
  assert.deepEqual(codes(good, { instant: now + 9 * 60 * 1000, timezone: 'UTC' }, now), [
    'PUBLISH_SCHEDULE_TOO_SOON',
  ]);
  assert.deepEqual(codes(good, { instant: now + 30 * 24 * 60 * 60 * 1000, timezone: 'UTC' }, now), [
    'PUBLISH_SCHEDULE_TOO_FAR',
  ]);
});

test('caption composition is body then one line per affiliate link, clipped only when forced', () => {
  const link = (id, url) => ({ id, name: id, url });
  const caption = composeCaption(
    {
      title: 'Title',
      body: 'Body',
      links: [link('a', 'https://a.example/1'), link('b', 'https://b.example/2')],
    },
    FACEBOOK_CAPABILITIES,
  );
  assert.equal(caption.body, 'Body\nhttps://a.example/1\nhttps://b.example/2');
  assert.equal(caption.clipped, false);
  const long = composeCaption(
    { title: 'Title', body: 'x'.repeat(3000), links: [] },
    FACEBOOK_CAPABILITIES,
  );
  assert.equal(long.body.length, FACEBOOK_CAPABILITIES.caption.body_max);
  assert.equal(long.clipped, true);
});

test('YouTube preflight enforces the verified upload and schedule window', () => {
  const post = { title: 'Hi', body: 'Body', links: [], planned: null };
  const good = { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: 10_000_000 };
  assert.deepEqual(youtubePreflight(post, good, 0), []);
  const codes = (media, planned, now) =>
    youtubePreflight({ ...post, planned }, media, now)
      .filter((problem) => problem.severity === 'blocking')
      .map((problem) => problem.code);
  assert.deepEqual(codes({ ...good, duration_ms: 500 }, null, 0), ['PUBLISH_MEDIA_TOO_SHORT']);
  assert.deepEqual(codes({ ...good, width: 0, height: 0 }, null, 0), ['PUBLISH_MEDIA_RESOLUTION']);
  assert.deepEqual(
    codes({ ...good, size_bytes: YOUTUBE_CAPABILITIES.media.max_bytes + 1 }, null, 0),
    ['PUBLISH_MEDIA_TOO_LARGE'],
  );
  // Any aspect is accepted, unlike Facebook Reels.
  assert.deepEqual(codes({ ...good, width: 1920, height: 1080 }, null, 0), []);
  const now = 1_000_000;
  assert.deepEqual(codes(good, { instant: now + 30 * 1000, timezone: 'UTC' }, now), [
    'PUBLISH_SCHEDULE_TOO_SOON',
  ]);
  assert.deepEqual(
    codes(good, { instant: now + 366 * 24 * 60 * 60 * 1000, timezone: 'UTC' }, now),
    ['PUBLISH_SCHEDULE_TOO_FAR'],
  );
});

test('a YouTube post must declare made-for-kids explicitly; other platforms carry no options', () => {
  const kids = { self_declared_made_for_kids: true, contains_synthetic_media: false };
  assert.deepEqual(parsePostOptions({ youtube: kids }, 'youtube'), { youtube: kids });
  assert.throws(() => parsePostOptions({ youtube: null }, 'youtube'), /INVALID_REQUEST/);
  assert.throws(
    () => parsePostOptions({ youtube: { self_declared_made_for_kids: true } }, 'youtube'),
    /INVALID_REQUEST/,
  );
  assert.throws(
    () => parsePostOptions({ youtube: { ...kids, self_declared_made_for_kids: 'yes' } }, 'youtube'),
    /INVALID_REQUEST/,
  );
  assert.deepEqual(parsePostOptions({ youtube: null }, 'facebook_page'), { youtube: null });
  assert.throws(() => parsePostOptions({ youtube: kids }, 'facebook_page'), /INVALID_REQUEST/);
  assert.throws(
    () => parsePostOptions({ youtube: null, tiktok: null }, 'youtube'),
    /INVALID_REQUEST/,
  );
});

test('YouTube capabilities carry title 100 and body 5000 as the caption limits', () => {
  assert.equal(YOUTUBE_CAPABILITIES.caption.title_max, 100);
  assert.equal(YOUTUBE_CAPABILITIES.caption.body_max, 5000);
  assert.notEqual(YOUTUBE_CAPABILITIES.native_schedule, null);
  assert.equal(YOUTUBE_CAPABILITIES.media.aspect, 'any');
});

test('an honest privacy is recorded on the published outcome', () => {
  const uploading = attempt();
  const forced = markPublished(
    markSubmitted(uploading, 2),
    { remote_post_id: 'v1', remote_url: 'https://youtu.be/v1', privacy: 'private' },
    3,
  );
  assert.equal(forced.privacy, 'private');
  assert.equal(forced.phase, 'published');
});

test('publishing operations validate their channel and post ids', () => {
  assert.equal(operations['post-publish'].rendererMethod, 'postPublish');
  assert.equal(operations['post-reconcile'].rendererMethod, 'postReconcile');
  assert.equal(operations['channel-connect'].rendererMethod, 'channelConnect');
  assert.equal(operations['channel-connect-start'].rendererMethod, 'channelConnectStart');
  assert.equal(operations['channel-disconnect'].rendererMethod, 'channelDisconnect');
  assert.deepEqual(operations['post-publish'].validate({ id: 'post_0001' }), { id: 'post_0001' });
  assert.deepEqual(operations['post-reconcile'].toRequest('post_0001'), { id: 'post_0001' });
  assert.deepEqual(operations['channel-connect'].toRequest('channel_0001'), {
    id: 'channel_0001',
  });
  assert.throws(() => operations['post-publish'].validate({ id: '../escape' }), /INVALID_REQUEST/);
  assert.throws(() => operations['channel-connect'].validate({}), /INVALID_REQUEST/);
  assert.throws(
    () => operations['channel-connect'].validate({ id: 'channel_0001', extra: true }),
    /INVALID_REQUEST/,
  );
});

const channel = {
  id: 'channel_001',
  expected_revision: null,
  name: 'Facebook page',
  platform: 'facebook_page',
  url: '',
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
  link_ids: [],
  planned: null,
  options: { youtube: null },
};
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

test('SC-16: a new post has no publication, and the published view reads publication.phase', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'publishing-'));
  const catalog = new WorkspaceCatalog(path.join(directory, 'catalog.sqlite'), resolveExport);
  try {
    catalog.saveChannel(channel);
    const created = await catalog.createPost(draft);
    assert.equal(created.publication, null);
    const query = { search: '', view: 'published', offset: 0, limit: 25 };
    assert.equal(catalog.listPosts(query).total, 0);

    const uploading = startAttempt(null, { attempt_id: 'attempt_0001', remote_ref: 'v1', now: 1 });
    catalog.setPublication(created.id, uploading);
    assert.equal(catalog.listPosts(query).total, 1);
    assert.equal(catalog.getPost(created.id).publication.phase, 'uploading');

    const published = markPublished(
      markSubmitted(uploading, 2),
      { remote_post_id: 'p1', remote_url: 'https://www.facebook.com/reel/p1' },
      3,
    );
    catalog.setPublication(created.id, published);
    assert.equal(catalog.getPost(created.id).publication.phase, 'published');
    assert.equal(catalog.getPost(created.id).state, 'draft');
  } finally {
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('SC-16: a YouTube draft without a made-for-kids choice is refused', async () => {
  const catalog = new WorkspaceCatalog(':memory:', resolveExport);
  try {
    catalog.saveChannel({ ...channel, id: 'channel_yt', platform: 'youtube' });
    await assert.rejects(
      catalog.createPost({
        ...draft,
        id: 'post_yt01',
        channel_id: 'channel_yt',
        options: { youtube: null },
      }),
      /INVALID_REQUEST/,
    );
    const created = await catalog.createPost({
      ...draft,
      id: 'post_yt01',
      channel_id: 'channel_yt',
      options: {
        youtube: { self_declared_made_for_kids: true, contains_synthetic_media: false },
      },
    });
    assert.deepEqual(created.options.youtube, {
      self_declared_made_for_kids: true,
      contains_synthetic_media: false,
    });
    const edited = catalog.editPost({
      id: created.id,
      expected_revision: created.revision,
      title: created.title,
      body: created.body,
      planned: null,
      options: { youtube: { self_declared_made_for_kids: true, contains_synthetic_media: true } },
      state: 'draft',
    });
    assert.equal(edited.options.youtube.contains_synthetic_media, true);
  } finally {
    catalog.close();
  }
});

test('catalog exposes real connection state and publishability per channel', () => {
  const catalog = new WorkspaceCatalog(':memory:', resolveExport);
  try {
    catalog.saveChannel(channel);
    assert.equal(catalog.listChannels()[0].connection, 'not_connected');
    const disconnected = catalog.listChannels({
      channel_001: { connection: 'not_connected', account_name: null },
    })[0];
    assert.equal(disconnected.connection, 'not_connected');
    assert.equal(disconnected.can_publish, false);
    const connected = catalog.listChannels({
      channel_001: { connection: 'connected', account_name: 'My Page' },
    })[0];
    assert.equal(connected.connection, 'connected');
    assert.equal(connected.account_name, 'My Page');
    assert.equal(connected.can_publish, true);
    const stale = catalog.listChannels({
      channel_001: { connection: 'reauthorize', account_name: 'My Page' },
    })[0];
    assert.equal(stale.connection, 'reauthorize');
    assert.equal(stale.can_publish, false);
    assert.equal(
      catalog.snapshot(true, { channel_001: { connection: 'connected', account_name: null } })
        .channels[0].can_publish,
      true,
    );
  } finally {
    catalog.close();
  }
});
