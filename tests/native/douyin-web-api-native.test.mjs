import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sourcesDiagnostics } from '../../dist-node/electron/features/sources/diagnostics.js';
import {
  fetchDouyinDetailPreferWeb,
  fetchDouyinWebDetail,
  fetchDouyinWebPostPage,
} from '../../dist-node/electron/features/sources/web-api.js';
import { createDiagnosticSink } from '../../dist-node/electron/runtime/diagnostic-sink.js';

/** The one secret-shaped value the fake session carries — asserted absent from every log line. */
const COOKIE_SECRET = 'sessionid=session-4a7e-should-never-be-logged';
const BODY_SECRET = 'sk-live-2c6f-should-never-be-logged';

async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const credentials = () => ({
  cookies: [{ name: 'sessionid', value: COOKIE_SECRET.split('=')[1] }],
});

function jsonResponse(body, status = 200) {
  return new Response(body, { status });
}

test('the web post page request carries the base query and the web app UA/Referer', async () => {
  let seenUrl;
  let seenHeaders;
  await withFetch(
    async (url, init) => {
      seenUrl = new URL(url);
      seenHeaders = init.headers;
      return jsonResponse(JSON.stringify({ status_code: 0, aweme_list: [], has_more: 0 }));
    },
    () => fetchDouyinWebPostPage('sec-uid-1', 12345, credentials(), sourcesDiagnostics(undefined)),
  );
  assert.equal(seenUrl.pathname, '/aweme/v1/web/aweme/post/');
  assert.equal(seenUrl.searchParams.get('sec_user_id'), 'sec-uid-1');
  assert.equal(seenUrl.searchParams.get('max_cursor'), '12345');
  assert.equal(seenUrl.searchParams.get('count'), '20');
  assert.equal(seenUrl.searchParams.get('device_platform'), 'webapp');
  assert.equal(seenUrl.searchParams.get('aid'), '6383');
  assert.equal(seenHeaders.referer, 'https://www.douyin.com/');
  assert.match(seenHeaders['user-agent'], /Chrome/);
  assert.match(seenHeaders.cookie, /^sessionid=/);
});

test('the web detail request targets aweme/detail with the aweme_id', async () => {
  let seenUrl;
  await withFetch(
    async (url) => {
      seenUrl = new URL(url);
      return jsonResponse(JSON.stringify({ status_code: 0, aweme_detail: { aweme_id: '7001' } }));
    },
    () => fetchDouyinWebDetail('7001', credentials(), Date.now(), sourcesDiagnostics(undefined)),
  );
  assert.equal(seenUrl.pathname, '/aweme/v1/web/aweme/detail/');
  assert.equal(seenUrl.searchParams.get('aweme_id'), '7001');
});

test('a web detail refusal falls back to the mobile endpoint, and the diagnostic names which source answered', async () => {
  const entries = [];
  const recorder = { record: (entry) => entries.push(entry) };
  const outcome = await withFetch(
    async (url) => {
      const target = new URL(url);
      if (target.hostname === 'www.douyin.com') {
        return jsonResponse('Blocked by ArgusSecurityPlugin Uifid Not Found', 403);
      }
      if (target.hostname === 'aweme.snssdk.com') {
        return jsonResponse(JSON.stringify({ status_code: 0, aweme_detail: { aweme_id: '7001' } }));
      }
      throw new Error(`unexpected host ${target.hostname}`);
    },
    () =>
      fetchDouyinDetailPreferWeb('7001', credentials(), Date.now(), sourcesDiagnostics(recorder)),
  );
  assert.equal(outcome.ok, true);
  const failedWeb = entries.find((entry) => entry.event === 'sources.detail.web-failed');
  assert.ok(failedWeb, 'the web failure was not recorded');
  assert.equal(failedWeb.detail.kind, 'verification_required');
  const answered = entries.filter((entry) => entry.event === 'sources.detail');
  assert.equal(answered.length, 1);
  assert.equal(answered[0].detail.source, 'mobile');
});

test('a web detail success never calls the mobile endpoint', async () => {
  const entries = [];
  const recorder = { record: (entry) => entries.push(entry) };
  let mobileCalled = false;
  const outcome = await withFetch(
    async (url) => {
      const target = new URL(url);
      if (target.hostname === 'aweme.snssdk.com') mobileCalled = true;
      return jsonResponse(JSON.stringify({ status_code: 0, aweme_detail: { aweme_id: '7001' } }));
    },
    () =>
      fetchDouyinDetailPreferWeb('7001', credentials(), Date.now(), sourcesDiagnostics(recorder)),
  );
  assert.equal(outcome.ok, true);
  assert.equal(mobileCalled, false);
  const answered = entries.find((entry) => entry.event === 'sources.detail');
  assert.equal(answered.detail.source, 'web');
});

test('no cookie, token, query string or page URL reaches the Diagnostic log', async (t) => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-douyin-web-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sink = createDiagnosticSink({ directory, level: 'debug' });
  let requestedUrl = '';

  await withFetch(
    async (url) => {
      requestedUrl = String(url);
      return jsonResponse(
        JSON.stringify({
          status_code: 0,
          aweme_list: [{ aweme_id: '1', token: BODY_SECRET }],
          has_more: 0,
        }),
      );
    },
    () => fetchDouyinWebPostPage('sec-uid-1', 0, credentials(), sourcesDiagnostics(sink)),
  );
  sink.close();

  const file = await readFile(path.join(directory, 'reupmatic-diagnostics.ndjson'), 'utf8');
  assert.ok(file.includes('sources.walk.page'), 'the walk path wrote no record');
  for (const leak of [COOKIE_SECRET, BODY_SECRET, requestedUrl, 'sec_user_id=sec-uid-1']) {
    assert.ok(!file.includes(leak), `the Diagnostic log leaked ${leak}`);
  }
});

test('a transport failure (network down) is retryable, never a permanent refusal', async () => {
  const outcome = await withFetch(
    async () => {
      throw new Error('network down');
    },
    () => fetchDouyinWebPostPage('sec-uid-1', 0, credentials(), sourcesDiagnostics(undefined)),
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure.kind, 'page_load_failed');
  assert.equal(outcome.failure.retryable, true);
});
