import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { openSettingsArea, waitForEditorReady } from './ui-actions.mjs';

const SCREEN_SIZES = [
  [1420, 900],
  [1050, 700],
];

async function captureSettings(settingsPage, name) {
  const screenshots = path.join(root, '.test-artifacts');
  await mkdir(screenshots, { recursive: true });
  await settingsPage.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of SCREEN_SIZES) {
    await settingsPage.setViewportSize({ width, height });
    await settingsPage.screenshot({
      path: path.join(screenshots, `settings-${name}-${width}x${height}.png`),
      fullPage: true,
    });
  }
}

async function assertContentClearsHeader(settingsPage, categoryLocator) {
  const header = await settingsPage.locator('.astryx-app-shell-header').boundingBox();
  const content = await categoryLocator.boundingBox();
  assert.ok(header && content, 'header and category content must both be visible');
  assert.ok(
    content.y >= header.y + header.height,
    `category content (top ${content.y}) must start at or below the header's bottom (${header.y + header.height})`,
  );
}

async function assertExactlyOneSelectedTab(categoriesLocator) {
  assert.equal(await categoriesLocator.locator('[aria-current="true"]').count(), 1);
  // Scope to [data-tab-value]: its inner indicator span also carries data-selected.
  assert.equal(
    await categoriesLocator.locator('[data-tab-value][data-selected="selected"]').count(),
    1,
  );
}

test('Electron Settings: category navigation, default folder, and honest model states', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-settings-');
  const outputDir = path.join(temp, 'exports');
  const badManifest = path.join(temp, 'bad-manifest.json');
  await mkdir(outputDir);
  await writeFile(badManifest, JSON.stringify({ not: 'a real manifest' }));
  await runElectronTest(
    { temp, userData, screenshotName: 'settings-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).count(), 1);

      const settings = await openSettingsArea(page);

      const categories = settings.getByRole('navigation', { name: 'Settings categories' });
      await categories.waitFor();
      await settings.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).waitFor();
      const general = settings.getByLabel('General', { exact: true });
      await general.waitFor();

      await captureSettings(settings, 'en-general');

      const generalTab = categories.getByRole('button', { name: 'General', exact: true });
      const processingTab = categories.getByRole('button', {
        name: 'AI & processing',
        exact: true,
      });
      const accountTab = categories.getByRole('button', { name: 'Account', exact: true });
      const advancedTab = categories.getByRole('button', { name: 'Advanced', exact: true });
      assert.equal(await generalTab.getAttribute('aria-current'), 'true');
      await assertExactlyOneSelectedTab(categories);
      await assertContentClearsHeader(settings, general);

      await generalTab.focus();
      await settings.keyboard.press('ArrowRight');
      assert.equal(await processingTab.evaluate((el) => el === document.activeElement), true);
      await settings.keyboard.press('ArrowRight');
      assert.equal(await accountTab.evaluate((el) => el === document.activeElement), true);
      await settings.keyboard.press('ArrowRight');
      assert.equal(await advancedTab.evaluate((el) => el === document.activeElement), true);
      await assertExactlyOneSelectedTab(categories);
      assert.equal(await generalTab.getAttribute('aria-current'), 'true');

      await settings.keyboard.press('Space');
      assert.equal(await advancedTab.getAttribute('aria-current'), 'true');
      await assertExactlyOneSelectedTab(categories);
      const advancedByKeyboard = settings.getByLabel('Advanced', { exact: true });
      await advancedByKeyboard.waitFor();
      await assertContentClearsHeader(settings, advancedByKeyboard);

      await generalTab.click();
      await general.waitFor();
      await assertExactlyOneSelectedTab(categories);

      assert.equal(await general.getByRole('heading', { name: 'General', exact: true }).count(), 0);

      const pending = [[outputDir], [badManifest]];
      await application.evaluate(({ dialog }, files) => {
        dialog.showOpenDialog = async () => {
          const chosen = files.shift();
          if (!chosen) throw new Error('Unexpected native picker request in test');
          return { canceled: false, filePaths: chosen };
        };
      }, pending);
      await general.getByRole('button', { name: 'Choose default folder', exact: true }).click();
      await general.getByText(outputDir, { exact: false }).waitFor();
      const clearDefault = general.getByRole('button', { name: 'Clear default', exact: true });
      await clearDefault.click();
      await general.getByText(outputDir, { exact: false }).waitFor({ state: 'detached' });
      assert.equal(await clearDefault.isDisabled(), true);

      await processingTab.click();
      const processing = settings.getByLabel('AI & processing', { exact: true });
      await processing.waitFor();
      await processing.getByRole('heading', { name: 'Speech, translation and voices' }).waitFor();
      assert.equal(await processingTab.getAttribute('aria-current'), 'true');
      await assertExactlyOneSelectedTab(categories);
      await assertContentClearsHeader(settings, processing);
      assert.equal(await processing.getByText('Object removal', { exact: true }).count(), 1);
      assert.equal(
        await settings.getByText('Nothing downloads or runs yet', { exact: false }).count(),
        0,
      );
      await processing.getByRole('button', { name: 'Choose model manifest…', exact: true }).click();
      await processing.getByText('Setup failed', { exact: false }).waitFor();

      await captureSettings(settings, 'en-processing');

      await accountTab.click();
      const account = settings.getByLabel('Account', { exact: true });
      await account.getByText('Not connected', { exact: true }).waitFor();
      assert.equal(await accountTab.getAttribute('aria-current'), 'true');
      await assertExactlyOneSelectedTab(categories);
      await assertContentClearsHeader(settings, account);
      assert.equal(await settings.getByRole('alert').count(), 0);
      assert.equal(
        await settings
          .getByText('Account and plan services are not connected', { exact: false })
          .count(),
        0,
      );

      await advancedTab.click();
      const advanced = settings.getByLabel('Advanced', { exact: true });
      await advanced.waitFor();
      assert.equal(await advancedTab.getAttribute('aria-current'), 'true');
      await assertExactlyOneSelectedTab(categories);
      await assertContentClearsHeader(settings, advanced);
      await settings.getByRole('heading', { name: 'Runtime details', exact: true }).waitFor();
      assert.equal(
        await settings.getByText('Application version', { exact: true }).first().isVisible(),
        true,
      );

      await generalTab.click();
      await general.getByRole('combobox', { name: 'Language / Ngôn ngữ' }).click();
      await settings.getByRole('option', { name: 'Tiếng Việt' }).click();
      await settings.getByRole('button', { name: 'Chung', exact: true }).waitFor();
      await settings.getByText('Ngôn ngữ giao diện', { exact: true }).waitFor();
      assert.equal(await settings.getByRole('button', { name: 'Chung', exact: true }).count(), 1);
      await page.waitForFunction(() => document.documentElement.lang === 'vi');

      await captureSettings(settings, 'vi-general');
      const categoriesVi = settings.getByRole('navigation', { name: 'Danh mục thiết lập' });
      await categoriesVi.getByRole('button', { name: 'AI & xử lý', exact: true }).click();
      await settings.getByLabel('AI & xử lý', { exact: true }).waitFor();
      await captureSettings(settings, 'vi-processing');

      await settings.getByRole('button', { name: 'Cài đặt', exact: true }).focus();
      await captureSettings(settings, 'vi-sidebar-focus');
    },
  );
});

test('Electron Settings: a non-missing model code shows its own concise row status', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-settings-manifest-');
  // Exercises a real MODEL_MANIFEST_INVALID code, not the empty default.
  const workerWorkspace = path.join(userData, 'integration-workspace');
  await mkdir(workerWorkspace, { recursive: true });
  await writeFile(
    path.join(workerWorkspace, 'local-models.json'),
    JSON.stringify({ not: 'a real manifest' }),
  );
  await runElectronTest(
    { temp, userData, screenshotName: 'settings-manifest-invalid-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      const settings = await openSettingsArea(page);
      await settings
        .getByRole('navigation', { name: 'Settings categories' })
        .getByRole('button', { name: 'AI & processing', exact: true })
        .click();
      const processing = settings.getByLabel('AI & processing', { exact: true });
      await processing.getByText('Manifest invalid').first().waitFor();
      assert.equal(await processing.getByText('Manifest invalid').count(), 2);
      assert.equal(await processing.getByText('Not configured').count(), 0);
    },
  );
});
