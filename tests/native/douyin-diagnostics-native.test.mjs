import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  recordDouyinDownloadTransitions,
  sourcesDiagnostics,
} from '../../dist-node/electron/features/sources/diagnostics.js';
import { fetchDouyinMobileDetail } from '../../dist-node/electron/features/sources/mobile-detail.js';
import { createDiagnosticSink } from '../../dist-node/electron/runtime/diagnostic-sink.js';

/**
 * The one secret-shaped value the fake session carries. If it ever reaches the Diagnostic log the
 * assertions below name it, exactly as the old ad-hoc writer's "no cookie/token/URL" guarantee was
 * asserted by handing it value-only fields.
 */
const COOKIE_SECRET = 'ttwid=session-2f9c-should-never-be-logged';
/** A token-shaped value only the response body carries — untrusted content, never a log field. */
const BODY_SECRET = 'sk-live-9d2a-should-never-be-logged';
/** A URL query value the mobile endpoint's own request (or a body) carries. */
const QUERY_SECRET = 'sig-7b1e-should-never-be-logged';

/** Runs `run` with `globalThis.fetch` replaced, restoring it even when the path throws. */
async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('a Douyin failure path leaves a Diagnostic record from the sources module', async () => {
  const entries = [];
  const recorder = { record: (entry) => entries.push(entry) };
  const result = await withFetch(
    async () => {
      throw new Error('network down');
    },
    () =>
      fetchDouyinMobileDetail(
        '7001',
        { cookies: [{ name: 'ttwid', value: COOKIE_SECRET }] },
        Date.now(),
        sourcesDiagnostics(recorder),
      ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.failure.kind, 'page_load_failed');
  const failure = entries.find((entry) => entry.event === 'sources.mobile-detail.error');
  assert.ok(failure, 'the failure path left no Diagnostic record');
  assert.equal(failure.level, 'warn');
  assert.equal(failure.source.process, 'main');
  assert.equal(failure.source.module, 'sources');
  assert.deepEqual(failure.detail, { code: 'network' });
});

test('no cookie, token, query string or page URL reaches the Diagnostic log', async (t) => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reupmatic-douyin-diag-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sink = createDiagnosticSink({ directory, level: 'debug' });
  let requested = '';

  await withFetch(
    async (url) => {
      requested = String(url);
      return new Response(
        JSON.stringify({
          url: `https://www.douyin.com/video/7?sig=${QUERY_SECRET}`,
          token: BODY_SECRET,
          body: 'a private transcript',
        }),
        { status: 200 },
      );
    },
    () =>
      fetchDouyinMobileDetail(
        '7001',
        { cookies: [{ name: 'ttwid', value: COOKIE_SECRET }] },
        Date.now(),
        sourcesDiagnostics(sink),
      ),
  );
  sink.close();

  const file = await readFile(path.join(directory, 'reupmatic-diagnostics.ndjson'), 'utf8');
  assert.ok(file.includes('sources.mobile-detail'), 'the Douyin path wrote no record');
  for (const leak of [
    COOKIE_SECRET,
    BODY_SECRET,
    QUERY_SECRET,
    'a private transcript',
    '?aweme_id=',
    'aweme.snssdk.com',
    requested,
  ])
    assert.ok(!file.includes(leak), `the Diagnostic log leaked ${leak}`);
});

test('a download run records each item once, with the stage a failure stopped at', () => {
  const entries = [];
  const diagnostics = sourcesDiagnostics({ record: (entry) => entries.push(entry) });
  const snapshot = (items) => ({ items, active: false, cancelled: false, total: items.length });
  let previous = null;
  const step = (items) => {
    const next = snapshot(items);
    recordDouyinDownloadTransitions(diagnostics, previous, next);
    previous = next;
  };
  step([
    { awemeId: '1', state: 'queued' },
    { awemeId: '2', state: 'queued' },
  ]);
  step([
    { awemeId: '1', state: 'running' },
    { awemeId: '2', state: 'queued' },
  ]);
  step([
    { awemeId: '1', state: 'failed', code: 'DOWNLOAD_FAILED', stage: 'transfer' },
    { awemeId: '2', state: 'queued' },
  ]);
  // A repeated snapshot is not a second outcome.
  step([
    { awemeId: '1', state: 'failed', code: 'DOWNLOAD_FAILED', stage: 'transfer' },
    { awemeId: '2', state: 'complete', contentId: 'c-2' },
  ]);

  const items = entries.filter((entry) => entry.event === 'sources.download.item');
  assert.deepEqual(
    items.map((entry) => [entry.level, entry.detail.id, entry.detail.state]),
    [
      ['debug', '1', 'running'],
      ['warn', '1', 'failed'],
      ['info', '2', 'complete'],
    ],
  );
  const failed = items[1];
  assert.equal(failed.code, 'DOWNLOAD_FAILED');
  assert.equal(failed.detail.stage, 'transfer');
});
