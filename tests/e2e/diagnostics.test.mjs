import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { chooseLocale, openSettingsArea, waitForEditorReady } from './ui-actions.mjs';

const LOG = 'reupmatic-diagnostics.ndjson';

async function records(userData) {
  const contents = await readFile(path.join(userData, 'logs', LOG), 'utf8');
  return contents
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('launching leaves a startup record, and renderer failures reach the same log', {
  timeout: 30_000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-diagnostics-');
  await runElectronTest({ temp, userData }, async ({ page }) => {
    await waitForEditorReady(page);
    assert.ok(
      (await records(userData)).some((record) => record.event === 'app.started'),
      'launching the app left no startup record',
    );

    // The three global handlers, exercised through the page itself rather than by calling the
    // capture module directly: this is the wiring under test.
    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: new TypeError('e2e uncaught'),
          message: 'e2e uncaught',
          filename: 'app://ui/e2e.js',
          lineno: 7,
        }),
      );
      console.error('e2e console failure');
    });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.dispatchEvent(
            new PromiseRejectionEvent('unhandledrejection', {
              promise: Promise.resolve(),
              reason: new Error('e2e rejected'),
            }),
          );
          setTimeout(resolve, 300);
        }),
    );

    const written = await records(userData);
    const renderer = written.filter((record) => record.source.process === 'renderer');
    for (const event of [
      'renderer.uncaught-error',
      'renderer.unhandled-rejection',
      'renderer.console-error',
    ])
      assert.ok(
        renderer.some((record) => record.event === event),
        `no ${event} record reached the diagnostic log`,
      );
    // The host stamps the process; the renderer never declares it.
    assert.ok(renderer.every((record) => record.source.module === 'shell'));
    // Editor is the open area, so renderer records carry the open Project.
    assert.ok(renderer.some((record) => typeof record.correlation?.project === 'string'));
  });
});

test('a coded failure leaves a record, not merely a returned code', {
  timeout: 30_000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-coded-');
  await runElectronTest({ temp, userData }, async ({ page }) => {
    await waitForEditorReady(page);
    // A request the host refuses: the renderer gets the code back, and the boundary that decided
    // that code owes the log a record for it (D-61).
    const reply = await page.evaluate(() => window.reupmatic.sessionDirty('not-a-boolean'));
    assert.deepEqual(reply, { ok: false, error: 'INVALID_REQUEST' });

    const failure = (await records(userData)).find(
      (record) => record.event === 'ipc.request-failed',
    );
    assert.ok(failure, 'a refused request left no record');
    assert.equal(failure.code, 'INVALID_REQUEST');
    assert.equal(failure.detail.operation, 'session-dirty');
    assert.equal(failure.source.process, 'main');
  });
});

test('Settings keeps diagnostics inside collapsed Advanced, in both locales', {
  timeout: 40_000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-diag-settings-');
  await runElectronTest({ temp, userData }, async ({ page, application }) => {
    await waitForEditorReady(page);
    const settings = await openSettingsArea(page);
    // D-37/D-57: three primary categories plus a demoted Advanced — diagnostics add no fourth.
    const categories = settings.getByRole('navigation', { name: 'Settings categories' });
    assert.deepEqual(await categories.getByRole('button').allInnerTexts(), [
      'General',
      'AI & processing',
      'Account',
      'Advanced',
    ]);

    await categories.getByRole('button', { name: 'Advanced', exact: true }).click();
    const open = page.getByRole('button', { name: 'Open diagnostics folder', exact: true });
    const exportBundle = page.getByRole('button', { name: 'Export support bundle…', exact: true });
    await open.waitFor();
    await exportBundle.waitFor();
    // Keyboard reachable, like every other Settings control.
    await open.focus();
    assert.equal(await open.evaluate((element) => document.activeElement === element), true);

    // The language control lives in General; the category is sticky, so come back to it first.
    await categories.getByRole('button', { name: 'General', exact: true }).click();
    await chooseLocale(application, page, 'vi');
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Danh mục thiết lập' })
      .getByRole('button', { name: 'Nâng cao', exact: true })
      .click();
    await page.getByRole('button', { name: 'Mở thư mục chẩn đoán', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xuất gói hỗ trợ…', exact: true }).waitFor();
  });
});

test('the hardest failures still leave evidence: uncaught, rejected, and a render failure', {
  timeout: 40_000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-crash-');
  await runElectronTest({ temp, userData }, async ({ page, application }) => {
    await waitForEditorReady(page);

    // Main-process hooks, raised inside the main process itself rather than simulated.
    await application.evaluate(() => {
      process.emit('uncaughtException', new TypeError('e2e main uncaught'));
      process.emit('unhandledRejection', new Error('e2e main rejected'), Promise.resolve());
    });
    // A React render failure reaches the boundary, which is the only thing standing between a
    // thrown render and a blank window with no record at all.
    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent('error', { error: new Error('e2e render'), message: 'e2e render' }),
      );
    });
    await page.waitForTimeout(300);

    const written = await records(userData);
    for (const event of ['main.uncaught-exception', 'main.unhandled-rejection'])
      assert.ok(
        written.some((record) => record.event === event && record.source.process === 'main'),
        `no ${event} record`,
      );

    // The sink must still be recording afterwards: a non-fatal rejection must not mute the
    // session, which is what closing on the crash hook used to do.
    await page.evaluate(() => console.error('e2e still recording'));
    await page.waitForTimeout(300);
    assert.ok(
      (await records(userData)).some(
        (record) =>
          record.event === 'renderer.console-error' && /still recording/.test(record.message ?? ''),
      ),
      'the sink stopped recording after a crash hook fired',
    );
  });
});
