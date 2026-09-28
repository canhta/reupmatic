import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentLibrary } from '../../dist-core/library/content-library.js';
import {
  DOUYIN_DOWNLOAD_FAILED,
  douyinDownloadFilename,
  douyinDownloadMirrors,
  douyinTierUrl,
  douyinTierUrlList,
  runDouyinDownloads,
} from '../../dist-core/sources/douyin-download.js';

const CAPTURED_AT = 1_758_200_000_000;

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function detail(awemeId, mirrors, { dataSize = null } = {}) {
  return {
    awemeId,
    mediaType: 'video',
    description: `Vacation clip ${awemeId}`,
    createTime: 1_758_153_600,
    shareUrl: `https://www.douyin.com/video/${awemeId}`,
    author: { uid: 'u-1', nickname: 'A', secUid: 'MS4wLjABAAAA', avatarUri: null },
    video: {
      durationMs: 19_000,
      ratio: '1080p',
      format: 'mp4',
      coverUri: 'cover/1',
      tiers: [
        {
          gearName: 'normal_1080_0',
          bitRate: 2_400_000,
          width: 1080,
          height: 1920,
          dataSize,
          codec: 'h264',
          uri: 'v/high',
        },
      ],
    },
    statistics: {
      diggCount: null,
      commentCount: null,
      shareCount: null,
      collectCount: null,
      playCount: null,
      capturedAt: CAPTURED_AT,
    },
    raw: {
      aweme_detail: {
        aweme_id: awemeId,
        desc: `Vacation clip ${awemeId}`,
        create_time: 1_758_153_600,
        share_info: { share_url: `https://www.douyin.com/video/${awemeId}` },
        author: { uid: 'u-1', nickname: 'A', sec_uid: 'MS4wLjABAAAA' },
        statistics: { digg_count: null },
        text_extra: [],
        video: {
          duration: 19_000,
          ratio: '1080p',
          format: 'mp4',
          cover: { uri: 'cover/1', url_list: ['https://cdn.example/cover?Expires=1'] },
          bit_rate: [
            {
              gear_name: 'normal_1080_0',
              bit_rate: 2_400_000,
              play_addr: {
                width: 1080,
                height: 1920,
                data_size: dataSize,
                uri: 'v/high',
                url_list: mirrors,
              },
            },
          ],
        },
      },
    },
  };
}

async function mediaServer(t) {
  const body = Buffer.from('reupmatic-media-bytes');
  const server = http.createServer((request, response) => {
    if (request.url === '/ok') {
      response.writeHead(200, { 'content-type': 'video/mp4' });
      response.end(body);
      return;
    }
    if (request.url === '/missing') {
      response.writeHead(404);
      response.end('gone');
      return;
    }
    response.writeHead(500);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { body, url: `${origin}/ok`, missing: `${origin}/missing` };
}

async function fetchDownload(request) {
  const response = await fetch(request.url);
  if (!response.ok) throw new Error('DOWNLOAD_FAILED');
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    path: request.destination,
    bytes: buffer.length,
    sha256: sha256(buffer),
    container: 'mp4',
    codec: 'h264',
    duration_ms: 19_000,
    width: 1080,
    height: 1920,
    frame_rate: '30/1',
    has_audio: true,
    reused: false,
    resumed: false,
  };
}

const baseDeps = (overrides = {}) => ({
  findHeld: () => null,
  destinationFor: (item) => `/tmp/${item.awemeId}.mp4`,
  download: fetchDownload,
  commit: async () => ({ id: 'content-1' }),
  now: () => CAPTURED_AT,
  ...overrides,
});

test('a whole selection downloads, reports transitions, and records the direct path and tier', async (t) => {
  const server = await mediaServer(t);
  const details = new Map([
    ['1111111111111111111', detail('1111111111111111111', [server.url])],
    ['2222222222222222222', detail('2222222222222222222', [server.url])],
  ]);
  const snapshots = [];
  const commits = [];
  const result = await runDouyinDownloads(
    [
      { awemeId: '1111111111111111111', tierIndex: 0 },
      { awemeId: '2222222222222222222', tierIndex: 0 },
    ],
    baseDeps({
      observe: async (awemeId) => details.get(awemeId),
      onProgress: (snapshot) => snapshots.push(snapshot),
      commit: async (commit) => {
        commits.push(commit);
        return { id: `content-${commit.detail.awemeId}` };
      },
    }),
  );

  assert.equal(result.active, false);
  assert.equal(result.completed, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(
    result.items.map((item) => item.state),
    ['complete', 'complete'],
  );
  assert.equal(commits[0].servedBy, 'direct');
  assert.equal(commits[0].tierIndex, 0);
  assert.equal(commits[0].file.bytes, server.body.length);
  assert.deepEqual(
    snapshots[0].items.map((item) => item.state),
    ['queued', 'queued'],
  );
  assert.ok(snapshots.some((snapshot) => snapshot.items[0].state === 'running'));
});

test('a tier whose declared dataSize disagrees with the served bytes still completes', async (t) => {
  // Douyin's data_size is a claim; Content-Length + FFmpeg probe are the real verification.
  const server = await mediaServer(t);
  const requests = [];
  const result = await runDouyinDownloads(
    [{ awemeId: '3333300000000000001', tierIndex: 0 }],
    baseDeps({
      observe: async () => detail('3333300000000000001', [server.url], { dataSize: 999_999_999 }),
      download: async (request) => {
        requests.push(request);
        return fetchDownload(request);
      },
    }),
  );
  assert.equal(result.completed, 1);
  assert.equal(result.items[0].state, 'complete');
  assert.ok(
    !('expected_size' in requests[0]),
    'a tier dataSize must never become a request field the worker could verify against',
  );
});

test('an item already held is reused by aweme_id and never fetched', async (t) => {
  const server = await mediaServer(t);
  let downloads = 0;
  const result = await runDouyinDownloads([{ awemeId: '3333333333333333333', tierIndex: 0 }], {
    ...baseDeps({
      findHeld: (awemeId) => (awemeId === '3333333333333333333' ? { id: 'held-1' } : null),
      observe: async () => detail('3333333333333333333', [server.url]),
      download: async (request) => {
        downloads += 1;
        return fetchDownload(request);
      },
    }),
  });

  assert.equal(downloads, 0, 'a held item must not be re-downloaded');
  assert.equal(result.reused, 1);
  assert.equal(result.items[0].state, 'reused');
  assert.equal(result.items[0].contentId, 'held-1');
});

test('one failing item does not stop the rest and reports exactly one failure', async (t) => {
  const server = await mediaServer(t);
  const observed = new Map([
    ['4444444444444444444', detail('4444444444444444444', [server.url])],
    ['6666666666666666666', detail('6666666666666666666', [server.url])],
  ]);
  const result = await runDouyinDownloads(
    [
      { awemeId: '4444444444444444444', tierIndex: 0 },
      { awemeId: '5555555555555555555', tierIndex: 0 },
      { awemeId: '6666666666666666666', tierIndex: 0 },
    ],
    baseDeps({
      observe: async (awemeId) => {
        if (awemeId === '5555555555555555555') throw new Error('DOUYIN_REFUSED');
        return observed.get(awemeId);
      },
    }),
  );

  assert.equal(result.completed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.items[1].state, 'failed');
  assert.equal(result.items[1].code, 'DOUYIN_REFUSED');
  assert.equal(result.items[1].stage, 'observe');
  assert.equal(result.items[0].stage, undefined);
  assert.equal(result.items.filter((item) => item.state === 'failed').length, 1);
});

test('a refused first mirror falls through to a working second mirror, direct, no reobserve needed', async (t) => {
  const server = await mediaServer(t);
  const attempts = [];
  const result = await runDouyinDownloads(
    [{ awemeId: '2222200000000000001', tierIndex: 0 }],
    baseDeps({
      observe: async () =>
        detail('2222200000000000001', [`${server.url}/missing-mirror`, server.url]),
      download: async (request) => {
        attempts.push(request.url);
        if (request.url.endsWith('/missing-mirror')) {
          const response = await fetch(request.url);
          if (!response.ok) throw new Error('DOWNLOAD_FAILED');
        }
        return fetchDownload(request);
      },
      commit: async (commit) => {
        assert.equal(commit.servedBy, 'direct');
        return { id: 'content-mirror' };
      },
    }),
  );
  assert.equal(result.completed, 1);
  assert.equal(attempts.length, 2, 'the second mirror must be tried after the first refuses');
});

test('an obviously watermarked mirror is skipped in favour of a clean one', () => {
  const item = detail('2222200000000000002', [
    'https://cdn.example/v/clip-playwm?Expires=1',
    'https://cdn.example/v/clip-clean?Expires=1',
  ]);
  assert.deepEqual(douyinDownloadMirrors(item.raw, 0), [
    'https://cdn.example/v/clip-clean?Expires=1',
  ]);
});

test('every mirror being watermarked still returns them, rather than refusing before a transfer', () => {
  const item = detail('2222200000000000003', ['https://cdn.example/v/clip-playwm?Expires=1']);
  assert.deepEqual(douyinDownloadMirrors(item.raw, 0), [
    'https://cdn.example/v/clip-playwm?Expires=1',
  ]);
});

test('every mirror refusing re-resolves once through reobserve and retries the fresh mirrors', async (t) => {
  const server = await mediaServer(t);
  let reobserved = 0;
  const staleDetail = detail('2222200000000000004', [`${server.missing}`]);
  const freshDetail = detail('2222200000000000004', [server.url]);
  const result = await runDouyinDownloads(
    [{ awemeId: '2222200000000000004', tierIndex: 0 }],
    baseDeps({
      observe: async () => staleDetail,
      reobserve: async (awemeId) => {
        reobserved += 1;
        assert.equal(awemeId, '2222200000000000004');
        return freshDetail;
      },
      download: async (request) => {
        const response = await fetch(request.url);
        if (!response.ok) throw new Error('DOWNLOAD_FAILED');
        return fetchDownload(request);
      },
      commit: async (commit) => {
        assert.equal(commit.detail, freshDetail);
        return { id: 'content-reobserved' };
      },
    }),
  );
  assert.equal(reobserved, 1);
  assert.equal(result.completed, 1);
});

test('a reobserve is never attempted for a non-refusal error', async (t) => {
  const server = await mediaServer(t);
  let reobserved = 0;
  const result = await runDouyinDownloads(
    [{ awemeId: '2222200000000000005', tierIndex: 0 }],
    baseDeps({
      observe: async () => detail('2222200000000000005', [server.url]),
      reobserve: async () => {
        reobserved += 1;
        throw new Error('UNUSED');
      },
      download: async () => {
        throw new Error('DOWNLOAD_SIZE_MISMATCH');
      },
    }),
  );
  assert.equal(reobserved, 0);
  assert.equal(result.items[0].code, 'DOWNLOAD_SIZE_MISMATCH');
});

test('a fresh reobserved mirror set still refusing is an honest terminal transfer failure', async (t) => {
  const server = await mediaServer(t);
  const staleDetail = detail('2222200000000000006', [server.url]);
  const freshDetail = detail('2222200000000000006', [server.url]);
  let reobserved = 0;
  const result = await runDouyinDownloads(
    [{ awemeId: '2222200000000000006', tierIndex: 0 }],
    baseDeps({
      observe: async () => staleDetail,
      reobserve: async () => {
        reobserved += 1;
        return freshDetail;
      },
      download: async () => {
        throw new Error('DOWNLOAD_FAILED');
      },
    }),
  );
  assert.equal(reobserved, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.items[0].code, 'DOWNLOAD_FAILED');
  assert.equal(result.items[0].stage, 'transfer');
});

test('a direct refusal with no reobserve available is an honest failure, never a claimed success', async (t) => {
  const server = await mediaServer(t);
  const result = await runDouyinDownloads([{ awemeId: '8888888888888888888', tierIndex: 0 }], {
    ...baseDeps({
      observe: async () => detail('8888888888888888888', [server.url]),
      download: async () => {
        throw new Error('DOWNLOAD_FAILED');
      },
    }),
  });
  assert.equal(result.failed, 1);
  assert.equal(result.items[0].code, 'DOWNLOAD_FAILED');
  assert.equal(result.items[0].stage, 'transfer');
});

test('a failed commit after a completed transfer names the commit stage', async (t) => {
  const server = await mediaServer(t);
  const result = await runDouyinDownloads([{ awemeId: '1515151515151515151', tierIndex: 0 }], {
    ...baseDeps({
      observe: async () => detail('1515151515151515151', [server.url]),
      commit: async () => {
        throw new Error('LIBRARY_UNAVAILABLE');
      },
    }),
  });
  assert.equal(result.items[0].code, 'LIBRARY_UNAVAILABLE');
  assert.equal(result.items[0].stage, 'commit');
});

test('cancelling between candidates stops the run and leaves no commit for the rest', async (t) => {
  const server = await mediaServer(t);
  const details = new Map([
    ['1212121212121212121', detail('1212121212121212121', [server.url])],
    ['1313131313131313131', detail('1313131313131313131', [server.url])],
  ]);
  let cancelled = false;
  const commits = [];
  const result = await runDouyinDownloads(
    [
      { awemeId: '1212121212121212121', tierIndex: 0 },
      { awemeId: '1313131313131313131', tierIndex: 0 },
    ],
    baseDeps({
      observe: async (awemeId) => details.get(awemeId),
      commit: async (commit) => {
        commits.push(commit.detail.awemeId);
        cancelled = true;
        return { id: 'content-first' };
      },
      isCancelled: () => cancelled,
    }),
  );
  assert.equal(result.cancelled, true);
  assert.deepEqual(commits, ['1212121212121212121']);
  assert.equal(result.items[0].state, 'complete');
  assert.equal(result.items[1].state, 'queued');
});

test('a missing media URL fails the item rather than committing an empty success', async () => {
  const result = await runDouyinDownloads([{ awemeId: '1414141414141414141', tierIndex: 0 }], {
    ...baseDeps({
      observe: async () => detail('1414141414141414141', []),
    }),
  });
  assert.equal(result.items[0].state, 'failed');
  assert.equal(result.items[0].code, 'DOUYIN_MEDIA_URL_MISSING');
  assert.equal(result.items[0].stage, 'resolve');
});

test('the tier URL is read from the raw payload at use and the mirrors are never in the projection', () => {
  const item = detail('1515151515151515151', ['https://cdn.example/v/high?Expires=1']);
  assert.deepEqual(douyinTierUrlList(item.raw, 0), ['https://cdn.example/v/high?Expires=1']);
  assert.equal(douyinTierUrl(item.raw, 0), 'https://cdn.example/v/high?Expires=1');
  assert.equal(douyinTierUrl(item.raw, 5), null);
  assert.deepEqual(douyinTierUrlList(null, 0), []);
});

test('the filename is sanitized and always carries the aweme_id, never used as identity', () => {
  const name = douyinDownloadFilename(detail('1616161616161616161', [], { dataSize: null }));
  assert.ok(name.includes('1616161616161616161'));
  assert.ok(name.endsWith('.mp4'));
  const hostile = detail('1717171717171717171', []);
  hostile.description = '../../etc/passwd\u0000\n: rm -rf /';
  const sanitized = douyinDownloadFilename(hostile);
  assert.ok(!sanitized.includes('/'));
  assert.ok(!sanitized.includes('\\'));
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters must never reach a path
  assert.ok(!/[\u0000-\u001f\u007f]/.test(sanitized));
  assert.ok(sanitized.includes('1717171717171717171'));
});

test('findContentByAwemeId is identity; filename equality is never consulted', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-dl-lib-')));
  const library = new ContentLibrary(
    path.join(root, 'library.sqlite'),
    path.join(root, 'managed'),
    {
      inspectOriginal: async () => {
        throw new Error('UNUSED');
      },
      assignTags: () => undefined,
    },
  );
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });

  const item = await library.registerDouyinContent(
    {
      path: '/tmp/first-name.mp4',
      name: 'first-name.mp4',
      sha256: 'a'.repeat(64),
      size_bytes: 1000,
      media_kind: 'video',
      video: { duration_ms: 19_000, width: 1080, height: 1920, has_audio: true },
      audio: null,
      origin: { kind: 'douyin', aweme_id: '1818181818181818181', sec_uid: 'sec', share_url: null },
      published_at: 1_758_153_600_000,
    },
    {
      awemeId: '1818181818181818181',
      mediaType: 'video',
      awemeType: 0,
      isTop: false,
      description: 'x',
      publishedAt: 1_758_153_600_000,
      downloadedAt: CAPTURED_AT,
      servedBy: 'direct',
      shareUrl: null,
      author: { uid: null, nickname: null, secUid: 'sec', avatarUri: null },
      tags: [{ name: 'streetfood', hashtagId: 'h-1' }],
      mentions: [],
      video: null,
      probe: null,
      disagreements: [],
      counters: {
        diggCount: null,
        commentCount: null,
        shareCount: null,
        collectCount: null,
        playCount: null,
        capturedAt: CAPTURED_AT,
      },
      music: null,
      mixInfo: null,
      anchorLinks: [],
      images: [],
    },
    { aweme_detail: { aweme_id: '1818181818181818181' } },
  );

  assert.equal(library.findContentByAwemeId('1818181818181818181').id, item.id);
  assert.equal(library.findContent('a'.repeat(64)).id, item.id);
  assert.equal(library.findContentByAwemeId('9999999999999999999'), null);
  const intake = library.getDouyinIntake(item.id);
  assert.equal(intake.intake.servedBy, 'direct');
  assert.equal(intake.raw.aweme_detail.aweme_id, '1818181818181818181');
  library.removeContent(item.id);
  assert.equal(library.findContentByAwemeId('1818181818181818181'), null);
});

test('registerDouyinContent attaches hashtags through the injected taxonomy seam', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-dl-tags-')));
  const assigned = [];
  const library = new ContentLibrary(
    path.join(root, 'library.sqlite'),
    path.join(root, 'managed'),
    {
      inspectOriginal: async () => {
        throw new Error('UNUSED');
      },
      assignTags: (contentId, tags) => assigned.push({ contentId, tags }),
    },
  );
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });
  const item = await library.registerDouyinContent(
    {
      path: '/tmp/tagged.mp4',
      name: 'tagged.mp4',
      sha256: 'b'.repeat(64),
      size_bytes: 1000,
      media_kind: 'video',
      video: { duration_ms: 19_000, width: 1080, height: 1920, has_audio: true },
      audio: null,
      origin: { kind: 'douyin', aweme_id: '1919191919191919191', sec_uid: null, share_url: null },
      published_at: null,
    },
    {
      awemeId: '1919191919191919191',
      mediaType: 'video',
      awemeType: null,
      isTop: false,
      description: 'x',
      publishedAt: null,
      downloadedAt: CAPTURED_AT,
      servedBy: 'page',
      shareUrl: null,
      author: { uid: null, nickname: null, secUid: null, avatarUri: null },
      tags: [{ name: '越南美食', hashtagId: null }],
      mentions: [],
      video: null,
      probe: null,
      disagreements: [],
      counters: {
        diggCount: null,
        commentCount: null,
        shareCount: null,
        collectCount: null,
        playCount: null,
        capturedAt: CAPTURED_AT,
      },
      music: null,
      mixInfo: null,
      anchorLinks: [],
      images: [],
    },
    {},
  );
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].contentId, item.id);
  assert.deepEqual(assigned[0].tags, [{ name: '越南美食', hashtagId: null }]);
});

test('registerDouyinContent rejects a projection whose aweme_id disagrees with the origin', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-dl-bad-')));
  const library = new ContentLibrary(
    path.join(root, 'library.sqlite'),
    path.join(root, 'managed'),
    {
      inspectOriginal: async () => {
        throw new Error('UNUSED');
      },
    },
  );
  t.after(async () => {
    library.close();
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(
    library.registerDouyinContent(
      {
        path: '/tmp/mismatch.mp4',
        name: 'mismatch.mp4',
        sha256: 'c'.repeat(64),
        size_bytes: 1000,
        media_kind: 'video',
        video: { duration_ms: 19_000, width: 1080, height: 1920, has_audio: true },
        audio: null,
        origin: { kind: 'douyin', aweme_id: '2020202020202020202', sec_uid: null, share_url: null },
        published_at: null,
      },
      {
        awemeId: '2121212121212121212',
        mediaType: 'video',
        awemeType: null,
        isTop: false,
        description: 'x',
        publishedAt: null,
        downloadedAt: CAPTURED_AT,
        servedBy: 'direct',
        shareUrl: null,
        author: { uid: null, nickname: null, secUid: null, avatarUri: null },
        tags: [],
        mentions: [],
        video: null,
        probe: null,
        disagreements: [],
        counters: {
          diggCount: null,
          commentCount: null,
          shareCount: null,
          collectCount: null,
          playCount: null,
          capturedAt: CAPTURED_AT,
        },
        music: null,
        mixInfo: null,
        anchorLinks: [],
        images: [],
      },
      {},
    ),
    /INVALID_REQUEST/,
  );
});

test('the shared fallback failure code is stable', () => {
  assert.equal(DOUYIN_DOWNLOAD_FAILED, 'DOUYIN_DOWNLOAD_FAILED');
});
