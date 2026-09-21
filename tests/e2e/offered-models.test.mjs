// Real Electron/Playwright against the actual Settings destination — a sidebar area in the one
// main window now (D-57, ticket 10). The offered-model catalogue is shipped data, so the panel
// is populated without any network access: this test never starts a download and never reaches
// a model host. Busy/cancelled/error and cleanup paths are covered at the core boundary with a
// local stub server (tests/core/model-installer.test.mjs).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { openSettingsArea, waitForEditorReady } from './ui-actions.mjs';

test('Offered models: purpose, sizes, host and licence before any download', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-offered-models-');
  await runElectronTest(
    { temp, userData, screenshotName: 'offered-models-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      const settings = await openSettingsArea(page);
      const screenshots = path.join(root, '.test-artifacts');
      await mkdir(screenshots, { recursive: true });

      async function assertPanel(labels) {
        await settings.getByRole('button', { name: labels.category, exact: true }).click();
        await settings.getByRole('heading', { name: labels.title, exact: true }).waitFor();
        const row = settings.getByRole('row').filter({ hasText: labels.purpose }).first();
        const text = await row.innerText();
        for (const fragment of ['huggingface.co', labels.licence, labels.download]) {
          assert.ok(text.includes(fragment), `${labels.purpose} row must show ${fragment}`);
        }
        // Download stays a deliberate act: the row states its licence and nothing transfers
        // until the button is pressed.
        const download = row.getByRole('button', { name: labels.download });
        assert.equal(await download.isDisabled(), false);
        return row;
      }

      await assertPanel({
        category: 'AI & processing',
        title: 'Offered models',
        purpose: 'Fastest multilingual drafts on CPU',
        licence: 'Licence: MIT',
        download: 'Download',
      });

      await settings.emulateMedia({ reducedMotion: 'reduce' });
      for (const [width, height] of [
        [1420, 900],
        [1050, 700],
      ]) {
        await settings.setViewportSize({ width, height });
        await settings.screenshot({
          path: path.join(screenshots, `offered-models-en-${width}x${height}.png`),
          fullPage: true,
        });
      }

      // Vietnamese ships with English, including long labels.
      await settings.getByRole('button', { name: 'General', exact: true }).click();
      await settings.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).click();
      await settings.getByRole('option', { name: 'Tiếng Việt', exact: true }).click();
      await settings.waitForFunction(() => document.documentElement.lang === 'vi');

      // The model's own description is catalogue data, not a translation key, so it has to be
      // carried per locale (ticket 12) — matching on the English string here would have passed
      // while the Vietnamese screen read English.
      await assertPanel({
        category: 'AI & xử lý',
        title: 'Mô hình có sẵn',
        purpose: 'Bản nháp đa ngôn ngữ nhanh nhất, chạy trên CPU',
        licence: 'Giấy phép: MIT',
        download: 'Tải xuống',
      });

      const vietnameseText = await settings.evaluate(() => document.body.innerText);
      for (const english of [
        'Fastest multilingual drafts on CPU',
        'Balanced multilingual drafts on CPU',
        'Higher-accuracy multilingual recognition, Vietnamese included',
      ]) {
        assert.ok(
          !vietnameseText.includes(english),
          `a model described itself in English on the Vietnamese screen: ${english}`,
        );
      }

      for (const [width, height] of [
        [1420, 900],
        [1050, 700],
      ]) {
        await settings.setViewportSize({ width, height });
        await settings.screenshot({
          path: path.join(screenshots, `offered-models-vi-${width}x${height}.png`),
          fullPage: true,
        });
      }
    },
  );
});
