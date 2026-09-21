// SOURCE-ONLY until installed Electron/runtime/FFmpeg gates are exercised.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { pythonExecutable } from '../../scripts/python.mjs';
import { chooseLocale, waitForEditorReady } from './ui-actions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const locale of ['en', 'vi']) {
  test(`Electron local batch output and persistent history (${locale})`, {
    timeout: 120000,
  }, async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-batch-e2e-'));
    const dir = await realpath(temporary),
      output = path.join(dir, 'bản xuất'),
      userData = path.join(dir, 'app-data');
    await mkdir(output);
    await mkdir(userData);
    const video = path.join(dir, 'video tự quay.mp4');
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
      video,
    ]);
    const launch = () =>
      electron.launch({
        cwd: root,
        args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'tests/e2e/launch.mjs'],
        env: { ...process.env, REUPMATIC_TEST_USER_DATA: userData, PYTHON: pythonExecutable(root) },
      });
    let application;
    try {
      application = await launch();
      const page = await application.firstWindow();
      await waitForEditorReady(page);
      await application.evaluate(
        ({ dialog }, choices) => {
          const pending = [[choices.video], [choices.output]];
          dialog.showOpenDialog = async () => {
            const files = pending.shift();
            if (!files) throw new Error('Unexpected picker');
            return { canceled: false, filePaths: files };
          };
        },
        { video, output },
      );
      await chooseLocale(application, page, locale);
      const labels =
        locale === 'vi'
          ? {
              panel: 'Xử lý lô & tác vụ',
              add: 'Thêm video',
              folder: 'Chọn thư mục xuất',
              enqueue: 'Thêm 1 video vào hàng đợi',
              start: 'Chạy hàng đợi',
            }
          : {
              panel: 'Batch & jobs',
              add: 'Add videos',
              folder: 'Choose output folder',
              enqueue: 'Add 1 video(s) to queue',
              start: 'Start queue',
            };
      await page.getByRole('button', { name: labels.panel, exact: true }).click();
      await page.getByRole('button', { name: labels.add, exact: true }).click();
      await page.getByRole('button', { name: labels.folder, exact: true }).click();
      await page.getByRole('button', { name: labels.enqueue, exact: true }).click();
      await page.locator('[data-state="queued"]').waitFor();
      await page.getByRole('button', { name: labels.start, exact: true }).click();
      const row = page.locator('[data-state="complete"]');
      await row.waitFor({ timeout: 60000 });
      const jobId = await row.getAttribute('data-job-id');
      const files = await readdir(output);
      assert.equal(files.length, 1);
      assert.match(files[0], /\.mp4$/);
      await application.close();
      application = await launch();
      const restored = await application.firstWindow();
      await restored.getByRole('button', { name: labels.panel, exact: true }).waitFor();
      await restored.getByRole('button', { name: labels.panel, exact: true }).click();
      await restored.locator(`[data-job-id="${jobId}"][data-state="complete"]`).waitFor();
      const snapshot = await restored.evaluate(() => window.reupmatic.batchSnapshot());
      assert.equal(snapshot.ok, true);
      assert.equal(snapshot.data.paused, true);
      assert.equal(snapshot.data.items[0].attempt, 1);
      assert.deepEqual(await readdir(output), files);
    } finally {
      if (application) await application.close();
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
