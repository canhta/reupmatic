// Real Electron/Playwright/CDP. Closes the verification gap left by ticket 06
// (cross-area-defects.md): Vietnamese IME composition and full keyboard
// tab-order traversal were not exercised beyond Escape and focus return.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { composeText } from './helpers/ime.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

test('Vietnamese IME composition commits diacritics in a search field and a record name field', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-ime-');
  await runElectronTest({ temp, userData, screenshotName: 'ime-failure.png' }, async ({ page }) => {
    // runElectronTest's own harness stubs the quit-confirmation dialog by
    // default now (electron-harness.mjs), so a dirty catalog draft (from
    // composing into the Name field below) no longer needs its own copy.
    await waitForEditorReady(page);

    // Search field: Sources & Library.
    await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'Search the library', exact: true });
    await search.waitFor();
    await composeText(page, search, 'Việt Nam');
    assert.equal(await search.inputValue(), 'Việt Nam');

    // Record name field: Channels & Affiliate's create surface.
    await page.getByRole('button', { name: 'Channels & Affiliate', exact: true }).click();
    await page.getByRole('button', { name: 'Add channel configuration', exact: true }).click();
    const name = page.getByRole('textbox', { name: 'Name', exact: true });
    await name.waitFor();
    await composeText(page, name, 'Kênh Tiếng Việt — Đà Nẵng');
    assert.equal(await name.inputValue(), 'Kênh Tiếng Việt — Đà Nẵng');
  });
});

test('Full keyboard tab order traverses sidebar, toolbar and a record workspace without traps', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-tab-order-');
  await runElectronTest(
    { temp, userData, screenshotName: 'tab-order-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Channels & Affiliate', exact: true }).click();

      // Start from a known point: the sidebar's Channels & Affiliate item.
      await page.locator('[data-workspace-area="channels"]').focus();
      const seen = [];
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        const described = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          return el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName;
        });
        seen.push(described);
      }

      // Every step landed on a real, described element — never lost to
      // <body> (a focus trap or an inert region swallowing Tab).
      assert.ok(
        seen.every((label) => label !== null),
        `focus should never fall back to <body>; saw: ${JSON.stringify(seen)}`,
      );

      // Reaching the list's search box proves the traversal actually
      // crosses from sidebar into the workspace content, not just around
      // the sidebar's own rows.
      assert.ok(
        seen.includes('INPUT'),
        `tab order should reach the toolbar's search box; saw: ${JSON.stringify(seen)}`,
      );

      // Toolbar uses Astryx's own documented roving-tabindex keyboard model
      // (Tab lands once on the group; arrow keys move within it), so its
      // primary action is reached with ArrowRight from the search box, not
      // a second Tab.
      await page.getByRole('textbox', { name: 'Search', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      const toolbarAction = await page.evaluate(() => document.activeElement?.textContent?.trim());
      assert.equal(toolbarAction, 'Add channel configuration');

      // Opening the record surface and tabbing forward through its fields
      // never loses focus to <body> either (Escape/close focus-return is
      // already covered by channels.test.mjs; this covers forward Tab
      // traversal through the open surface's own controls).
      await page.getByRole('button', { name: 'Add channel configuration', exact: true }).click();
      const surface = page.getByRole('complementary', { name: 'Add channel configuration' });
      await surface.waitFor();
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          return el.getAttribute('aria-label') || el.tagName;
        });
        assert.notEqual(label, null, `Tab step ${i} inside the open surface reached no control`);
      }
    },
  );
});
