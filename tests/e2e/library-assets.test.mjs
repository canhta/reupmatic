import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
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
  await page.getByRole('button', { name: 'Attach', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Subtitles', exact: true }).click();
  await page.getByText(path.basename(filename), { exact: false }).first().waitFor();
}

test('Related-assets search applies to the whole list (UI-CM05)', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-library-assets-');
  const video = clip(temp, 'source-clip.mp4');
  const names = ['charlie.srt', 'alpha.srt', 'echo.srt', 'bravo.srt', 'delta.srt', 'foxtrot.srt'];
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
      await surface.getByRole('heading', { name: 'Related assets', exact: true }).waitFor();
      for (const file of files) {
        await attachSubtitle(page, application, file);
      }
      const rows = surface.getByRole('listitem');
      await rows.nth(names.length - 1).waitFor();
      assert.equal(await rows.count(), names.length);

      const search = surface.getByRole('textbox', { name: 'Find an asset or its content' });
      await search.fill('bravo');
      await rows.getByText('bravo.srt', { exact: true }).waitFor();
      assert.equal(await rows.count(), 1);

      await search.fill('nonexistent');
      await surface.getByText('No matching assets', { exact: true }).waitFor();
      await search.fill('');
      await rows.nth(names.length - 1).waitFor();
    },
  );
});

test('removing the item whose related assets are open closes its drawer without a failed request', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-library-assets-remove-');
  const video = clip(temp, 'removed-clip.mp4');
  await runElectronTest(
    { temp, userData, screenshotName: 'library-assets-remove-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await application.evaluate(({ dialog }, target) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
      }, video);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('1 imported, 0 reused, 0 failed.', { exact: true }).waitFor();

      await page.getByRole('cell', { name: 'removed-clip.mp4', exact: true }).click();
      const surface = page.getByRole('complementary', { name: 'removed-clip.mp4' });
      await surface.getByRole('heading', { name: 'Related assets', exact: true }).waitFor();
      await surface.getByRole('button', { name: 'More actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Remove item?', exact: true });
      await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
      await surface.waitFor({ state: 'detached' });
      await page.getByRole('cell', { name: 'removed-clip.mp4', exact: true }).waitFor({
        state: 'detached',
      });

      const log = await readFile(
        path.join(userData, 'logs', 'reupmatic-diagnostics.ndjson'),
        'utf8',
      );
      const failures = log
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((record) => record.code === 'LIBRARY_ITEM_MISSING');
      assert.deepEqual(
        failures.map((record) => record.detail.operation),
        [],
        'the drawer asked for the removed item',
      );
    },
  );
});
