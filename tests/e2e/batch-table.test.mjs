// Real Electron/Playwright dependencies. Native pickers are controlled
// fixture input. Renderer, IPC, FFmpeg and the local queue are real; no
// mocked batch storage.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

function clip(temp, name) {
  const target = path.join(temp, name);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=12:duration=1',
    '-c:v',
    'libx264',
    '-threads',
    '1',
    '-n',
    target,
  ]);
  return target;
}

test('Batch queue table search and sort apply to the whole queue (UI-CM05)', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-batch-table-');
  // Created out of alphabetical order so a default (queue-position) render
  // is distinguishable from an explicit ascending-name sort.
  const names = ['charlie.mp4', 'alpha.mp4', 'bravo.mp4'];
  const clips = names.map((name) => clip(temp, name));
  const output = path.join(temp, 'export');
  await mkdir(output);
  await runElectronTest(
    { temp, userData, screenshotName: 'batch-table-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      const pending = [clips, [output]];
      await application.evaluate(({ dialog }, files) => {
        dialog.showOpenDialog = async () => {
          const chosen = files.shift();
          if (!chosen) throw new Error('Unexpected native picker request in test');
          return { canceled: false, filePaths: chosen };
        };
      }, pending);

      await page.getByRole('button', { name: 'Batch & jobs', exact: true }).click();
      await page.getByRole('button', { name: 'Add videos', exact: true }).click();
      await page.getByRole('button', { name: 'Choose output folder', exact: true }).click();
      await page.getByText(output, { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Add 3 video(s) to queue', exact: true }).click();

      const table = page.locator('.batch-workspace .batch-scroll table tbody tr');
      await table.first().waitFor();
      assert.equal(await table.count(), 3);

      // Default order is queue/admission order (charlie, alpha, bravo), not
      // an alphabetical one.
      await table.first().getByText('charlie.mp4', { exact: false }).waitFor();

      // Sort ascending by Video: the whole queue reorders.
      await page
        .locator('.batch-workspace')
        .getByRole('columnheader', { name: 'Video', exact: false })
        .getByRole('button')
        .first()
        .click();
      await table.first().getByText('alpha.mp4', { exact: false }).waitFor();

      // Search narrows the whole queue.
      await page
        .locator('.batch-workspace')
        .getByRole('textbox', { name: 'Search', exact: true })
        .fill('bravo');
      await table.first().getByText('bravo.mp4', { exact: false }).waitFor();
      assert.equal(await table.count(), 1);

      // No match: a no-results state distinct from the empty state.
      await page
        .locator('.batch-workspace')
        .getByRole('textbox', { name: 'Search', exact: true })
        .fill('nonexistent');
      await page.getByText('No matching jobs', { exact: true }).waitFor();
      await page
        .locator('.batch-workspace')
        .getByRole('button', { name: 'Clear search', exact: true })
        .click();
      await table.first().waitFor();
    },
  );
});
