import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readPublishingConfig } from '../../dist-node/electron/features/publishing/config.js';
import { ChannelCredentialStore } from '../../dist-node/electron/features/publishing/credential-store.js';
import {
  buildAuthorizationUrl,
  exchangeCodeForUserToken,
  FACEBOOK_REDIRECT_URI,
  listPages,
  readAuthorizationCode,
} from '../../dist-node/electron/features/publishing/oauth.js';
import { PublishRunner } from '../../dist-node/electron/features/publishing/publish-runner.js';

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
    const runner = new PublishRunner({ ...graph, now: () => 1000 });
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
    const runner = new PublishRunner({ ...graph, now: () => 1 });
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
    const runner = new PublishRunner({ ...graph, now: () => 1 });
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

test('publishing config needs both values and an https broker URL', () => {
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
