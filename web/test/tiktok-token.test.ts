import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import {
  brokerConfigFromEnv,
  exchangeTikTokCode,
  refreshTikTokToken,
  TIKTOK_TOKEN_PATH,
} from '../lib/tiktok-token.ts';

const ACCESS = 'access-token-value';
const REFRESH = 'refresh-token-value';
const OPEN_ID = 'open-id-value';
const REDIRECT = 'https://reupmatic.canhta.com/tiktok/callback';
const VERIFIER = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';

interface TokenRequest {
  path: string;
  contentType: string | undefined;
  params: URLSearchParams;
}

async function fakeTokenEndpoint(
  reply: (request: TokenRequest) => { status?: number; body: unknown },
) {
  const requests: TokenRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk as Buffer));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      const record: TokenRequest = {
        path: new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
        contentType: request.headers['content-type'],
        params: new URLSearchParams(body),
      };
      requests.push(record);
      const result = reply(record);
      response.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    requests,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const config = (base: string) => ({
  clientKey: 'client-key',
  clientSecret: 'client-secret',
  redirectUri: REDIRECT,
  baseUrl: base,
});

const tokenBody = {
  access_token: ACCESS,
  refresh_token: REFRESH,
  open_id: OPEN_ID,
  expires_in: 86_400,
  refresh_expires_in: 31_536_000,
  token_type: 'Bearer',
  scope: 'user.info.basic,video.publish',
};

test('exchanges a login code with PKCE code_verifier and the client secret', async () => {
  const server = await fakeTokenEndpoint(() => ({ body: tokenBody }));
  try {
    const result = await exchangeTikTokCode(
      { code: 'login-code', redirect_uri: REDIRECT, code_verifier: VERIFIER },
      config(server.base),
    );
    assert.deepEqual(result, {
      ok: true,
      tokens: {
        access_token: ACCESS,
        refresh_token: REFRESH,
        open_id: OPEN_ID,
        expires_in: 86_400,
        refresh_expires_in: 31_536_000,
      },
    });
    assert.equal(server.requests.length, 1);
    const [request] = server.requests;
    assert.equal(request.path, TIKTOK_TOKEN_PATH);
    assert.match(request.contentType ?? '', /application\/x-www-form-urlencoded/);
    assert.equal(request.params.get('client_key'), 'client-key');
    assert.equal(request.params.get('client_secret'), 'client-secret');
    assert.equal(request.params.get('grant_type'), 'authorization_code');
    assert.equal(request.params.get('code'), 'login-code');
    assert.equal(request.params.get('redirect_uri'), REDIRECT);
    assert.equal(request.params.get('code_verifier'), VERIFIER);
  } finally {
    await server.close();
  }
});

test('refresh uses the refresh token grant and returns a fresh token set', async () => {
  const server = await fakeTokenEndpoint(() => ({ body: tokenBody }));
  try {
    const result = await refreshTikTokToken({ refresh_token: REFRESH }, config(server.base));
    assert.equal(result.ok, true);
    const [request] = server.requests;
    assert.equal(request.params.get('grant_type'), 'refresh_token');
    assert.equal(request.params.get('refresh_token'), REFRESH);
    assert.equal(request.params.get('client_secret'), 'client-secret');
  } finally {
    await server.close();
  }
});

test('a bad redirect, code or verifier never reaches TikTok', async () => {
  let reached = 0;
  const fetchSpy: typeof fetch = async (...args) => {
    reached += 1;
    return fetch(...args);
  };
  const server = await fakeTokenEndpoint(() => ({ body: tokenBody }));
  try {
    const base = config(server.base);
    assert.deepEqual(
      await exchangeTikTokCode(
        { code: 'c', redirect_uri: 'https://evil.example', code_verifier: VERIFIER },
        base,
        fetchSpy,
      ),
      { ok: false, status: 400, error: 'INVALID_REDIRECT' },
    );
    assert.deepEqual(
      await exchangeTikTokCode(
        { code: '', redirect_uri: REDIRECT, code_verifier: VERIFIER },
        base,
        fetchSpy,
      ),
      { ok: false, status: 400, error: 'INVALID_CODE' },
    );
    assert.deepEqual(
      await exchangeTikTokCode(
        { code: 'c', redirect_uri: REDIRECT, code_verifier: 'short' },
        base,
        fetchSpy,
      ),
      { ok: false, status: 400, error: 'INVALID_CODE_VERIFIER' },
    );
    assert.deepEqual(await refreshTikTokToken({ refresh_token: '' }, base, fetchSpy), {
      ok: false,
      status: 400,
      error: 'INVALID_REFRESH_TOKEN',
    });
    assert.equal(reached, 0, 'no invalid request reaches the network');
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test('a refused exchange becomes a named error without leaking a token', async () => {
  const server = await fakeTokenEndpoint(() => ({
    status: 401,
    body: { error: 'invalid_grant', access_token: ACCESS },
  }));
  try {
    const result = await exchangeTikTokCode(
      { code: 'c', redirect_uri: REDIRECT, code_verifier: VERIFIER },
      config(server.base),
    );
    assert.deepEqual(result, { ok: false, status: 502, error: 'TIKTOK_EXCHANGE_FAILED' });
    assert.ok(!JSON.stringify(result).includes(ACCESS));
  } finally {
    await server.close();
  }
});

test('the broker never logs a token and needs the client credentials and redirect configured', async () => {
  const logs: string[] = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  for (const key of Object.keys(originals) as (keyof typeof originals)[])
    console[key] = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  const server = await fakeTokenEndpoint(() => ({ body: tokenBody }));
  try {
    await refreshTikTokToken({ refresh_token: REFRESH }, config(server.base));
    assert.equal(brokerConfigFromEnv({}), null);
    assert.equal(brokerConfigFromEnv({ TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's' }), null);
    assert.deepEqual(
      brokerConfigFromEnv({
        TIKTOK_CLIENT_KEY: 'k',
        TIKTOK_CLIENT_SECRET: 's',
        TIKTOK_REDIRECT_URI: REDIRECT,
      }),
      {
        clientKey: 'k',
        clientSecret: 's',
        redirectUri: REDIRECT,
        baseUrl: 'https://open.tiktokapis.com',
      },
    );
    assert.ok(!logs.some((line) => line.includes(ACCESS) || line.includes(REFRESH)));
  } finally {
    for (const [key, fn] of Object.entries(originals)) console[key as keyof typeof originals] = fn;
    await server.close();
  }
});
