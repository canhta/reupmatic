import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readPublishingConfig } from '../../dist-node/electron/features/publishing/config.js';
import { ChannelCredentialStore } from '../../dist-node/electron/features/publishing/credential-store.js';
import { FacebookDestination } from '../../dist-node/electron/features/publishing/facebook-adapter.js';
import {
  buildAuthorizationUrl,
  exchangeCodeForUserToken,
  FACEBOOK_REDIRECT_URI,
  listPages,
  readAuthorizationCode,
} from '../../dist-node/electron/features/publishing/oauth.js';
import { PublishingService } from '../../dist-node/electron/features/publishing/publish-service.js';
import { TikTokDestination } from '../../dist-node/electron/features/publishing/tiktok-adapter.js';
import { mapTikTokError } from '../../dist-node/electron/features/publishing/tiktok-api.js';
import {
  buildAuthorizationUrl as buildTikTokAuthorizationUrl,
  createPkcePair,
  exchangeCodeForTokens,
  readAuthorizationCode as readTikTokAuthorizationCode,
  refreshTokens,
} from '../../dist-node/electron/features/publishing/tiktok-oauth.js';

function fakeEncryption({ available = true } = {}) {
  const KEY = 0x5a;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => {
      const bytes = Buffer.from(value, 'utf-8');
      for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= KEY;
      return Buffer.concat([Buffer.from('fake:'), bytes]);
    },
    decryptString: (value) => {
      const bytes = Buffer.from(value.subarray(5));
      for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= KEY;
      return bytes.toString('utf-8');
    },
  };
}

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), 'reupmatic-publishing-'));
}

test('channel credentials stay encrypted and only display data leaves the store', async () => {
  const directory = await tempDir();
  const store = new ChannelCredentialStore(directory, fakeEncryption());
  await store.load();
  const secret = 'page-token-do-not-leak';
  const account = await store.save('channel_001', {
    account_id: '111222333',
    account_name: 'My Page',
    access_token: secret,
  });
  assert.deepEqual(account, {
    channel_id: 'channel_001',
    account_id: '111222333',
    account_name: 'My Page',
    connected_at: account.connected_at,
  });
  assert.deepEqual(store.accounts(), {
    channel_001: { connection: 'connected', account_name: 'My Page' },
  });
  assert.deepEqual(await store.credentials('channel_001'), {
    account_id: '111222333',
    access_token: secret,
  });
  assert.ok(!JSON.stringify(account).includes(secret));
  assert.ok(!JSON.stringify(store.accounts()).includes(secret));
  const index = await readFile(path.join(directory, 'channels.json'), 'utf-8');
  assert.ok(!index.includes(secret));
  const tokenFile = (await readdir(directory)).find((name) => name.endsWith('.token'));
  assert.ok(tokenFile);
  assert.ok(!(await readFile(path.join(directory, tokenFile))).toString('latin1').includes(secret));

  await store.markReauthorize('channel_001');
  assert.deepEqual(store.accounts(), {
    channel_001: { connection: 'reauthorize', account_name: 'My Page' },
  });
  const reloaded = new ChannelCredentialStore(directory, fakeEncryption());
  await reloaded.load();
  assert.deepEqual(reloaded.accounts(), {
    channel_001: { connection: 'reauthorize', account_name: 'My Page' },
  });
  await reloaded.remove('channel_001');
  assert.deepEqual(reloaded.accounts(), {});
  assert.equal(await reloaded.credentials('channel_001'), undefined);
  await rm(directory, { recursive: true, force: true });
});

test('missing OS encryption refuses plainly and writes nothing', async () => {
  const directory = await tempDir();
  const store = new ChannelCredentialStore(directory, fakeEncryption({ available: false }));
  await assert.rejects(
    store.save('channel_001', { account_id: '1', account_name: 'x', access_token: 'tok' }),
    /CREDENTIAL_ENCRYPTION_UNAVAILABLE/,
  );
  assert.deepEqual(await readdir(directory).catch(() => []), []);
  await rm(directory, { recursive: true, force: true });
});

const POST = {
  id: 'post_0001',
  revision: 1,
  created_at: 0,
  updated_at: 0,
  title: 'My title',
  body: 'My body #hashtag',
  channel: { id: 'channel_001', name: 'My Page', platform: 'facebook_page' },
  export: {
    library_id: 'library_001',
    link_id: 'export_001',
    name: 'video.mp4',
    path: '',
    sha256: 'a'.repeat(64),
  },
  links: [{ id: 'affiliate_001', name: 'Promo', url: 'https://shop.example/x' }],
  planned: null,
  state: 'draft',
  publication: null,
};

async function fakeGraph(routes) {
  const seen = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const record = {
        method: request.method,
        path: url.pathname,
        headers: request.headers,
        params: new URLSearchParams(body.toString('utf-8')),
        body_bytes: body.length,
        raw: body,
      };
      seen.push(record);
      const handler = routes.find((route) => route.match(record));
      if (!handler) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'no route' } }));
        return;
      }
      const reply = handler.reply?.(record) ?? { body: { success: true } };
      response.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    seen,
    graphBaseUrl: `http://127.0.0.1:${port}`,
    uploadBaseUrl: `http://127.0.0.1:${port}/upload`,
    close: () => {
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function makeRunner(graph, now = () => 1) {
  return new PublishingService({
    now,
    destinationFor: (_platform, credentials) =>
      new FacebookDestination({
        pageId: credentials.account_id,
        accessToken: credentials.access_token,
        graphBaseUrl: graph.graphBaseUrl,
        uploadBaseUrl: graph.uploadBaseUrl,
      }),
  });
}

test('a Reel is uploaded and published: reference and phases persist before the calls that need them', async () => {
  const directory = await tempDir();
  const file = path.join(directory, 'video.mp4');
  const bytes = Buffer.from('video-bytes');
  await writeFile(file, bytes);
  const graph = await fakeGraph([
    {
      match: (r) =>
        r.method === 'POST' &&
        r.path.endsWith('/video_reels') &&
        r.params.get('upload_phase') === 'start',
      reply: () => ({ body: { video_id: 'vid1' } }),
    },
    { match: (r) => r.method === 'POST' && r.path === '/upload/v25.0/vid1' },
    {
      match: (r) =>
        r.method === 'POST' &&
        r.path.endsWith('/video_reels') &&
        r.params.get('upload_phase') === 'finish',
      reply: () => ({ body: { success: true } }),
    },
  ]);
  try {
    const persisted = [];
    const progress = [];
    const runner = makeRunner(graph, () => 1000);
    const publication = await runner.publish({
      post: { ...POST, export: { ...POST.export, path: file } },
      attempt_id: 'attempt_0001',
      credentials: { account_id: '111222333', access_token: 'page-token' },
      media: { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: bytes.length },
      persist: (value) => persisted.push(value),
      onProgress: (fraction) => progress.push(fraction),
    });
    assert.equal(publication.phase, 'published');
    assert.equal(publication.remote_ref, 'vid1');
    assert.equal(publication.remote_post_id, 'vid1');
    assert.deepEqual(
      persisted.map((value) => value.phase),
      ['uploading', 'submitted', 'published'],
    );
    assert.equal(persisted[0].remote_ref, 'vid1', 'remote_ref is persisted before upload');
    const upload = graph.seen.find((r) => r.path === '/upload/v25.0/vid1');
    assert.equal(upload.headers.authorization, 'OAuth page-token');
    assert.equal(upload.headers.offset, '0');
    assert.equal(upload.headers.file_size, String(bytes.length));
    assert.equal(upload.body_bytes, bytes.length);
    assert.ok(progress.length > 0 && progress.at(-1) === 1);
    const finish = graph.seen.find(
      (r) => r.path.endsWith('/video_reels') && r.params.get('upload_phase') === 'finish',
    );
    assert.equal(finish.params.get('video_state'), 'PUBLISHED');
    assert.equal(finish.params.get('description'), 'My body #hashtag\nhttps://shop.example/x');
    assert.equal(finish.params.get('title'), 'My title');
  } finally {
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a planned Reel uses SCHEDULED with the planned instant; Graph refusals map to named codes', async () => {
  const directory = await tempDir();
  const file = path.join(directory, 'video.mp4');
  await writeFile(file, Buffer.from('bytes'));
  const plan = { instant: 1_800_000_000_000, timezone: 'UTC' };
  const graph = await fakeGraph([
    {
      match: (r) => r.method === 'POST' && r.params.get('upload_phase') === 'start',
      reply: () => ({ body: { video_id: 'vid2' } }),
    },
    { match: (r) => r.method === 'POST' && r.path === '/upload/v25.0/vid2' },
    {
      match: (r) => r.method === 'POST' && r.params.get('upload_phase') === 'finish',
      reply: () => ({ status: 400, body: { error: { code: 190, message: 'expired' } } }),
    },
  ]);
  try {
    const runner = makeRunner(graph, () => 1);
    const publication = await runner.publish({
      post: { ...POST, planned: plan, export: { ...POST.export, path: file } },
      attempt_id: 'attempt_0002',
      credentials: { account_id: '111222333', access_token: 'token' },
      media: { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: 5 },
      persist: () => undefined,
      onProgress: () => undefined,
    });
    assert.equal(publication.phase, 'failed');
    assert.equal(publication.error, 'CHANNEL_REAUTHORIZE');
    const finish = graph.seen.find((r) => r.params.get('upload_phase') === 'finish');
    assert.equal(finish.params.get('video_state'), 'SCHEDULED');
    assert.equal(
      finish.params.get('scheduled_publish_time'),
      String(Math.floor(plan.instant / 1000)),
    );
  } finally {
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rate limiting maps to PUBLISH_RATE_LIMITED and reconcile resolves a submitted post', async () => {
  const directory = await tempDir();
  const file = path.join(directory, 'video.mp4');
  await writeFile(file, Buffer.from('bytes'));
  const graph = await fakeGraph([
    {
      match: (r) => r.method === 'POST' && r.params.get('upload_phase') === 'start',
      reply: () => ({ body: { video_id: 'vid3' } }),
    },
    { match: (r) => r.method === 'POST' && r.path === '/upload/v25.0/vid3' },
    {
      match: (r) => r.method === 'POST' && r.params.get('upload_phase') === 'finish',
      reply: () => ({ status: 400, body: { error: { code: 32, message: 'throttled' } } }),
    },
    {
      match: (r) => r.method === 'GET' && r.path === '/v25.0/vid3',
      reply: () => ({ body: { status: { publish_status: 'published' } } }),
    },
  ]);
  try {
    const runner = makeRunner(graph, () => 1);
    const failed = await runner.publish({
      post: { ...POST, export: { ...POST.export, path: file } },
      attempt_id: 'attempt_0003',
      credentials: { account_id: '111222333', access_token: 'token' },
      media: { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: 5 },
      persist: () => undefined,
      onProgress: () => undefined,
    });
    assert.equal(failed.phase, 'failed');
    assert.equal(failed.error, 'PUBLISH_RATE_LIMITED');

    const submitted = {
      ...POST,
      publication: {
        attempt_id: 'attempt_0004',
        phase: 'submitted',
        remote_ref: 'vid3',
        remote_post_id: null,
        remote_url: null,
        scheduled_for: null,
        error: null,
        updated_at: 1,
      },
    };
    const persisted = [];
    const reconciled = await runner.reconcile({
      post: submitted,
      credentials: { account_id: '111222333', access_token: 'token' },
      persist: (value) => persisted.push(value),
    });
    assert.equal(reconciled.phase, 'published');
    assert.equal(persisted.length, 1);
  } finally {
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('OAuth helpers build the login URL and reject a mismatched state or denied login', () => {
  const url = buildAuthorizationUrl({ appId: 'app-1', state: 'state-1' });
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://www.facebook.com');
  assert.equal(parsed.searchParams.get('client_id'), 'app-1');
  assert.equal(parsed.searchParams.get('state'), 'state-1');
  assert.equal(parsed.searchParams.get('redirect_uri'), FACEBOOK_REDIRECT_URI);
  assert.match(parsed.searchParams.get('scope'), /pages_manage_posts/);

  assert.equal(
    readAuthorizationCode(`${FACEBOOK_REDIRECT_URI}?code=abc&state=state-1`, 'state-1'),
    'abc',
  );
  assert.throws(
    () => readAuthorizationCode(`${FACEBOOK_REDIRECT_URI}?code=abc&state=other`, 'state-1'),
    /CHANNEL_AUTHORIZE_STATE/,
  );
  assert.throws(
    () =>
      readAuthorizationCode(
        `${FACEBOOK_REDIRECT_URI}?error=access_denied&state=state-1`,
        'state-1',
      ),
    /CHANNEL_AUTHORIZE_DENIED/,
  );
  assert.throws(
    () => readAuthorizationCode('https://evil.example/x', 'state-1'),
    /CHANNEL_AUTHORIZE_FAILED/,
  );
});

test('the broker exchange and page listing use the faked endpoints and never log a token', async () => {
  const userToken = 'user-long-lived-token';
  const pageToken = 'page-token-value';
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'POST' && url.pathname === '/api/facebook/token') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ access_token: userToken }));
      return;
    }
    if (url.pathname === '/v25.0/me/accounts') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ data: [{ id: '111222333', name: 'My Page', access_token: pageToken }] }),
      );
      return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const logs = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  for (const key of Object.keys(originals)) console[key] = (...args) => logs.push(args.join(' '));
  try {
    assert.equal(await exchangeCodeForUserToken('code-1', `${base}/api/facebook/token`), userToken);
    const pages = await listPages(userToken, base);
    assert.deepEqual(pages, [{ id: '111222333', name: 'My Page', access_token: pageToken }]);
    assert.ok(!logs.some((line) => line.includes(userToken) || line.includes(pageToken)));
  } finally {
    for (const [key, fn] of Object.entries(originals)) console[key] = fn;
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test('publishing config falls back to the environment when no build config is baked in', () => {
  assert.equal(readPublishingConfig({}), null);
  assert.equal(readPublishingConfig({ REUPMATIC_META_APP_ID: '1' }), null);
  assert.equal(
    readPublishingConfig({
      REUPMATIC_META_APP_ID: '1',
      REUPMATIC_META_BROKER_URL: 'http://x/token',
    }),
    null,
  );
  assert.deepEqual(
    readPublishingConfig({
      REUPMATIC_META_APP_ID: '1',
      REUPMATIC_META_BROKER_URL: 'https://x.example/api/facebook/token/',
    }),
    { metaAppId: '1', brokerUrl: 'https://x.example/api/facebook/token' },
  );
});

test('a publish refuses a new attempt before begin touches the platform', async () => {
  const graph = await fakeGraph([
    {
      match: (r) => r.path.endsWith('/video_reels'),
      reply: () => ({ body: { video_id: 'should-not-happen' } }),
    },
  ]);
  try {
    const runner = makeRunner(graph, () => 1);
    const submitted = {
      ...POST,
      export: { ...POST.export, path: '/nonexistent' },
      publication: {
        attempt_id: 'attempt_0009',
        phase: 'submitted',
        remote_ref: 'v',
        remote_post_id: null,
        remote_url: null,
        scheduled_for: null,
        error: null,
        updated_at: 1,
      },
    };
    await assert.rejects(
      runner.publish({
        post: submitted,
        attempt_id: 'attempt_0010',
        credentials: { account_id: '1', access_token: 't' },
        media: { duration_ms: 1_000, width: 540, height: 960, size_bytes: 1 },
        persist: () => undefined,
        onProgress: () => undefined,
      }),
      /PUBLICATION_ALREADY_ATTEMPTED/,
    );
    assert.equal(graph.seen.length, 0, 'no request reaches the platform');
  } finally {
    await graph.close();
  }
});

test('two concurrent publishes of one post create exactly one Reel', async () => {
  const directory = await tempDir();
  const file = path.join(directory, 'video.mp4');
  const bytes = Buffer.from('race-video-bytes');
  await writeFile(file, bytes);
  const graph = await fakeGraph([
    {
      match: (r) =>
        r.method === 'POST' &&
        r.path.endsWith('/video_reels') &&
        r.params.get('upload_phase') === 'start',
      reply: () => ({ body: { video_id: 'vid-race' } }),
    },
    { match: (r) => r.method === 'POST' && r.path === '/upload/v25.0/vid-race' },
    {
      match: (r) =>
        r.method === 'POST' &&
        r.path.endsWith('/video_reels') &&
        r.params.get('upload_phase') === 'finish',
      reply: () => ({ body: { success: true } }),
    },
  ]);
  try {
    const runner = makeRunner(graph, () => 1);
    const base = {
      post: { ...POST, export: { ...POST.export, path: file } },
      credentials: { account_id: '1', access_token: 't' },
      media: { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: bytes.length },
      persist: () => undefined,
      onProgress: () => undefined,
    };
    const results = await Promise.allSettled([
      runner.publish({ ...base, attempt_id: 'race_0001' }),
      runner.publish({ ...base, attempt_id: 'race_0002' }),
    ]);
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0].reason?.message), /PUBLISH_IN_PROGRESS/);
    assert.equal(graph.seen.filter((r) => r.params.get('upload_phase') === 'start').length, 1);
    assert.equal(graph.seen.filter((r) => r.params.get('upload_phase') === 'finish').length, 1);
  } finally {
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('only a definite Graph refusal after finish is failed; everything else is unknown', async () => {
  const scenarios = [
    {
      label: '500 gateway',
      reply: { status: 500, body: {} },
      phase: 'unknown',
      error: 'PUBLISH_FAILED',
    },
    {
      label: 'unmapped 400',
      reply: { status: 400, body: { error: { code: 999, message: 'weird' } } },
      phase: 'unknown',
      error: 'PUBLISH_FAILED',
    },
    {
      label: 'refusal 100',
      reply: { status: 400, body: { error: { code: 100, message: 'bad param' } } },
      phase: 'failed',
      error: 'PUBLISH_INVALID_REQUEST',
    },
    {
      label: 'refusal 190',
      reply: { status: 400, body: { error: { code: 190, message: 'expired' } } },
      phase: 'failed',
      error: 'CHANNEL_REAUTHORIZE',
    },
  ];
  for (const scenario of scenarios) {
    const directory = await tempDir();
    const file = path.join(directory, 'video.mp4');
    await writeFile(file, Buffer.from('bytes'));
    const graph = await fakeGraph([
      {
        match: (r) => r.method === 'POST' && r.params.get('upload_phase') === 'start',
        reply: () => ({ body: { video_id: 'vid-finish' } }),
      },
      { match: (r) => r.method === 'POST' && r.path === '/upload/v25.0/vid-finish' },
      {
        match: (r) => r.method === 'POST' && r.params.get('upload_phase') === 'finish',
        reply: () => scenario.reply,
      },
    ]);
    try {
      const runner = makeRunner(graph, () => 1);
      const publication = await runner.publish({
        post: { ...POST, export: { ...POST.export, path: file } },
        attempt_id: 'attempt_finish',
        credentials: { account_id: '1', access_token: 't' },
        media: { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: 5 },
        persist: () => undefined,
        onProgress: () => undefined,
      });
      assert.equal(publication.phase, scenario.phase, scenario.label);
      assert.equal(publication.error, scenario.error, scenario.label);
    } finally {
      await graph.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('a stuck uploading post reconciles to failed so the user can retry', async () => {
  const graph = await fakeGraph([
    {
      match: (r) => r.method === 'GET' && r.path === '/v25.0/vid-stuck',
      reply: () => ({ body: { status: { publish_status: 'processing' } } }),
    },
  ]);
  try {
    const runner = makeRunner(graph, () => 10);
    const uploading = {
      ...POST,
      publication: {
        attempt_id: 'attempt_stuck',
        phase: 'uploading',
        remote_ref: 'vid-stuck',
        remote_post_id: null,
        remote_url: null,
        scheduled_for: null,
        error: null,
        updated_at: 1,
      },
    };
    const persisted = [];
    const result = await runner.reconcile({
      post: uploading,
      credentials: { account_id: '1', access_token: 't' },
      persist: (value) => persisted.push(value),
    });
    assert.equal(result.phase, 'failed');
    assert.equal(result.error, 'PUBLISH_UPLOAD_INTERRUPTED');
    assert.equal(persisted.length, 1);
  } finally {
    await graph.close();
  }
});

test('an uploading post the platform reports published resolves to published', async () => {
  const graph = await fakeGraph([
    {
      match: (r) => r.method === 'GET' && r.path === '/v25.0/vid-late',
      reply: () => ({ body: { status: { publish_status: 'published' } } }),
    },
  ]);
  try {
    const runner = makeRunner(graph, () => 10);
    const uploading = {
      ...POST,
      publication: {
        attempt_id: 'attempt_late',
        phase: 'uploading',
        remote_ref: 'vid-late',
        remote_post_id: null,
        remote_url: null,
        scheduled_for: null,
        error: null,
        updated_at: 1,
      },
    };
    const result = await runner.reconcile({
      post: uploading,
      credentials: { account_id: '1', access_token: 't' },
      persist: () => undefined,
    });
    assert.equal(result.phase, 'published');
    assert.equal(result.remote_ref, 'vid-late');
  } finally {
    await graph.close();
  }
});

// --- TikTok Direct Post ---

const TT_OPTIONS = {
  privacy_level: 'PUBLIC_TO_EVERYONE',
  allow_comment: false,
  allow_duet: false,
  allow_stitch: false,
  disclose: false,
  brand_content_toggle: false,
  brand_organic_toggle: false,
  is_aigc: true,
};

const TT_POST = {
  ...POST,
  id: 'post_tt_01',
  channel: { id: 'channel_tt_01', name: 'TikTok', platform: 'tiktok' },
  links: [],
  options: { youtube: null, tiktok: { ...TT_OPTIONS } },
};

const TT_MEDIA = { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: 11, fps: 30 };

async function fakeTikTok(routes) {
  const seen = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const record = {
        method: request.method,
        path: url.pathname,
        headers: request.headers,
        params: new URLSearchParams(body.toString('utf-8')),
        json: (() => {
          try {
            return JSON.parse(body.toString('utf-8'));
          } catch {
            return null;
          }
        })(),
        body_bytes: body.length,
      };
      seen.push(record);
      const handler = routes.find((route) => route.match(record));
      if (!handler) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'not_found' } }));
        return;
      }
      const localBase = `http://127.0.0.1:${server.address().port}`;
      const reply = handler.reply?.(record, localBase) ?? {
        body: { data: {}, error: { code: 'ok' } },
      };
      response.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    seen,
    base: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

const ttCreatorInfo = (overrides = {}) => ({
  body: {
    data: {
      creator_nickname: 'Creator Nickname',
      privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
      comment_disabled: false,
      duet_disabled: false,
      stitch_disabled: false,
      max_video_post_duration_sec: 600,
      ...overrides,
    },
    error: { code: 'ok' },
  },
});

const ttInit = (id, url) => ({
  body: { data: { publish_id: id, upload_url: url }, error: { code: 'ok' } },
});

function tiktokService(base, now = () => 1000) {
  return new PublishingService({
    now,
    destinationFor: (_platform, credentials, media) =>
      new TikTokDestination({
        accessToken: credentials.access_token,
        videoSizeBytes: media?.size_bytes ?? 0,
        ...(media ? { videoDurationMs: media.duration_ms } : {}),
        baseUrl: base,
      }),
  });
}

test('a TikTok post uploads and publishes: publish_id persists before chunks, post_info is the caption', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'reupmatic-tiktok-'));
  const file = path.join(directory, 'video.mp4');
  const bytes = Buffer.from('video-bytes');
  await writeFile(file, bytes);
  const graph = await fakeTikTok([
    {
      match: (r) => r.path === '/v2/post/publish/creator_info/query/',
      reply: () => ttCreatorInfo(),
    },
    {
      match: (r) => r.path === '/v2/post/publish/video/init/',
      reply: (_r, base) => ttInit('pub_1', `${base}/put`),
    },
    { match: (r) => r.method === 'PUT' && r.path === '/put', reply: () => ({ body: {} }) },
    {
      match: (r) => r.path === '/v2/post/publish/status/fetch/',
      reply: () => ({
        body: {
          data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: '7401' },
          error: { code: 'ok' },
        },
      }),
    },
  ]);
  try {
    const persisted = [];
    const progress = [];
    const publication = await tiktokService(graph.base).publish({
      post: { ...TT_POST, export: { ...TT_POST.export, path: file } },
      attempt_id: 'attempt_tt_01',
      credentials: { account_id: 'open-id-1', access_token: 'access-token' },
      media: { ...TT_MEDIA, size_bytes: bytes.length },
      persist: (value) => persisted.push(value),
      onProgress: (fraction) => progress.push(fraction),
    });
    assert.equal(publication.phase, 'published');
    assert.equal(publication.remote_ref, 'pub_1');
    assert.equal(publication.remote_post_id, '7401');
    assert.equal(publication.privacy, 'public');
    assert.deepEqual(
      persisted.map((value) => value.phase),
      ['uploading', 'submitted', 'published'],
    );
    assert.equal(persisted[0].remote_ref, 'pub_1');
    const init = graph.seen.find((r) => r.path === '/v2/post/publish/video/init/');
    assert.equal(init.headers.authorization, 'Bearer access-token');
    assert.equal(init.json.post_info.title, 'My body #hashtag');
    assert.equal(init.json.post_info.privacy_level, 'PUBLIC_TO_EVERYONE');
    assert.equal(init.json.post_info.disable_comment, true);
    assert.equal(init.json.source_info.source, 'FILE_UPLOAD');
    const upload = graph.seen.find((r) => r.method === 'PUT');
    assert.equal(upload.headers['content-range'], `bytes 0-${bytes.length - 1}/${bytes.length}`);
    assert.equal(upload.headers['content-type'], 'video/mp4');
    assert.ok(progress.at(-1) === 1);
  } finally {
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing or disallowed TikTok options are refused before anything is persisted', async () => {
  const graph = await fakeTikTok([
    {
      match: (r) => r.path === '/v2/post/publish/creator_info/query/',
      reply: () => ttCreatorInfo(),
    },
  ]);
  try {
    await assert.rejects(
      tiktokService(graph.base).publish({
        post: { ...TT_POST, options: { youtube: null, tiktok: null } },
        attempt_id: 'attempt_tt_02',
        credentials: { account_id: 'open-id-1', access_token: 'token' },
        media: TT_MEDIA,
        persist: () => assert.fail('nothing should be persisted'),
        onProgress: () => undefined,
      }),
      /PUBLISH_OPTIONS_REQUIRED/,
    );
    await assert.rejects(
      tiktokService(graph.base).publish({
        post: {
          ...TT_POST,
          options: {
            youtube: null,
            tiktok: { ...TT_OPTIONS, privacy_level: 'MUTUAL_FOLLOW_FRIENDS' },
          },
        },
        attempt_id: 'attempt_tt_03',
        credentials: { account_id: 'open-id-1', access_token: 'token' },
        media: TT_MEDIA,
        persist: () => assert.fail('nothing should be persisted'),
        onProgress: () => undefined,
      }),
      /PUBLISH_OPTIONS_INVALID/,
    );
    assert.equal(graph.seen.filter((r) => r.path === '/v2/post/publish/video/init/').length, 0);
  } finally {
    await graph.close();
  }
});

test('TikTok upload semantics: a 4xx before the first chunk is failed, a 5xx after is unknown', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'reupmatic-tiktok-'));
  const file = path.join(directory, 'video.mp4');
  await writeFile(file, Buffer.from('video-bytes'));
  const uploadStatus = 429;
  const graph = await fakeTikTok([
    {
      match: (r) => r.path === '/v2/post/publish/creator_info/query/',
      reply: () => ttCreatorInfo(),
    },
    {
      match: (r) => r.path === '/v2/post/publish/video/init/',
      reply: (_r, base) => ttInit('pub_2', `${base}/put`),
    },
    {
      match: (r) => r.method === 'PUT',
      reply: () => ({
        status: uploadStatus,
        body: { error: { code: 'spam_risk_too_many_posts' } },
      }),
    },
  ]);
  try {
    const persisted = [];
    await assert.rejects(
      tiktokService(graph.base).publish({
        post: { ...TT_POST, export: { ...TT_POST.export, path: file } },
        attempt_id: 'attempt_tt_04',
        credentials: { account_id: 'open-id-1', access_token: 'token' },
        media: { ...TT_MEDIA, size_bytes: 11 },
        persist: (value) => persisted.push(value),
        onProgress: () => undefined,
      }),
      /PUBLISH_RATE_LIMITED/,
    );
    assert.deepEqual(
      persisted.map((value) => value.phase),
      ['uploading', 'failed'],
    );
    assert.equal(persisted[1].error, 'PUBLISH_RATE_LIMITED');
  } finally {
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }

  const directory2 = await mkdtemp(path.join(tmpdir(), 'reupmatic-tiktok-'));
  const file2 = path.join(directory2, 'video.mp4');
  await writeFile(file2, Buffer.from('video-bytes'));
  const graph2 = await fakeTikTok([
    {
      match: (r) => r.path === '/v2/post/publish/creator_info/query/',
      reply: () => ttCreatorInfo(),
    },
    {
      match: (r) => r.path === '/v2/post/publish/video/init/',
      reply: (_r, base) => ttInit('pub_3', `${base}/put`),
    },
    { match: (r) => r.method === 'PUT', reply: () => ({ status: 503, body: {} }) },
  ]);
  try {
    const persisted = [];
    const unknown = await tiktokService(graph2.base).publish({
      post: { ...TT_POST, export: { ...TT_POST.export, path: file2 } },
      attempt_id: 'attempt_tt_05',
      credentials: { account_id: 'open-id-1', access_token: 'token' },
      media: { ...TT_MEDIA, size_bytes: 11 },
      persist: (value) => persisted.push(value),
      onProgress: () => undefined,
    });
    assert.equal(unknown.phase, 'unknown');
    assert.deepEqual(
      persisted.map((value) => value.phase),
      ['uploading', 'unknown'],
    );
  } finally {
    await graph2.close();
    await rm(directory2, { recursive: true, force: true });
  }
});

test('a failed TikTok status maps fail_reason, and reconcile resolves processing and interruption', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'reupmatic-tiktok-'));
  const file = path.join(directory, 'video.mp4');
  await writeFile(file, Buffer.from('video-bytes'));
  const graph = await fakeTikTok([
    {
      match: (r) => r.path === '/v2/post/publish/creator_info/query/',
      reply: () => ttCreatorInfo(),
    },
    {
      match: (r) => r.path === '/v2/post/publish/video/init/',
      reply: (_r, base) => ttInit('pub_4', `${base}/put`),
    },
    { match: (r) => r.method === 'PUT', reply: () => ({ body: {} }) },
    {
      match: (r) => r.path === '/v2/post/publish/status/fetch/',
      reply: (r) => ({
        body:
          r.json.publish_id === 'pub_4'
            ? {
                data: { status: 'FAILED', fail_reason: 'duration_check_failed' },
                error: { code: 'ok' },
              }
            : { data: { status: 'PROCESSING_UPLOAD' }, error: { code: 'ok' } },
      }),
    },
  ]);
  try {
    const failed = await tiktokService(graph.base).publish({
      post: { ...TT_POST, export: { ...TT_POST.export, path: file } },
      attempt_id: 'attempt_tt_06',
      credentials: { account_id: 'open-id-1', access_token: 'token' },
      media: { ...TT_MEDIA, size_bytes: 11 },
      persist: () => undefined,
      onProgress: () => undefined,
    });
    assert.equal(failed.phase, 'failed');
    assert.equal(failed.error, 'PUBLISH_MEDIA_TOO_LONG');

    const submitted = {
      ...TT_POST,
      publication: {
        attempt_id: 'attempt_tt_07',
        phase: 'submitted',
        remote_ref: 'pub_5',
        remote_post_id: null,
        remote_url: null,
        scheduled_for: null,
        privacy: null,
        error: null,
        updated_at: 1,
      },
    };
    const processing = await tiktokService(graph.base).reconcile({
      post: submitted,
      credentials: { account_id: 'open-id-1', access_token: 'token' },
      persist: () => undefined,
    });
    assert.equal(processing.phase, 'submitted');

    const uploading = {
      ...submitted,
      publication: { ...submitted.publication, phase: 'uploading', remote_ref: 'pub_5' },
    };
    const interrupted = await tiktokService(graph.base).reconcile({
      post: uploading,
      credentials: { account_id: 'open-id-1', access_token: 'token' },
      persist: () => undefined,
    });
    assert.equal(interrupted.phase, 'failed');
    assert.equal(interrupted.error, 'PUBLISH_UPLOAD_INTERRUPTED');
  } finally {
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('TikTok token errors map to named codes', () => {
  assert.equal(mapTikTokError('access_token_expired'), 'CHANNEL_REAUTHORIZE');
  assert.equal(mapTikTokError('spam_risk_too_many_posts'), 'PUBLISH_RATE_LIMITED');
  assert.equal(mapTikTokError('unaudited_client_cannot_post'), 'PUBLISH_PERMISSION_DENIED');
  assert.equal(mapTikTokError(undefined), 'PUBLISH_FAILED');
});

test('TikTok OAuth builds the PKCE URL and the broker exchange uses the verifier', async () => {
  const pkce = createPkcePair();
  assert.match(pkce.code_verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
  const url = buildTikTokAuthorizationUrl({
    clientKey: 'client-key',
    state: 'state-1',
    redirectUri: 'https://app.example/tiktok/callback',
    codeChallenge: pkce.code_challenge,
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://www.tiktok.com');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    readTikTokAuthorizationCode(
      'https://app.example/tiktok/callback?code=abc&state=state-1',
      'state-1',
      'https://app.example/tiktok/callback',
    ),
    'abc',
  );
  assert.throws(
    () =>
      readTikTokAuthorizationCode(
        'https://app.example/tiktok/callback?code=abc&state=other',
        'state-1',
        'https://app.example/tiktok/callback',
      ),
    /CHANNEL_AUTHORIZE_STATE/,
  );

  const tokens = {
    access_token: 'access',
    refresh_token: 'refresh',
    open_id: 'open',
    expires_in: 86_400,
    refresh_expires_in: 31_536_000,
  };
  const broker = await fakeTikTok([
    {
      match: (r) => r.method === 'POST' && r.path === '/api/tiktok/token',
      reply: () => ({ body: { tokens } }),
    },
  ]);
  try {
    const exchanged = await exchangeCodeForTokens(
      {
        code: 'code-1',
        codeVerifier: pkce.code_verifier,
        redirectUri: 'https://app.example/tiktok/callback',
      },
      `${broker.base}/api/tiktok/token`,
    );
    assert.equal(exchanged.access_token, 'access');
    assert.equal(broker.seen[0].json.action, 'exchange');
    assert.deepEqual(await refreshTokens('refresh', `${broker.base}/api/tiktok/token`), tokens);
  } finally {
    await broker.close();
  }
});
