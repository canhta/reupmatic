import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startAttempt } from '../../dist-core/distribution/publishing/publication.js';
import { YOUTUBE_CAPABILITIES } from '../../dist-core/distribution/publishing/youtube.js';
import {
  requireGoogleClientId,
  requireMeta,
} from '../../dist-node/electron/features/publishing/config.js';
import { ChannelCredentialStore } from '../../dist-node/electron/features/publishing/credential-store.js';
import { publishingDiagnostics } from '../../dist-node/electron/features/publishing/diagnostics.js';
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  refreshAccessToken,
  startLoopbackServer,
} from '../../dist-node/electron/features/publishing/oauth-loopback.js';
import { PublishingService } from '../../dist-node/electron/features/publishing/publish-service.js';
import {
  isDefiniteRefusal,
  publishError,
} from '../../dist-node/electron/features/publishing/publishing-error.js';
import { YouTubeDestination } from '../../dist-node/electron/features/publishing/youtube-adapter.js';

const ACCESS_SECRET = 'ya29-access-should-never-be-logged';
const REFRESH_SECRET = '1//refresh-should-never-be-logged';

async function startServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function withTempDir(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publishing-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function fakeEncryption({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`enc:${Buffer.from(value).toString('base64')}`),
    decryptString: (buffer) =>
      Buffer.from(buffer.toString().replace(/^enc:/, ''), 'base64').toString('utf8'),
  };
}

function postFixture(videoPath, overrides = {}) {
  return {
    id: 'post_0001',
    revision: 1,
    created_at: 0,
    updated_at: 0,
    title: 'Tiếng Việt',
    body: 'Nội dung',
    channel: { id: 'channel_0001', name: 'Kênh thử', platform: 'youtube' },
    export: {
      library_id: 'library_0001',
      link_id: 'export_0001',
      name: 'v.mp4',
      path: videoPath,
      sha256: 'a'.repeat(64),
    },
    links: [],
    planned: null,
    options: {
      youtube: { self_declared_made_for_kids: false, contains_synthetic_media: false },
    },
    state: 'draft',
    publication: null,
    ...overrides,
  };
}

test('build config names a missing id instead of guessing a default', () => {
  assert.equal(requireGoogleClientId({ googleClientId: ' gid ' }), 'gid');
  assert.throws(() => requireGoogleClientId({}), /PUBLISH_CONFIG_MISSING/);
  assert.throws(() => requireGoogleClientId(null), /PUBLISH_CONFIG_MISSING/);
  assert.deepEqual(requireMeta({ metaAppId: '1', brokerUrl: 'https://x/y' }), {
    metaAppId: '1',
    brokerUrl: 'https://x/y',
  });
  assert.throws(() => requireMeta({ metaAppId: '1' }), /PUBLISHING_NOT_CONFIGURED/);
  assert.throws(() => requireMeta(null), /PUBLISHING_NOT_CONFIGURED/);
});

test('PKCE is S256 and the authorize URL carries the installed-app parameters', () => {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  const url = new URL(
    buildAuthorizeUrl({
      clientId: 'cid',
      redirectUri: 'http://127.0.0.1:5555',
      challenge,
      state: 'state-1',
    }),
  );
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge'), challenge);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.upload');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:5555');
});

test('the loopback server validates state and closes after the single callback', async () => {
  const server = await startLoopbackServer('state-1');
  assert.match(server.redirectUri, /^http:\/\/127\.0\.0\.1:\d+$/);
  const pending = server.waitForCode();
  const response = await fetch(`${server.redirectUri}/?code=abc&state=state-1`);
  assert.equal(response.status, 200);
  assert.equal(await pending, 'abc');
  await assert.rejects(() => fetch(`${server.redirectUri}/?code=def&state=state-1`));

  const mismatched = await startLoopbackServer('expected');
  const caught = mismatched.waitForCode().catch((error) => error);
  await fetch(`${mismatched.redirectUri}/?code=abc&state=wrong`);
  assert.match((await caught).message, /CHANNEL_AUTHORIZE_FAILED/);
  mismatched.close();
});

test('token exchange reads the token response and maps invalid_grant to reauthorize', async (t) => {
  const server = await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }));
  });
  t.after(() => server.close());
  const tokens = await exchangeAuthorizationCode({
    clientId: 'cid',
    code: 'code',
    verifier: 'verifier',
    redirectUri: 'http://127.0.0.1:1',
    tokenEndpoint: `${server.origin}/token`,
    now: 1000,
  });
  assert.equal(tokens.access_token, 'at');
  assert.equal(tokens.refresh_token, 'rt');
  assert.equal(tokens.expires_at, 1000 + 3_600_000);

  const refused = await startServer((_request, response) => {
    response.statusCode = 400;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: 'invalid_grant' }));
  });
  t.after(() => refused.close());
  await assert.rejects(
    refreshAccessToken({
      clientId: 'cid',
      refreshToken: REFRESH_SECRET,
      tokenEndpoint: `${refused.origin}/token`,
    }),
    /CHANNEL_REAUTHORIZE/,
  );
});

test('the credential store encrypts tokens and reports connection state', async (t) => {
  const directory = await withTempDir(t);
  const store = new ChannelCredentialStore(directory, fakeEncryption());
  await store.load();
  assert.deepEqual(store.accounts(), {});
  const saved = await store.save(
    'channel_0001',
    {
      account_id: 'UC_account_1',
      account_name: 'Kênh thử',
      access_token: ACCESS_SECRET,
      refresh_token: REFRESH_SECRET,
      expires_at: 4_000_000,
    },
    1000,
  );
  assert.equal(saved.connected_at, 1000);
  assert.deepEqual(store.accounts(), {
    channel_0001: { connection: 'connected', account_name: 'Kênh thử' },
  });
  assert.deepEqual(await store.credentials('channel_0001'), {
    account_id: 'UC_account_1',
    access_token: ACCESS_SECRET,
  });
  assert.deepEqual(await store.credential('channel_0001'), {
    account_id: 'UC_account_1',
    account_name: 'Kênh thử',
    access_token: ACCESS_SECRET,
    refresh_token: REFRESH_SECRET,
    expires_at: 4_000_000,
  });

  const index = await readFile(path.join(directory, 'channels.json'), 'utf8');
  assert.ok(!index.includes(ACCESS_SECRET), 'the plaintext index leaked an access token');
  const tokenFile = path.join(directory, 'channel_0001.token');
  assert.ok(!(await readFile(tokenFile)).toString('latin1').includes(ACCESS_SECRET));

  await store.updateTokens('channel_0001', { access_token: 'refreshed', expires_at: 9_000_000 });
  assert.equal((await store.credential('channel_0001')).access_token, 'refreshed');
  assert.equal((await store.credential('channel_0001')).refresh_token, REFRESH_SECRET);

  const reopened = new ChannelCredentialStore(directory, fakeEncryption());
  await reopened.load();
  assert.equal((await reopened.credential('channel_0001')).access_token, 'refreshed');
  await reopened.markReauthorize('channel_0001');
  assert.equal(reopened.accounts().channel_0001.connection, 'reauthorize');
  await reopened.remove('channel_0001');
  assert.deepEqual(reopened.accounts(), {});
  assert.equal(await reopened.credentials('channel_0001'), undefined);
});

test('missing OS encryption refuses plainly and stores nothing', async (t) => {
  const directory = await withTempDir(t);
  const store = new ChannelCredentialStore(directory, fakeEncryption({ available: false }));
  await assert.rejects(
    store.save('channel_0001', {
      account_id: '1',
      account_name: 'x',
      access_token: 'tok',
    }),
    /CREDENTIAL_ENCRYPTION_UNAVAILABLE/,
  );
});

test('YouTube resumable upload persists the session, resumes, and reports forced privacy', async (t) => {
  const directory = await withTempDir(t);
  const videoPath = path.join(directory, 'video.mp4');
  const bytes = Buffer.from('0123456789');
  await writeFile(videoPath, bytes);
  const entries = [];
  const requests = [];
  let received = 0;
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [key, String(value)]),
    );
    requests.push({ method: request.method, headers, body });
    if (request.method === 'POST') {
      response.statusCode = 200;
      response.setHeader('location', `http://127.0.0.1:${server.address().port}/session/abc`);
      response.end();
      return;
    }
    const range = headers['content-range'];
    if (range.startsWith('bytes */')) {
      response.statusCode = 308;
      if (received > 0) response.setHeader('range', `bytes=0-${received - 1}`);
      response.end();
      return;
    }
    const [, , endRaw] = range.match(/^bytes (\d+)-(\d+)\//) ?? [];
    const end = Number(endRaw);
    received = Math.max(received, end + 1);
    if (received >= bytes.length) {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          id: 'vid1',
          status: { privacyStatus: 'private', uploadStatus: 'uploaded' },
        }),
      );
      return;
    }
    response.statusCode = 308;
    response.setHeader('range', `bytes=0-${received - 1}`);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  );
  const uploadEndpoint = `http://127.0.0.1:${server.address().port}/upload/youtube/v3/videos`;

  const post = postFixture(videoPath);
  const adapter = new YouTubeDestination({
    uploadEndpoint,
    chunkBytes: 4,
    diagnostics: publishingDiagnostics({ record: (entry) => entries.push(entry) }),
  });
  const { remote_ref } = await adapter.begin(post, {
    account_id: 'UC1',
    access_token: ACCESS_SECRET,
  });
  assert.equal(remote_ref, `http://127.0.0.1:${server.address().port}/session/abc`);
  const created = requests.find((entry) => entry.method === 'POST');
  const createdBody = JSON.parse(created.body);
  assert.equal(createdBody.status.selfDeclaredMadeForKids, false);
  assert.equal(createdBody.status.privacyStatus, 'public');
  assert.equal(createdBody.snippet.title, post.title);

  const progress = [];
  await adapter.upload(remote_ref, { path: videoPath, size_bytes: bytes.length }, (fraction) =>
    progress.push(fraction),
  );
  assert.equal(progress.at(-1), 1);
  const ranges = requests
    .filter((entry) => entry.method === 'PUT')
    .map((entry) => entry.headers['content-range']);
  assert.ok(
    ranges.some((range) => range.startsWith('bytes */')),
    'no session status query',
  );

  const outcome = await adapter.submit(remote_ref, post, null);
  assert.equal(outcome.kind, 'published');
  assert.equal(outcome.remote_post_id, 'vid1');
  assert.equal(outcome.privacy, 'private', 'forced-private upload must be reported honestly');

  const logged = JSON.stringify(entries);
  assert.ok(!logged.includes(ACCESS_SECRET), 'diagnostics leaked the access token');
  assert.ok(!logged.includes('session/abc'), 'diagnostics leaked the session URI');
});

test('a planned YouTube post requests a private schedule and submits a scheduled outcome', async (t) => {
  const directory = await withTempDir(t);
  const videoPath = path.join(directory, 'video.mp4');
  await writeFile(videoPath, Buffer.from('0123'));
  let createdBody;
  const server = await startServer(async (request, response) => {
    const body = await readBody(request);
    if (request.method === 'POST') {
      createdBody = JSON.parse(body);
      response.statusCode = 200;
      response.setHeader('location', `${server.origin}/session/xyz`);
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ id: 'vid2', status: { privacyStatus: 'private' } }));
  });
  t.after(() => server.close());
  const planned = { instant: Date.UTC(2026, 8, 20, 7, 30), timezone: 'Asia/Bangkok' };
  const post = postFixture(videoPath, { planned });
  const adapter = new YouTubeDestination({
    uploadEndpoint: `${server.origin}/upload/youtube/v3/videos`,
  });
  const { remote_ref } = await adapter.begin(post, {
    account_id: 'UC1',
    access_token: ACCESS_SECRET,
  });
  assert.equal(createdBody.status.privacyStatus, 'private');
  assert.equal(createdBody.status.publishAt, new Date(planned.instant).toISOString());
  await adapter.upload(remote_ref, { path: videoPath, size_bytes: 4 }, () => undefined);
  const outcome = await adapter.submit(remote_ref, post, planned);
  assert.equal(outcome.kind, 'scheduled');
  assert.equal(outcome.scheduled_for, planned.instant);
  assert.equal(outcome.privacy, 'private');
});

test('reconcile queries the session: incomplete fails, complete publishes, retired stays unknown', async (t) => {
  const directory = await withTempDir(t);
  const videoPath = path.join(directory, 'video.mp4');
  await writeFile(videoPath, Buffer.from('0123'));
  const post = postFixture(videoPath);

  async function reconcileAgainst(respond) {
    const server = await startServer((_request, response) => respond(response));
    try {
      const adapter = new YouTubeDestination({
        uploadEndpoint: `${server.origin}/upload/youtube/v3/videos`,
      });
      return await adapter.reconcile(
        `${server.origin}/session/s`,
        post,
        { account_id: 'UC1', access_token: ACCESS_SECRET },
        0,
      );
    } finally {
      await server.close();
    }
  }

  const incomplete = await reconcileAgainst((response) => {
    response.statusCode = 308;
    response.setHeader('range', 'bytes=0-1');
    response.end();
  });
  assert.deepEqual(incomplete, { kind: 'failed', error: 'PUBLISH_INCOMPLETE' });

  const complete = await reconcileAgainst((response) => {
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ id: 'vid3', status: { privacyStatus: 'public' } }));
  });
  assert.equal(complete.kind, 'published');
  assert.equal(complete.remote_post_id, 'vid3');
  assert.equal(complete.privacy, 'public');

  const retired = await reconcileAgainst((response) => {
    response.statusCode = 404;
    response.end();
  });
  assert.deepEqual(retired, { kind: 'unknown', error: 'PUBLISH_UNKNOWN' });
});

function memoryDestination(overrides = {}) {
  return {
    capabilities: YOUTUBE_CAPABILITIES,
    preflight: () => [],
    begin: async () => ({ remote_ref: 'session-1' }),
    upload: async () => undefined,
    submit: async () => ({
      kind: 'published',
      remote_post_id: 'v1',
      remote_url: 'https://youtu.be/v1',
      privacy: 'public',
    }),
    reconcile: async () => ({ kind: 'unknown', error: null }),
    ...overrides,
  };
}

function publishInput(post, events, destination) {
  return {
    post,
    attempt_id: 'attempt_0001',
    credentials: { account_id: 'UC1', access_token: ACCESS_SECRET },
    media: { duration_ms: 30_000, width: 1080, height: 1920, size_bytes: 4 },
    persist: (publication) => events.push(`persist:${publication.phase}`),
    onProgress: () => undefined,
    destination,
  };
}

test('a concurrent publish on one post is refused before a second session opens', async () => {
  const post = postFixture('/tmp/none.mp4');
  const events = [];
  let begins = 0;
  let release = () => undefined;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const destination = memoryDestination({
    begin: async () => {
      begins += 1;
      await gate;
      return { remote_ref: 'session-1' };
    },
  });
  const service = new PublishingService({ destinationFor: () => destination, now: () => 1 });
  const first = service.publish(publishInput(post, events, destination));
  await assert.rejects(
    service.publish(publishInput(post, events, destination)),
    /PUBLISH_IN_PROGRESS/,
  );
  release();
  const result = await first;
  assert.equal(result.phase, 'published');
  assert.equal(begins, 1, 'a second upload session was opened');
});

test('a mapped 4xx refusal after bytes start fails without reconciling', async () => {
  const post = postFixture('/tmp/none.mp4');
  const events = [];
  let reconcileCalls = 0;
  const destination = memoryDestination({
    upload: async () => {
      throw publishError('PUBLISH_RATE_LIMITED', { definite: true });
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return { kind: 'unknown', error: null };
    },
  });
  const service = new PublishingService({ destinationFor: () => destination, now: () => 1 });
  await assert.rejects(
    service.publish(publishInput(post, events, destination)),
    /PUBLISH_RATE_LIMITED/,
  );
  assert.deepEqual(events, ['persist:uploading', 'persist:failed']);
  assert.equal(reconcileCalls, 0, 'a definite refusal must not reconcile');
});

test('a 5xx after bytes start is unknown and never failed', async () => {
  const post = postFixture('/tmp/none.mp4');
  const events = [];
  const destination = memoryDestination({
    upload: async () => {
      throw publishError('PUBLISH_TRANSPORT');
    },
  });
  const service = new PublishingService({ destinationFor: () => destination, now: () => 1 });
  const result = await service.publish(publishInput(post, events, destination));
  assert.deepEqual(events, ['persist:uploading', 'persist:unknown']);
  assert.equal(result.phase, 'unknown');
});

test('the adapter treats a 5xx mid-upload as ambiguous, not a definite refusal', async (t) => {
  const directory = await withTempDir(t);
  const videoPath = path.join(directory, 'video.mp4');
  await writeFile(videoPath, Buffer.from('0123456789'));
  const server = await startServer(async (request, response) => {
    await readBody(request);
    if (request.method === 'POST') {
      response.statusCode = 200;
      response.setHeader('location', `${server.origin}/session/abc`);
      response.end();
      return;
    }
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [key, String(value)]),
    );
    if (headers['content-range'].startsWith('bytes */')) {
      response.statusCode = 308;
      response.end();
      return;
    }
    response.statusCode = 500;
    response.end('boom');
  });
  t.after(() => server.close());
  const post = postFixture(videoPath);
  const adapter = new YouTubeDestination({
    uploadEndpoint: `${server.origin}/upload/youtube/v3/videos`,
    chunkBytes: 4,
  });
  const { remote_ref } = await adapter.begin(post, {
    account_id: 'UC1',
    access_token: ACCESS_SECRET,
  });
  const error = await adapter
    .upload(remote_ref, { path: videoPath, size_bytes: 10 }, () => undefined)
    .then(
      () => null,
      (reason) => reason,
    );
  assert.ok(error, 'the 5xx did not reject');
  assert.equal(isDefiniteRefusal(error), false);
  assert.equal(error.code, 'PUBLISH_UNKNOWN');
});

test('a crash while uploading reconciles to a retryable failure, and a settled upload resolves', () => {
  const uploading = startAttempt(null, {
    attempt_id: 'attempt_0001',
    remote_ref: 'session-1',
    now: 1,
  });
  const interrupted = postFixture('/tmp/none.mp4', { publication: uploading });
  const events = [];
  const interruptedService = new PublishingService({
    destinationFor: () =>
      memoryDestination({
        reconcile: async () => ({ kind: 'failed', error: 'PUBLISH_INCOMPLETE' }),
      }),
    now: () => 10,
  });
  return interruptedService
    .reconcile({
      post: interrupted,
      credentials: { account_id: 'UC1', access_token: ACCESS_SECRET },
      persist: (publication) => events.push(publication),
    })
    .then((failed) => {
      assert.equal(failed.phase, 'failed');
      assert.equal(failed.error, 'PUBLISH_UPLOAD_INTERRUPTED');
      assert.equal(events.length, 1);

      const settledEvents = [];
      const settled = postFixture('/tmp/none.mp4', {
        publication: startAttempt(null, { attempt_id: 'attempt_0002', remote_ref: 's2', now: 1 }),
      });
      const settledService = new PublishingService({
        destinationFor: () =>
          memoryDestination({
            reconcile: async () => ({
              kind: 'published',
              remote_post_id: 'v2',
              remote_url: 'https://youtu.be/v2',
              privacy: 'public',
            }),
          }),
        now: () => 10,
      });
      return settledService
        .reconcile({
          post: settled,
          credentials: { account_id: 'UC1', access_token: ACCESS_SECRET },
          persist: (publication) => settledEvents.push(publication.phase),
        })
        .then((published) => {
          assert.equal(published.phase, 'published');
          assert.deepEqual(settledEvents, ['published']);
        });
    });
});
