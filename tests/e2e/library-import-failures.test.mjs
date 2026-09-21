// Real Electron/Playwright dependencies. Native pickers are controlled fixture
// input; renderer, IPC, library storage, the real worker and real FFmpeg/ffprobe
// are not mocked — a corrupt file is rejected by the real probe, not a stub.
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

      // Import opens the native picker directly — no options step in front of
      // it (D-50) — with three files: one new, one byte-identical duplicate,
      // and one that fails a real ffprobe read.
      await stubPicker(application, [original, duplicate, corrupt]);
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('1 imported, 1 reused, 1 failed.', { exact: true }).waitFor();

      // The failure is named, not swallowed, and the other two files still
      // completed — only the corrupt one is reported. The failure list sits
      // behind the Banner's own collapse/expand disclosure, collapsed by default.
      await page.getByText('Some files were not imported', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Expand', exact: true }).click();
      await page.getByText('broken-clip.mp4', { exact: false }).waitFor();

      // Reused content does not create a second catalogue entry: only the
      // original's row exists, never one under the duplicate's filename.
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

      // The successful import stays usable: its row is a normal, selectable item.
      await page.getByRole('checkbox', { name: 'Select vacation-clip.mp4', exact: true }).check();
      await page.getByText('1 selected', { exact: true }).waitFor();

      // Vietnamese: the same summary, phrased in that locale, for a second
      // (independent) duplicate + failure import.
      await chooseLocale(application, page, 'vi');
      // Distinct duration: FFmpeg's synthetic testsrc2 output is deterministic,
      // so reusing duration=1 here would hash-match the English fixture above
      // and get reused against it instead of exercising a fresh import.
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

      // Reference-mode import never rewrites, moves or copies the original bytes.
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
  // FFmpeg's synthetic testsrc2 output is fully deterministic (no timestamps
  // muxed in), so two clips need different parameters to get different
  // content — same duration/size would hash identically and collapse into
  // one reused item instead of two independent Library entries.
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

      // Queue the same content as a batch job, but never start the queue —
      // it stays 'queued' (BatchQueue.wake() no-ops while paused), so the
      // Library's pending_jobs dependency stays real and stable to assert.
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

      // Forgetting the item the queued job depends on: the confirmation gates
      // the action, and the backend blocks removal before anything happens.
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
      // The queued job itself is untouched by the blocked forget.
      const snapshotAfterBlock = await page.evaluate(() => window.reupmatic.batchSnapshot());
      assert.equal(snapshotAfterBlock.ok, true);
      assert.equal(snapshotAfterBlock.data.items.length, 1);
      assert.equal(snapshotAfterBlock.data.items[0].state, 'queued');

      // Cancelling the same item's confirmation (instead of confirming into a
      // block) never reaches the backend at all — the item and its queued job
      // stay exactly as untouched as the blocked-Continue case above.
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

      // A plain item (no dependents): cancelling the confirmation removes
      // nothing, and confirming it afterwards does remove it.
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

      // "More actions" is still expanded from the cancelled attempt above.
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
