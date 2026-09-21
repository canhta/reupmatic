// Verifies the runtime behaviour ticket 13 could not tick from code alone: that right-click and
// the keyboard actually open the menu, that the selection-vs-row distinction is right, and that
// Escape closes it. Renderer, IPC and FFmpeg are real; only the native picker is fixture input.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

/** Distinct durations: identical size/rate/duration clips are byte-identical and would dedupe. */
function clip(temp, name, duration) {
  const target = path.join(temp, name);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=320x180:rate=30:duration=${duration}`,
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    target,
  ]);
  return target;
}

test('Library rows carry every command in a context menu, by pointer and by keyboard', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-ctxmenu-');
  const first = clip(temp, 'harbour-clip.mp4', 2);
  const second = clip(temp, 'market-clip.mp4', 3);
  await runElectronTest(
    { temp, userData, screenshotName: 'library-context-menu-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();

      await application.evaluate(
        ({ dialog }, files) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
        },
        [first, second],
      );
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('2 imported, 0 reused, 0 failed.', { exact: true }).waitFor();

      const row = page.getByRole('cell', { name: 'harbour-clip.mp4', exact: true });
      await row.waitFor();

      // Pointer: every row command is present, including the destructive one.
      await row.click({ button: 'right' });
      const menu = page.getByRole('menu');
      await menu.waitFor();
      for (const command of ['Open in Editor', 'Show in folder', 'Remove library listing']) {
        assert.equal(
          await menu.getByRole('menuitem', { name: command, exact: true }).count(),
          1,
          `context menu is missing "${command}"`,
        );
      }
      // An available source offers no relink; that command is conditional, not always-on.
      assert.equal(
        await menu.getByRole('menuitem', { name: 'Locate moved source', exact: true }).count(),
        0,
        'relink is offered for a source that is not missing or changed',
      );

      // Escape closes it and nothing was invoked.
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      await page.getByRole('cell', { name: 'harbour-clip.mp4', exact: true }).waitFor();

      // Keyboard: Chromium maps Shift+F10 and the context-menu key to a `contextmenu` event on
      // the focused element, but Playwright dispatches keys through CDP and that mapping is the
      // browser's own, not reachable from a synthetic key event. So this asserts the half we
      // actually own: a keyboard-originated `contextmenu` event — no mouse, no coordinates —
      // arriving at a focused row opens the same menu with the same commands. The key mapping
      // itself is Chromium's and is not exercised here.
      await page.locator('tr.library-row').first().focus();
      await page.locator('tr.library-row').first().dispatchEvent('contextmenu');
      await page.getByRole('menu').waitFor();
      assert.ok(
        (await page
          .getByRole('menu')
          .getByRole('menuitem', { name: 'Open in Editor', exact: true })
          .count()) > 0,
        'a keyboard-originated context menu carries no row commands',
      );
      await page.keyboard.press('Escape');
      await page.getByRole('menu').waitFor({ state: 'hidden' });

      // Selection scope: with both rows selected, right-clicking one of them acts on the
      // selection, not on the single row under the cursor.
      const checkboxes = page.locator('#library-panel tbody input[type="checkbox"]');
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
      await page.getByRole('cell', { name: 'harbour-clip.mp4', exact: true }).click({
        button: 'right',
      });
      const selectionMenu = page.getByRole('menu');
      await selectionMenu.waitFor();
      assert.equal(
        await selectionMenu.getByRole('menuitem', { name: 'Clear selection', exact: true }).count(),
        1,
        'a multi-row selection does not offer its own commands',
      );
      assert.equal(
        await selectionMenu.getByRole('menuitem', { name: 'Open in Editor', exact: true }).count(),
        0,
        'a multi-row selection still offers single-row commands',
      );
      await page.keyboard.press('Escape');
    },
  );
});
