import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import {
  brokerConfigFromEnv,
  exchangeFacebookCode,
  FACEBOOK_REDIRECT_URI,
} from '../lib/facebook-token.ts';

const LONG_TOKEN = 'long-lived-user-token-value';
const SHORT_TOKEN = 'short-lived-user-token-value';

interface GraphRequest {
  path: string;
  params: URLSearchParams;
}

interface GraphReply {
  status?: number;
  body: unknown;
}

async function fakeGraph(handler: (url: URL) => GraphReply) {
  const requests: GraphRequest[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push({ path: url.pathname, params: url.searchParams });
    const result = handler(url);
    response.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    requests,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const config = (base: string) => ({ appId: 'app-id', appSecret: 'app-secret', graphBaseUrl: base });

test('exchanges a code for a long-lived user token through the two Graph steps', async () => {
  const graph = await fakeGraph((url) =>
    url.pathname.endsWith('/oauth/access_token')
      ? {
          body: {
            access_token: url.searchParams.has('fb_exchange_token') ? LONG_TOKEN : SHORT_TOKEN,
          },
        }
      : { status: 404, body: { error: 'unknown' } },
  );
  try {
    const result = await exchangeFacebookCode(
      { code: 'login-code', redirect_uri: FACEBOOK_REDIRECT_URI },
      config(graph.base),
    );
    assert.deepEqual(result, { ok: true, access_token: LONG_TOKEN });
    assert.equal(graph.requests.length, 2);
    const [first, second] = graph.requests;
    assert.equal(first.params.get('code'), 'login-code');
    assert.equal(first.params.get('client_secret'), 'app-secret');
    assert.equal(first.params.get('redirect_uri'), FACEBOOK_REDIRECT_URI);
    assert.equal(second.params.get('grant_type'), 'fb_exchange_token');
    assert.equal(second.params.get('fb_exchange_token'), SHORT_TOKEN);
  } finally {
    await graph.close();
  }
});

test('accepts only the registered redirect URI and never sends a bad request to Graph', async () => {
  let reached = 0;
  const fetchSpy: typeof fetch = async (...args) => {
    reached += 1;
    return fetch(...args);
  };
  const graph = await fakeGraph(() => ({ body: { access_token: LONG_TOKEN } }));
  try {
    const base = config(graph.base);
    const redirects: unknown[] = [
      'https://evil.example/callback',
      'http://localhost:1234',
      `${FACEBOOK_REDIRECT_URI}?x=1`,
      undefined,
    ];
    for (const redirect of redirects) {
      const result = await exchangeFacebookCode(
        { code: 'c', redirect_uri: redirect },
        base,
        fetchSpy,
      );
      assert.deepEqual(result, { ok: false, status: 400, error: 'INVALID_REDIRECT' });
    }
    assert.deepEqual(await exchangeFacebookCode(null, base, fetchSpy), {
      ok: false,
      status: 400,
      error: 'INVALID_CODE',
    });
    assert.equal(reached, 0, 'no invalid request reaches the network');
    assert.equal(graph.requests.length, 0);
  } finally {
    await graph.close();
  }
});

test('a refused Graph exchange becomes a named error without leaking a token', async () => {
  const graph = await fakeGraph(() => ({
    status: 400,
    body: { error: { message: 'bad code', access_token: SHORT_TOKEN } },
  }));
  try {
    const result = await exchangeFacebookCode(
      { code: 'c', redirect_uri: FACEBOOK_REDIRECT_URI },
      config(graph.base),
    );
    assert.deepEqual(result, { ok: false, status: 502, error: 'GRAPH_EXCHANGE_FAILED' });
    assert.ok(!JSON.stringify(result).includes(SHORT_TOKEN));
  } finally {
    await graph.close();
  }
});

test('the broker never logs a token and needs both app credentials configured', async () => {
  const logs: string[] = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  for (const key of Object.keys(originals) as (keyof typeof originals)[])
    console[key] = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  const graph = await fakeGraph((url) =>
    url.pathname.endsWith('/oauth/access_token')
      ? {
          body: {
            access_token: url.searchParams.has('fb_exchange_token') ? LONG_TOKEN : SHORT_TOKEN,
          },
        }
      : { status: 404, body: {} },
  );
  try {
    await exchangeFacebookCode(
      { code: 'c', redirect_uri: FACEBOOK_REDIRECT_URI },
      config(graph.base),
    );
    assert.equal(brokerConfigFromEnv({}), null);
    assert.equal(brokerConfigFromEnv({ META_APP_ID: 'a' }), null);
    assert.deepEqual(brokerConfigFromEnv({ META_APP_ID: 'a', META_APP_SECRET: 's' }), {
      appId: 'a',
      appSecret: 's',
      graphBaseUrl: 'https://graph.facebook.com',
    });
    assert.ok(!logs.some((line) => line.includes(LONG_TOKEN) || line.includes(SHORT_TOKEN)));
  } finally {
    for (const [key, fn] of Object.entries(originals)) console[key as keyof typeof originals] = fn;
    await graph.close();
  }
});
