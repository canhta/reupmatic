// SOURCE-ONLY until installed Electron/Playwright dependencies pass this gate.
// Native pickers are controlled fixture input. Renderer, IPC and settings storage
// are real; no mocked preferences or model state is substituted. Settings is a sidebar
// destination in the one main window now (D-57, superseding D-47's independent window) —
// these tests reach it via the sidebar's own utility-slot item (`openSettingsArea` in
// ui-actions.mjs), not a second Playwright Page. Categories are still a TabList (nav-landmark
// mode, aria-current), just hosted in the content column instead of the old window's toolbar
// band.
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

/** Full-page screenshots of the Settings destination, sidebar and all — the ticket's own
 * visual-pass requirement, not just the panel content offered-models.test.mjs and
 * speech-providers.test.mjs already cover. */
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

/** The selected category's content must start at or below the header/tab-strip band, never
 * under it — regression coverage for a Section `padding={0}` "edge-to-edge" bleed that once
 * pulled every row 16px past the window's own padded content box (see settings.css). */
async function assertContentClearsHeader(settingsPage, categoryLocator) {
  const header = await settingsPage.locator('.astryx-app-shell-header').boundingBox();
  const content = await categoryLocator.boundingBox();
  assert.ok(header && content, 'header and category content must both be visible');
  assert.ok(
    content.y >= header.y + header.height,
    `category content (top ${content.y}) must start at or below the header's bottom (${header.y + header.height})`,
  );
}

/** Exactly one tab carries the selected state — both the accessible marker (aria-current, since
 * this strip is a nav landmark, not a role="tablist") and the CSS marker the underline indicator
 * keys off (data-selected). Regression coverage for a visual "two tabs underlined" report that
 * turned out to be the same content-bleed bug visually overlapping the header. */
async function assertExactlyOneSelectedTab(categoriesLocator) {
  assert.equal(await categoriesLocator.locator('[aria-current="true"]').count(), 1);
  // Scoped to [data-tab-value] (the tab button itself): its own internal underline indicator
  // span also carries data-selected="selected" when selected, which would otherwise double-count
  // one real selection as two.
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
      // Settings is the sidebar's bottom-anchored utility item (D-57/D-46) — reachable
      // alongside the four peer areas, not a separate window.
      assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).count(), 1);

      const settings = await openSettingsArea(page);

      const categories = settings.getByRole('navigation', { name: 'Settings categories' });
      await categories.waitFor();
      // General is the default category: interface language is reachable
      // without an extra click, matching every other workspace.
      await settings.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).waitFor();
      const general = settings.getByLabel('General', { exact: true });
      await general.waitFor();

      // English, General: the sidebar's Settings item, the utility slot's placement, and the
      // default category — the empty/default state of the destination this ticket adds.
      await captureSettings(settings, 'en-general');

      // The tab strip is keyboard reachable and marks the current tab. Advanced is simply the
      // last tab (D-47) — not a separately-grouped rail entry — reached the same way as the rest.
      const generalTab = categories.getByRole('button', { name: 'General', exact: true });
      const processingTab = categories.getByRole('button', {
        name: 'AI & processing',
        exact: true,
      });
      const accountTab = categories.getByRole('button', { name: 'Account', exact: true });
      const advancedTab = categories.getByRole('button', { name: 'Advanced', exact: true });
      // TabList's nav-landmark mode marks the current tab with aria-current="true" (a tab role's
      // own aria-selected is for the WAI-ARIA tablist pattern this strip does not opt into).
      assert.equal(await generalTab.getAttribute('aria-current'), 'true');
      await assertExactlyOneSelectedTab(categories);
      await assertContentClearsHeader(settings, general);

      // Roving tabindex (WAI-ARIA tab-strip pattern): the strip is a single Tab stop, and
      // ArrowRight/ArrowLeft move focus tab-to-tab within it, ending on Advanced in document
      // order — proving all four are keyboard-reachable without a second, Tab-key-reachable
      // rail group. Arrow keys move focus only (manual activation); General stays selected.
      await generalTab.focus();
      await settings.keyboard.press('ArrowRight');
      assert.equal(await processingTab.evaluate((el) => el === document.activeElement), true);
      await settings.keyboard.press('ArrowRight');
      assert.equal(await accountTab.evaluate((el) => el === document.activeElement), true);
      await settings.keyboard.press('ArrowRight');
      assert.equal(await advancedTab.evaluate((el) => el === document.activeElement), true);
      await assertExactlyOneSelectedTab(categories);
      assert.equal(await generalTab.getAttribute('aria-current'), 'true');

      // Space activates the focused (Advanced) tab, a native <button>'s own keyboard behavior —
      // proving keyboard selection, not just click, keeps exactly one tab selected.
      await settings.keyboard.press('Space');
      assert.equal(await advancedTab.getAttribute('aria-current'), 'true');
      await assertExactlyOneSelectedTab(categories);
      const advancedByKeyboard = settings.getByLabel('Advanced', { exact: true });
      await advancedByKeyboard.waitFor();
      await assertContentClearsHeader(settings, advancedByKeyboard);

      // Back to General by click for the rest of this test.
      await generalTab.click();
      await general.waitFor();
      await assertExactlyOneSelectedTab(categories);

      // UI-T04: a category pane does not repeat its own selected category label as a
      // visible heading — the pane's aria-label (asserted via getByLabel above) carries
      // that for assistive tech instead.
      assert.equal(await general.getByRole('heading', { name: 'General', exact: true }).count(), 0);

      // Default export folder: pick, verify, clear, verify reverts.
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
      // No default now: the path is gone and Clear default disables itself. The row states no
      // placeholder — the two actions already carry it.
      await general.getByText(outputDir, { exact: false }).waitFor({ state: 'detached' });
      assert.equal(await clearDefault.isDisabled(), true);

      // AI & processing: concise per-model status rows, one setup action, and
      // a contextual error next to that action instead of repeated prose.
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

      // English, AI & processing: model/provider management's real main-screen space (the
      // catalogue list, the manifest setup error state, offered models and providers below).
      await captureSettings(settings, 'en-processing');

      // Account: one quiet row, no unavailable-service banner.
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

      // Advanced: the demoted category is itself ST-R02's collapsed area, so its runtime rows
      // are plain rows — no second disclosure to open first.
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

      // Interface language stays owned by General and only changes UI text — reaching the
      // rest of the app (e.g. the sidebar's own labels) through the same document now, not a
      // second window (D-57 removed the cross-window locale hop ui-actions.mjs used to need).
      await generalTab.click();
      await general.getByRole('combobox', { name: 'Language / Ngôn ngữ' }).click();
      await settings.getByRole('option', { name: 'Tiếng Việt' }).click();
      await settings.getByRole('button', { name: 'Chung', exact: true }).waitFor();
      await settings.getByText('Ngôn ngữ giao diện', { exact: true }).waitFor();
      assert.equal(await settings.getByRole('button', { name: 'Chung', exact: true }).count(), 1);
      await page.waitForFunction(() => document.documentElement.lang === 'vi');

      // Vietnamese ships with English, including the sidebar's own long labels ("Kênh &
      // Affiliate" beside the utility slot) and every category — General, then AI & processing.
      await captureSettings(settings, 'vi-general');
      const categoriesVi = settings.getByRole('navigation', { name: 'Danh mục thiết lập' });
      await categoriesVi.getByRole('button', { name: 'AI & xử lý', exact: true }).click();
      await settings.getByLabel('AI & xử lý', { exact: true }).waitFor();
      await captureSettings(settings, 'vi-processing');

      // Focus state: the sidebar's own utility-slot item carries a visible keyboard focus ring,
      // same as every other SideNavItem — not a display:none-only affordance.
      await settings.getByRole('button', { name: 'Cài đặt', exact: true }).focus();
      await captureSettings(settings, 'vi-sidebar-focus');
    },
  );
});

test('Electron Settings: a non-missing model code shows its own concise row status', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-settings-manifest-');
  // Seed the worker's saved manifest with a structurally invalid document before
  // launch: worker/vision/models.py's ModelRegistry._read() raises
  // MODEL_MANIFEST_INVALID for both kinds at the same models.status() call the
  // default "Not configured" (MODEL_MISSING) state uses, exercising a real,
  // harness-producible non-missing code end to end (not just the empty default).
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
      // OCR and object removal share the one corrupted vision manifest seeded above, so both
      // name the fault rather than falling back to silence. Speech, translation and TTS each own
      // a separate manifest untouched by this seed, so those three rows are simply unconfigured
      // and state nothing beside the setup action that already says so.
      assert.equal(await processing.getByText('Manifest invalid').count(), 2);
      assert.equal(await processing.getByText('Not configured').count(), 0);
    },
  );
});
