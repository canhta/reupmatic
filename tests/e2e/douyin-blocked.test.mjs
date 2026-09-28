// Proves the e2e launcher's Douyin block holds inside the real app: a search with a made-up
// session and a made-up link fails as if offline, and the app's own HTTP calls are what failed.
// No real session, link or network is involved (owner rule).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

const FAKE_SESSION = 'sessionid=fake-session-for-tests; sid_tt=fake; sid_guard=fake';
const FAKE_VIDEO = 'https://www.douyin.com/video/7000000000000000001';

test('a Douyin search in a test run never reaches Douyin', { timeout: 120000 }, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-douyin-blocked-');
  await runElectronTest({ temp, userData }, async ({ page }) => {
    await waitForEditorReady(page);
    const imported = await page.evaluate(
      (text) =>
        window.reupmatic
          .douyinImportCookies({ text })
          .then((r) => (r.ok ? r.data.status : r.error)),
      FAKE_SESSION,
    );
    assert.equal(imported, 'connected');

    const outcome = await page.evaluate(
      (text) =>
        window.reupmatic.douyinSearch({ text }).then((r) => (r.ok ? r.data : { error: r.error })),
      FAKE_VIDEO,
    );
    assert.equal(outcome.status, 'failure', JSON.stringify(outcome));
    assert.equal(
      outcome.failure.httpStatus,
      null,
      'no HTTP response may exist: the request was refused',
    );

    const log = readFileSync(path.join(userData, 'logs', 'reupmatic-diagnostics.ndjson'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const errors = log.filter((record) =>
      /^sources\.(web-detail|mobile-detail)\.error$/.test(record.event),
    );
    assert.ok(errors.length > 0, 'the detail requests must have failed as transport errors');
    assert.ok(
      log.every(
        (record) =>
          !(record.event === 'sources.web-detail' && typeof record.detail?.status === 'number'),
      ),
      'no web-detail response may have been received',
    );
  });
});
