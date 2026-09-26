import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  chooseLocale,
  openSourcePanel,
  waitForEditorReady,
} from './ui-actions.mjs';

const TEXT = 'Xin chào overlay';
const COPY = {
  en: { play: 'Play', pause: 'Pause', addCue: 'Add cue', text1: 'Text 1', editor: 'Editor' },
  vi: {
    play: 'Phát',
    pause: 'Tạm dừng',
    addCue: 'Thêm câu',
    text1: 'Nội dung 1',
    editor: 'Editor',
  },
};

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];
  test(`the live monitor paints the subtitle overlay without tainting the frame (${locale})`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-overlay-');
    const video = path.join(temp, 'overlay.mp4');
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
      '-pix_fmt',
      'yuv420p',
      '-n',
      video,
    ]);
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });

    await runElectronTest(
      { temp, userData, screenshotName: `editor-overlay-${locale}-failure.png` },
      async ({ application, page }) => {
        const taints = [];
        page.on('console', (message) => {
          if (/tainted/i.test(message.text())) taints.push(message.text());
        });
        await waitForEditorReady(page);
        if (locale !== 'en') {
          await chooseLocale(application, page, locale);
          await page.getByRole('button', { name: copy.editor, exact: true }).click();
        }
        await application.evaluate(({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, video);
        await addMediaToProject(page);
        await page.locator('video[data-monitor-video="source"]').waitFor();
        const overlay = page.locator('canvas.JASSUB');
        await overlay.waitFor({ timeout: 30000 });

        // Hide the video so only subtitle pixels can change inside the overlay element.
        await page.evaluate(() => {
          const video = document.querySelector('video[data-monitor-video="source"]');
          if (video instanceof HTMLElement) video.style.visibility = 'hidden';
        });
        await page.getByRole('button', { name: copy.play, exact: true }).click();
        await page.waitForTimeout(500);
        const without = await overlay.screenshot();

        await openSourcePanel(page, 'cues');
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const text = page.getByRole('textbox', { name: copy.text1, exact: true });
        await text.fill(TEXT);
        await text.blur();

        let painted = null;
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          painted = await overlay.screenshot();
          if (!painted.equals(without)) break;
          await page.waitForTimeout(300);
        }
        assert.ok(
          painted && !painted.equals(without),
          'the overlay canvas must paint the active cue',
        );
        assert.deepEqual(taints, [], 'the media frame path must stay untainted');
        await page.evaluate(() => {
          const video = document.querySelector('video[data-monitor-video="source"]');
          if (video instanceof HTMLElement) video.style.visibility = '';
        });
        await page.waitForTimeout(200);
        await page.screenshot({
          path: path.join(artifacts, `editor-subtitle-overlay-${locale}.png`),
        });
      },
    );
  });
}
