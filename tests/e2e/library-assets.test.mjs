import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
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
    'testsrc2=size=320x180:rate=30:duration=1',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    target,
  ]);
  return target;
}

async function attachSubtitle(page, application, filename) {
  await application.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, filename);
  await page.getByRole('button', { name: 'Choose a file to attach', exact: true }).click();
  await page.getByText(path.basename(filename), { exact: false }).first().waitFor();
}

test('Related-assets table search and sort apply to the whole list (UI-CM05)', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-library-assets-');
  const video = clip(temp, 'source-clip.mp4');
  const names = ['charlie.srt', 'alpha.srt', 'echo.srt', 'bravo.srt', 'delta.srt'];
  const files = [];
  for (const name of names) {
    const file = path.join(temp, name);
    await writeFile(file, `1\n00:00:00,000 --> 00:00:01,000\n${name}\n`);
    files.push(file);
  }
  await runElectronTest(
    { temp, userData, screenshotName: 'library-assets-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await application.evaluate(({ dialog }, target) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
      }, video);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('1 imported, 0 reused, 0 failed.', { exact: true }).waitFor();

      await page.getByRole('cell', { name: 'source-clip.mp4', exact: true }).click();
      const surface = page.getByRole('complementary', { name: 'source-clip.mp4' });
      await surface.waitFor();
      await surface.getByRole('button', { name: 'Related assets', exact: true }).click();

      await surface.getByRole('button', { name: 'Attach an existing file', exact: true }).click();
      await page.getByRole('combobox', { name: 'Asset type', exact: false }).nth(1).click();
      await page.getByRole('option', { name: 'Subtitles', exact: true }).click();
      for (const file of files) {
        await attachSubtitle(page, application, file);
      }
      await surface.getByText('5 assets', { exact: true }).waitFor();
      const firstRow = surface.locator('table tbody tr').first();

      const fileHeaderSort = surface
        .getByRole('columnheader', { name: 'File', exact: false })
        .getByRole('button')
        .first();
      await fileHeaderSort.click();
      await firstRow.getByText('alpha.srt', { exact: true }).waitFor();

      await fileHeaderSort.click();
      await firstRow.getByText('echo.srt', { exact: true }).waitFor();

      await surface.getByRole('textbox', { name: 'Find an asset or its content' }).fill('bravo');
      await firstRow.getByText('bravo.srt', { exact: true }).waitFor();
      assert.equal(await surface.locator('table tbody tr').count(), 1);

      await surface
        .getByRole('textbox', { name: 'Find an asset or its content' })
        .fill('nonexistent');
      await surface.getByText('No matching assets', { exact: true }).waitFor();
      await surface.getByRole('button', { name: 'Clear search', exact: true }).click();
      await firstRow.waitFor();
    },
  );
});
