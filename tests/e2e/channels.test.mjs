import assert from 'node:assert/strict';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { chooseLocale, clickMenuItem, waitForEditorReady } from './ui-actions.mjs';

test('Electron Channels & Affiliate list/detail, explicit create mode, and posts draft', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-channels-');
  await runElectronTest(
    { temp, userData, screenshotName: 'channels-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);

      await page.getByRole('button', { name: 'Channels & Affiliate', exact: true }).click();

      await page.getByText('No channel configurations', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('heading', { name: 'Add channel configuration' }).count(),
        0,
      );
      const listWidthClosed = await page
        .locator('#channels-panel .business-list')
        .evaluate((el) => el.clientWidth);

      await page.getByRole('button', { name: 'Add channel configuration', exact: true }).click();
      const surface = page.getByRole('complementary', { name: 'Add channel configuration' });
      await surface.waitFor();
      const focusedInSurface = await page.evaluate(
        () => document.activeElement?.closest('.detail-surface') !== null,
      );
      assert.equal(focusedInSurface, true);
      const listWidthOpen = await page
        .locator('#channels-panel .business-list')
        .evaluate((el) => el.clientWidth);
      assert.ok(
        listWidthOpen < listWidthClosed,
        'the list keeps full width only while the detail surface is closed',
      );

      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Main YouTube');
      await page
        .getByRole('textbox', { name: 'Channel or Page URL', exact: true })
        .fill('https://youtube.com/@example');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByRole('cell', { name: 'Main YouTube', exact: false }).waitFor();
      await page
        .getByRole('complementary', { name: 'Add channel configuration' })
        .waitFor({ state: 'detached' });
      const restoredFocus = await page.evaluate(
        () => document.activeElement?.textContent === 'Add channel configuration',
      );
      assert.equal(restoredFocus, true);
      await page.getByText('Not connected', { exact: true }).waitFor();
      await page.getByText('No upcoming post', { exact: true }).waitFor();
      assert.equal(await page.getByText('Local configuration only', { exact: true }).count(), 0);

      const searchBox = page.getByRole('textbox', { name: 'Search', exact: true });
      await searchBox.waitFor();
      assert.equal(await searchBox.getAttribute('placeholder'), 'Search channels…');
      await page.getByText('1 channel', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Go to previous page' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Go to next page' }).count(), 0);

      await page.getByRole('button', { name: 'Main YouTube', exact: true }).click();
      await page.getByRole('complementary', { name: 'Edit channel configuration' }).waitFor();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Main YouTube — draft');
      await page.keyboard.press('Escape');
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Discard', exact: true })
        .click();
      await page
        .getByRole('complementary', { name: 'Edit channel configuration' })
        .waitFor({ state: 'detached' });

      await page.getByRole('tab', { name: 'Affiliate links', exact: true }).click();
      assert.equal(await page.getByRole('heading', { name: 'Add manual link' }).count(), 0);
      await page.getByRole('button', { name: 'Add manual link', exact: true }).click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Shopee promo');
      await page
        .getByRole('textbox', { name: 'Original affiliate URL', exact: true })
        .fill('https://shopee.example/aff?ref=1');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByRole('cell', { name: 'Shopee promo', exact: false }).waitFor();
      await page
        .getByRole('complementary', { name: 'Add manual link' })
        .waitFor({ state: 'detached' });

      await page.getByRole('tab', { name: 'Posts & plans', exact: true }).click();
      assert.equal(
        await page.getByRole('heading', { name: 'Create destination draft' }).count(),
        0,
      );
      assert.equal(
        await page.getByText('Drafts and plans, not automatic publishing', { exact: true }).count(),
        0,
      );
      await page.getByRole('button', { name: 'Create destination draft', exact: true }).click();
      await page.getByRole('complementary', { name: 'Create destination draft' }).waitFor();
      await page.getByRole('combobox', { name: 'Destination', exact: true }).waitFor();
      const saveDraft = page.getByRole('button', { name: 'Save changes', exact: true });
      assert.equal(await saveDraft.isDisabled(), true);

      await page.getByRole('button', { name: 'Close Create destination draft' }).click();
      await page
        .getByRole('complementary', { name: 'Create destination draft' })
        .waitFor({ state: 'detached' });

      await clickMenuItem(application, 'Channels', 'New Post…');
      await page.getByRole('complementary', { name: 'Create destination draft' }).waitFor();
      await page.getByRole('textbox', { name: 'Post title', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page
        .getByRole('complementary', { name: 'Create destination draft' })
        .waitFor({ state: 'detached' });

      await chooseLocale(application, page, 'vi');
      await page.getByRole('button', { name: 'Kênh & Affiliate', exact: true }).click();
      await page.getByRole('tab', { name: 'Cấu hình kênh', exact: true }).click();
      await page.getByRole('cell', { name: 'Main YouTube', exact: false }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Sửa cấu hình kênh' }).count(), 0);
    },
  );
});

test('Channel table search, sort and pagination apply to the whole data set (UI-CM05)', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-channels-table-');
  await runElectronTest(
    { temp, userData, screenshotName: 'channels-table-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      await page.evaluate(async () => {
        for (let i = 1; i <= 30; i++) {
          const n = String(i).padStart(2, '0');
          await window.reupmatic.channelSave({
            id: crypto.randomUUID(),
            expected_revision: null,
            name: `Zebra ${n}`,
            platform: i % 2 === 0 ? 'youtube' : 'facebook_page',
            url: `https://example.com/zebra-${n}`,
            label_ids: [],
            archived: false,
          });
        }
      });
      await page.getByRole('button', { name: 'Channels & Affiliate', exact: true }).click();
      await page.getByText('1–25 of 30', { exact: true }).waitFor();

      const firstRow = page.locator('#channels-panel table tbody tr').first();
      await firstRow.getByText('Zebra 01', { exact: true }).waitFor();

      await page
        .locator('#channels-panel')
        .getByRole('columnheader', { name: 'Name', exact: false })
        .getByRole('button')
        .first()
        .click();
      await firstRow.getByText('Zebra 30', { exact: true }).waitFor();

      await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
      await firstRow.getByText('Zebra 05', { exact: true }).waitFor();

      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Zebra 02');
      await firstRow.getByText('Zebra 02', { exact: true }).waitFor();
      assert.equal(await page.locator('#channels-panel table tbody tr').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Go to next page' }).count(), 0);
    },
  );
});

test('Affiliate link table sort and search apply to the whole data set (UI-CM05)', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-affiliate-table-');
  await runElectronTest(
    { temp, userData, screenshotName: 'affiliate-table-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      await page.evaluate(async () => {
        for (let i = 1; i <= 30; i++) {
          const n = String(i).padStart(2, '0');
          await window.reupmatic.affiliateSave({
            id: crypto.randomUUID(),
            expected_revision: null,
            name: `Promo ${n}`,
            url: `https://shop.example/promo-${n}`,
            label_ids: [],
            archived: false,
          });
        }
      });
      await page.getByRole('button', { name: 'Channels & Affiliate', exact: true }).click();
      await page.getByRole('tab', { name: 'Affiliate links', exact: true }).click();
      await page.getByText('1–25 of 30', { exact: true }).waitFor();

      const firstRow = page.locator('#affiliate-panel table tbody tr').first();
      await firstRow.getByText('Promo 01', { exact: true }).waitFor();

      await page
        .locator('#affiliate-panel')
        .getByRole('columnheader', { name: 'Name', exact: false })
        .getByRole('button')
        .first()
        .click();
      await firstRow.getByText('Promo 30', { exact: true }).waitFor();

      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Promo 15');
      await firstRow.getByText('Promo 15', { exact: true }).waitFor();
      assert.equal(await page.locator('#affiliate-panel table tbody tr').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Go to next page' }).count(), 0);
    },
  );
});
