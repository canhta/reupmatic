import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import { createDouyinDownloadQueue } from '../../dist-core/sources/douyin-download-queue.js';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function detail(awemeId, mirrors) {
  return {
    awemeId,
    mediaType: 'video',
    description: `Clip ${awemeId}`,
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
          dataSize: null,
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
      capturedAt: 1_758_200_000_000,
    },
    raw: {
      aweme_detail: {
        aweme_id: awemeId,
        video: { bit_rate: [{ gear_name: 'normal_1080_0', play_addr: { url_list: mirrors } }] },
      },
    },
  };
}

/** Permit-counting gate: the queue's fetch can outrun a single reusable gate. */
async function gatedServer(t) {
  const body = Buffer.from('reupmatic-media-bytes');
  let permits = 0;
  const waiters = [];
  function acquire() {
    if (permits > 0) {
      permits -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiters.push(resolve));
  }
  const server = http.createServer(async (_request, response) => {
    await acquire();
    response.writeHead(200, { 'content-type': 'video/mp4' });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    // fetch() keep-alive leaves server.close() waiting on an open socket.
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    body,
    url: `${origin}/ok`,
    open() {
      const waiter = waiters.shift();
      if (waiter) waiter();
      else permits += 1;
    },
  };
}

async function waitFor(queue, predicate, description) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (predicate(queue.snapshot())) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for: ${description}`);
}

async function waitUntilIdle(queue) {
  const deadline = Date.now() + 2000;
  while (queue.processing) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the queue to go idle');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
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
  destinationFor: (item, _tierIndex, directory) => `${directory}/${item.awemeId}.mp4`,
  download: fetchDownload,
  commit: async ({ detail: item }) => ({ id: `content-${item.awemeId}` }),
  now: () => 1_758_200_000_000,
  ...overrides,
});

test('a second enqueue while one item is running appends rather than refusing', async (t) => {
  const server = await gatedServer(t);
  const snapshots = [];
  const queue = createDouyinDownloadQueue(
    baseDeps({
      observe: async (awemeId) => detail(awemeId, [server.url]),
      onProgress: (snapshot) => snapshots.push(snapshot),
    }),
  );

  const first = queue.enqueue([
    { awemeId: '1000000000000000001', tierIndex: 0, directory: '/tmp' },
  ]);
  assert.equal(first.length, 1);
  assert.equal(queue.processing, true, 'enqueue starts the queue synchronously');

  const second = queue.enqueue([
    { awemeId: '1000000000000000002', tierIndex: 0, directory: '/tmp' },
  ]);
  assert.equal(second.length, 1);
  assert.deepEqual(
    queue.snapshot().items.map((item) => item.state),
    ['running', 'queued'],
  );

  server.open(); // lets item 1 finish
  await waitFor(queue, (snap) => snap.items[1]?.state === 'running', 'item 2 to start');
  server.open(); // lets item 2 finish, now that it has actually started

  await waitUntilIdle(queue);

  const final = queue.snapshot();
  assert.deepEqual(
    final.items.map((item) => item.state),
    ['complete', 'complete'],
  );
  assert.ok(
    snapshots.some((snapshot) => snapshot.items.length === 2),
    'the queue-wide snapshot covers both items',
  );
});

test('a duplicate aweme_id already queued or running is not appended twice', async (t) => {
  const server = await gatedServer(t);
  const queue = createDouyinDownloadQueue(
    baseDeps({ observe: async (awemeId) => detail(awemeId, [server.url]) }),
  );
  queue.enqueue([{ awemeId: '1000000000000000003', tierIndex: 0, directory: '/tmp' }]);
  const added = queue.enqueue([
    { awemeId: '1000000000000000003', tierIndex: 0, directory: '/tmp' },
  ]);
  assert.equal(added.length, 0, 'the running item must not be queued a second time');
  assert.equal(queue.snapshot().items.length, 1);
  server.open();
  await waitUntilIdle(queue);
});

test('retrying a failed item replaces its row: one entry per aweme_id, counts not doubled', async () => {
  let attempts = 0;
  const queue = createDouyinDownloadQueue(
    baseDeps({
      observe: async (awemeId) => {
        attempts += 1;
        if (attempts === 1) throw new Error('DOUYIN_REFUSED');
        return detail(awemeId, []);
      },
    }),
  );
  const id = '1000000000000000009';
  queue.enqueue([{ awemeId: id, tierIndex: 0, directory: '/tmp' }]);
  await waitUntilIdle(queue);
  assert.equal(queue.snapshot().items[0].code, 'DOUYIN_REFUSED');

  const added = queue.enqueue([{ awemeId: id, tierIndex: 0, directory: '/tmp' }]);
  assert.equal(added.length, 1, 'a finished failure may be retried');
  const retrying = queue.snapshot();
  assert.equal(retrying.items.filter((item) => item.awemeId === id).length, 1);
  assert.notEqual(retrying.items.find((item) => item.awemeId === id).state, 'failed');
  await waitUntilIdle(queue);
  const final = queue.snapshot();
  assert.equal(final.items.length, 1);
  assert.equal(final.failed, 1);
  assert.equal(final.items[0].code, 'DOUYIN_MEDIA_URL_MISSING');
});

test('an item already held in the Library is deduped at enqueue time via findHeld', async () => {
  const queue = createDouyinDownloadQueue(
    baseDeps({
      findHeld: (awemeId) => (awemeId === '1000000000000000004' ? { id: 'held-1' } : null),
      observe: async () => {
        throw new Error('UNUSED');
      },
    }),
  );
  const added = queue.enqueue([
    { awemeId: '1000000000000000004', tierIndex: 0, directory: '/tmp' },
  ]);
  assert.equal(added.length, 0);
  assert.equal(queue.snapshot().items.length, 0);
});

test('cancel stops the active item and drops the rest of the queue', async (t) => {
  const server = await gatedServer(t);
  const queue = createDouyinDownloadQueue(
    baseDeps({ observe: async (awemeId) => detail(awemeId, [server.url]) }),
  );
  queue.enqueue([
    { awemeId: '1000000000000000005', tierIndex: 0, directory: '/tmp' },
    { awemeId: '1000000000000000006', tierIndex: 0, directory: '/tmp' },
    { awemeId: '1000000000000000007', tierIndex: 0, directory: '/tmp' },
  ]);
  assert.equal(queue.snapshot().items.length, 3);

  queue.cancel();
  server.open(); // let the held transfer's fetch resolve so the run loop can observe cancellation

  await waitUntilIdle(queue);

  assert.equal(
    queue.snapshot().items.length,
    0,
    'cancel clears the whole queue, active item included',
  );
});

test('cancelling an idle queue is a no-op that never poisons the next run', async (t) => {
  const server = await gatedServer(t);
  const queue = createDouyinDownloadQueue(
    baseDeps({ observe: async (awemeId) => detail(awemeId, [server.url]) }),
  );
  queue.cancel(); // nothing running yet
  queue.enqueue([{ awemeId: '1000000000000000008', tierIndex: 0, directory: '/tmp' }]);
  server.open();
  await waitUntilIdle(queue);
  assert.equal(
    queue.snapshot().items[0].state,
    'complete',
    'a stale cancel must not wipe the next enqueue',
  );
});
