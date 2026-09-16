// SOURCE-ONLY until installed Electron/Playwright dependencies pass this gate.
// Native pickers are controlled fixture input. Renderer, IPC, worker and FFmpeg
// are real; no mocked media, rendering, subtitle library or AI is substituted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { pythonExecutable } from '../../scripts/python.mjs';
import { chooseLocale } from './ui-actions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const locale of ['en', 'vi']) {
  test(`Electron editing, real render and project reopen (${locale})`, {
    timeout: 120000,
  }, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-e2e-'));
    const video = path.join(temp, 'video tự quay.mp4');
    const srt = path.join(temp, 'phụ đề.srt');
    const project = path.join(temp, 'bản dựng.reupmatic.json');
    const userData = path.join(temp, 'user-data');
    await mkdir(userData);
    // Missing native/subtitle dependencies fail this test; no silent skip.
    execFileSync(pythonExecutable(root), ['-c', 'import pysubs2']);
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=30:duration=4',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-n',
      video,
    ]);
    await writeFile(srt, '1\n00:00:00,200 --> 00:00:03,800\nTiếng Việt — English\n');
    let application;
    let page;
    const errors = [];
    try {
      application = await electron.launch({
        cwd: root,
        args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'tests/e2e/launch.mjs'],
        env: { ...process.env, REUPMATIC_TEST_USER_DATA: userData, PYTHON: pythonExecutable(root) },
      });
      page = await application.firstWindow();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.getByRole('button', { name: 'Open video', exact: true }).waitFor();
      const capabilities = await page.evaluate(() => window.reupmatic.hello());
      assert.equal(capabilities.ok, true);
      assert.equal(capabilities.data.pysubs2, true);
      assert.equal(capabilities.data.ffmpeg, true);
      await application.evaluate(
        ({ dialog }, files) => {
          const pending = [files.video, files.srt, files.project, files.video];
          dialog.showOpenDialog = async () => {
            const filename = pending.shift();
            if (!filename) throw new Error('Unexpected native file request in test');
            return { canceled: false, filePaths: [filename] };
          };
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.project });
          dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
        },
        { video, srt, project },
      );
      await page.getByRole('button', { name: 'Open video', exact: true }).click();
      await page.getByRole('button', { name: 'Import SRT', exact: true }).click();
      const text = page.getByRole('textbox', { name: 'Text 1', exact: true });
      await text.waitFor();
      await text.fill('Cà phê Việt Nam — changed');
      await page.getByRole('spinbutton', { name: 'Start (seconds) 1', exact: true }).fill('0.5');
      await text.focus();
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.equal(
        await page.getByRole('spinbutton', { name: 'Start (seconds) 1', exact: true }).inputValue(),
        '0.2',
      );
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      assert.equal(
        await page.getByRole('spinbutton', { name: 'Start (seconds) 1', exact: true }).inputValue(),
        '0.5',
      );
      await chooseLocale(page, locale);
      const labels =
        locale === 'vi'
          ? {
              text: 'Nội dung 1',
              save: 'Lưu project',
              render: 'Render đoạn mẫu',
              open: 'Mở project',
              accept: 'Tiếp tục',
            }
          : {
              text: 'Text 1',
              save: 'Save project',
              render: 'Render sample',
              open: 'Open project',
              accept: 'Continue',
            };
      assert.equal(
        await page.getByRole('textbox', { name: labels.text, exact: true }).inputValue(),
        'Cà phê Việt Nam — changed',
      );
      await page.getByRole('button', { name: labels.save, exact: true }).click();
      // Poll a concrete UI save state, not a fixed sleep or a fabricated worker result.
      await page
        .getByText(locale === 'vi' ? 'Không có thay đổi chưa lưu' : 'No unsaved changes', {
          exact: true,
        })
        .waitFor();
      const saved = JSON.parse(await readFile(project, 'utf8'));
      assert.equal(saved.cues[0].text, 'Cà phê Việt Nam — changed');
      assert.equal(saved.cues[0].start_ms, 500);
      await page.getByRole('button', { name: labels.render, exact: true }).click();
      await page.locator('.viewers > video').waitFor({ state: 'visible', timeout: 60000 });
      const rendered = page.locator('.viewers > video');
      await page.waitForFunction(() => {
        const element = document.querySelector('.viewers > video');
        return (
          element instanceof HTMLVideoElement && element.readyState >= 1 && element.duration > 0
        );
      });
      assert.match(await rendered.getAttribute('src'), /^media:\/\/local\//);
      await page.getByRole('textbox', { name: labels.text, exact: true }).fill('unsaved edit');
      await page.getByRole('button', { name: labels.open, exact: true }).click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: labels.accept, exact: true })
        .click();
      await page
        .getByText(locale === 'vi' ? 'Không có thay đổi chưa lưu' : 'No unsaved changes', {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.getByRole('textbox', { name: labels.text, exact: true }).inputValue(),
        'Cà phê Việt Nam — changed',
      );
      assert.equal(await page.locator('.viewers > video').count(), 0);
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page) {
        const artifacts = path.join(root, '.test-artifacts');
        await mkdir(artifacts, { recursive: true });
        await page
          .screenshot({ path: path.join(artifacts, `editor-${locale}-failure.png`) })
          .catch(() => undefined);
      }
      throw error;
    } finally {
      if (application) await application.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
}
