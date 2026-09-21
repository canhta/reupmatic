import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { chooseLocale, waitForEditorReady } from './ui-actions.mjs';

function clip(temp, name, duration = 1) {
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

async function stubPicker(application, files) {
  await application.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, files);
}

test('one bad file among duplicates fails on its own, reused content is not re-imported, and originals stay untouched', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-library-import-');
  const original = clip(temp, 'vacation-clip.mp4');
  const duplicate = path.join(temp, 'vacation-clip-copy.mp4');
  await copyFile(original, duplicate);
  const corrupt = path.join(temp, 'broken-clip.mp4');
  await writeFile(corrupt, 'this is not a video file');
  const before = await stat(original);

  await runElectronTest(
    { temp, userData, screenshotName: 'library-import-failures.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();

      await stubPicker(application, [original, duplicate, corrupt]);
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('1 imported, 1 reused, 1 failed.', { exact: true }).waitFor();

      await page.getByText('Some files were not imported', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Expand', exact: true }).click();
      await page.getByText('broken-clip.mp4', { exact: false }).waitFor();

      await page.getByRole('cell', { name: 'vacation-clip.mp4', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('cell', { name: 'vacation-clip-copy.mp4', exact: true }).count(),
        0,
        'a reused import must not add a second row under the duplicate filename',
      );
      assert.equal(
        await page.getByRole('cell', { name: 'broken-clip.mp4', exact: true }).count(),
        0,
        'a failed import must not add a row at all',
      );

      await page.getByRole('checkbox', { name: 'Select vacation-clip.mp4', exact: true }).check();
      await page.getByText('1 selected', { exact: true }).waitFor();

      await chooseLocale(application, page, 'vi');
      // testsrc2 output is deterministic: a different duration avoids hash-matching the first fixture.
      const originalVi = clip(temp, 'clip-thu-hai.mp4', 2);
      const duplicateVi = path.join(temp, 'clip-thu-hai-ban-sao.mp4');
      await copyFile(originalVi, duplicateVi);
      const corruptVi = path.join(temp, 'clip-hong.mp4');
      await writeFile(corruptVi, 'khong phai video');
      await page.getByRole('button', { name: 'Nguồn & Thư viện', exact: true }).click();
      await stubPicker(application, [originalVi, duplicateVi, corruptVi]);
      await page.getByRole('button', { name: 'Nhập file trên máy', exact: true }).click();
      await page.getByText('Đã nhập 1, dùng lại 1, lỗi 1.', { exact: true }).waitFor();
      await page.getByText('Một số file chưa nhập được', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Mở rộng', exact: true }).click();
      await page.getByText('clip-hong.mp4', { exact: false }).waitFor();

      const after = await stat(original);
      assert.equal(after.mtimeMs, before.mtimeMs);
      assert.equal(after.size, before.size);
    },
  );
});

test('forgetting a Library item in a queued batch job is blocked; cancelling a forget leaves the item intact', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-library-forget-');
  // testsrc2 output is deterministic; two clips need different params to hash differently.
  const inUse = clip(temp, 'linked-clip.mp4', 1);
  const standalone = clip(temp, 'standalone-clip.mp4', 2);
  const output = path.join(temp, 'batch-output');
  await mkdir(output);
  await runElectronTest(
    { temp, userData, screenshotName: 'library-forget-blocked.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();

      await stubPicker(application, [inUse, standalone]);
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('2 imported, 0 reused, 0 failed.', { exact: true }).waitFor();

      // Queue stays 'queued': BatchQueue.wake() no-ops while paused, keeping pending_jobs stable.
      await page.getByRole('button', { name: 'Batch & jobs', exact: true }).click();
      await stubPicker(application, [inUse]);
      await page.getByRole('button', { name: 'Add videos', exact: true }).click();
      await application.evaluate(({ dialog }, dir) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
      }, output);
      await page.getByRole('button', { name: 'Choose output folder', exact: true }).click();
      await page.getByRole('button', { name: 'Add 1 video(s) to queue', exact: true }).click();
      await page.locator('[data-state="queued"]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#shared-jobs-tray').waitFor({ state: 'detached' });

      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      await page.getByRole('cell', { name: 'linked-clip.mp4', exact: true }).click();
      const inUseSurface = page.getByRole('complementary', { name: 'linked-clip.mp4' });
      await inUseSurface.waitFor();
      await inUseSurface.getByRole('button', { name: 'More actions', exact: true }).click();
      await inUseSurface
        .getByRole('button', { name: 'Remove library listing', exact: true })
        .click();
      const inUseConfirm = page.getByRole('alertdialog', { name: 'Confirm change', exact: true });
      await inUseConfirm.waitFor();
      await inUseConfirm.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByText('In use elsewhere — nothing was deleted.', { exact: true }).waitFor();
      await page.getByRole('cell', { name: 'linked-clip.mp4', exact: true }).waitFor();
      const snapshotAfterBlock = await page.evaluate(() => window.reupmatic.batchSnapshot());
      assert.equal(snapshotAfterBlock.ok, true);
      assert.equal(snapshotAfterBlock.data.items.length, 1);
      assert.equal(snapshotAfterBlock.data.items[0].state, 'queued');

      await inUseSurface
        .getByRole('button', { name: 'Remove library listing', exact: true })
        .click();
      await inUseConfirm.waitFor();
      await inUseConfirm.getByRole('button', { name: 'Cancel', exact: true }).click();
      await inUseConfirm.waitFor({ state: 'hidden' });
      await page.getByRole('cell', { name: 'linked-clip.mp4', exact: true }).waitFor();
      const snapshotAfterCancel = await page.evaluate(() => window.reupmatic.batchSnapshot());
      assert.equal(snapshotAfterCancel.data.items.length, 1);
      assert.equal(snapshotAfterCancel.data.items[0].state, 'queued');

      await page.keyboard.press('Escape');
      await inUseSurface.waitFor({ state: 'detached' });
      await page.getByRole('cell', { name: 'standalone-clip.mp4', exact: true }).click();
      const standaloneSurface = page.getByRole('complementary', { name: 'standalone-clip.mp4' });
      await standaloneSurface.waitFor();
      await standaloneSurface.getByRole('button', { name: 'More actions', exact: true }).click();
      await standaloneSurface
        .getByRole('button', { name: 'Remove library listing', exact: true })
        .click();
      const standaloneConfirm = page.getByRole('alertdialog', {
        name: 'Confirm change',
        exact: true,
      });
      await standaloneConfirm.waitFor();
      await standaloneConfirm.getByRole('button', { name: 'Cancel', exact: true }).click();
      await standaloneConfirm.waitFor({ state: 'hidden' });
      await page.getByRole('cell', { name: 'standalone-clip.mp4', exact: true }).waitFor();

      await standaloneSurface
        .getByRole('button', { name: 'Remove library listing', exact: true })
        .click();
      await standaloneConfirm.waitFor();
      await standaloneConfirm.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('cell', { name: 'standalone-clip.mp4', exact: true }).waitFor({
        state: 'detached',
      });
    },
  );
});
