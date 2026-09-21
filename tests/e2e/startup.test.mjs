import assert from 'node:assert/strict';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { openSettingsArea, waitForEditorReady } from './ui-actions.mjs';

test('Electron reaches its first usable window', { timeout: 15_000 }, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-startup-');
  await runElectronTest({ temp, userData }, async ({ page }) => {
    await waitForEditorReady(page);
    // The window title mirrors the toolbar: the open document/video name, or
    // the current area name when none is open — never the bare app name.
    assert.equal(await page.title(), 'Editor');
  });
});

test('studio shell keeps navigation and shared jobs available at the minimum window size', {
  timeout: 30_000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-shell-');
  await runElectronTest({ temp, userData }, async ({ page }) => {
    page.setDefaultTimeout(3_000);
    await page.setViewportSize({ width: 1050, height: 700 });

    // Settings is the sidebar's separated, bottom-anchored utility item (D-57/D-46), reachable
    // at the minimum window width same as the four peer areas.
    const areas = ['Sources & Library', 'Editor', 'Channels & Affiliate', 'Automation', 'Settings'];
    for (const area of areas) {
      await page.getByRole('button', { name: area, exact: true }).click();
    }

    const jobs = page.getByRole('button', { name: 'Batch & jobs', exact: true });
    await jobs.click();
    const tray = page.getByRole('complementary', { name: 'Batch & jobs' });
    await tray.waitFor();
    const close = tray.getByRole('button', { name: 'Close jobs' });
    assert.equal(await close.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press('Escape');
    assert.equal(await jobs.evaluate((element) => document.activeElement === element), true);

    // Settings is a sidebar destination now (D-57), not a second window; a locale change there
    // reaches the rest of the app through the same document/preferences path it always used.
    const settings = await openSettingsArea(page);
    const settingsGeneral = settings.getByLabel('General');
    await settingsGeneral.getByRole('combobox', { name: 'Language / Ngôn ngữ' }).click();
    await settings.getByRole('option', { name: 'Tiếng Việt' }).click();
    await page.getByRole('button', { name: 'Xử lý lô & tác vụ', exact: true }).waitFor();

    const overflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    }));
    assert.deepEqual(overflow, { horizontal: false, vertical: false });
  });
});
