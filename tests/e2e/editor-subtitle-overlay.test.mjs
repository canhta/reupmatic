import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  chooseLocale,
  openSourcePanel,
  waitForEditorReady,
} from './ui-actions.mjs';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

function imageSize(file) {
  const out = execFileSync(FFPROBE, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    file,
  ])
    .toString()
    .trim()
    .split(',');
  return { width: Number(out[0]), height: Number(out[1]) };
}

// The inked text box, as a fraction of the image width. The overlay is transparent except the
// subtitle (alpha); the exported frame is black with white text (all channels bright).
function textBoxFraction(file, mode) {
  const { width, height } = imageSize(file);
  const raw = execFileSync(
    FFMPEG,
    ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: width * height * 4 + 4096 },
  );
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inked =
        mode === 'alpha'
          ? raw[offset + 3] > 20
          : raw[offset] > 245 && raw[offset + 1] > 245 && raw[offset + 2] > 245;
      if (inked) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  assert.ok(maxX >= minX, `no subtitle pixels found in ${path.basename(file)} (${mode})`);
  return (maxX - minX + 1) / width;
}

const TEXT = 'Xin chào overlay';
const COPY = {
  en: {
    play: 'Play',
    pause: 'Pause',
    addCue: 'Add cue',
    text1: 'Text 1',
    start1: 'Start (s) 1',
    editor: 'Editor',
    exportButton: 'Export…',
    exportRun: 'Export',
    stepSubtitles: 'Burn in subtitles',
  },
  vi: {
    play: 'Phát',
    pause: 'Tạm dừng',
    addCue: 'Thêm câu',
    text1: 'Nội dung 1',
    start1: 'Bắt đầu (s) 1',
    editor: 'Editor',
    exportButton: 'Xuất…',
    exportRun: 'Xuất',
    stepSubtitles: 'Gắn cứng phụ đề',
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
      // Large enough that the default subtitle font has solid white pixels to measure.
      'testsrc2=size=1280x720:rate=30:duration=4',
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
        // Pause so the cue lands at a known clock, then nudge into it so the overlay paints.
        await page.getByRole('button', { name: copy.pause, exact: true }).click();

        await openSourcePanel(page, 'cues');
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const text = page.getByRole('textbox', { name: copy.text1, exact: true });
        await text.fill(TEXT);
        await text.blur();
        await page.getByRole('button', { name: copy.play, exact: true }).click();
        await page.waitForTimeout(400);
        await page.getByRole('button', { name: copy.pause, exact: true }).click();

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
        const overlayShot = path.join(artifacts, `overlay-live-${locale}.png`);
        await writeFile(overlayShot, painted);
        await page.evaluate(() => {
          const video = document.querySelector('video[data-monitor-video="source"]');
          if (video instanceof HTMLElement)
            video.style.setProperty('visibility', 'visible', 'important');
        });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(artifacts, `editor-subtitle-overlay-${locale}.png`),
        });

        // F2: the live overlay and an exported frame of the same cue must be the same width, so the
        // monitor never drifts from the burn.
        await page.getByRole('button', { name: copy.exportButton, exact: true }).click();
        const exportDialog = page.getByRole('dialog');
        const steps = await exportDialog.innerText();
        assert.match(steps, new RegExp(copy.stepSubtitles, 'i'), steps);
        await exportDialog.getByRole('button', { name: copy.exportRun, exact: true }).click();
        const resultVideo = page.locator('video[data-monitor-video="result"]');
        await resultVideo.waitFor({ timeout: 120000 });
        const src = await resultVideo.getAttribute('src');
        assert.ok(src?.startsWith('media://local/'), 'the result loads through media://');
        const output = path.join(
          userData,
          'integration-workspace',
          'renders',
          src.slice('media://local/'.length),
          'output.mp4',
        );
        // Extract inside the cue's own window so the comparison is the same line.
        const startSeconds = Number(
          await page.getByRole('spinbutton', { name: copy.start1, exact: true }).inputValue(),
        );
        const exportFrame = path.join(artifacts, `overlay-export-${locale}.png`);
        execFileSync(FFMPEG, [
          '-v',
          'error',
          '-ss',
          (startSeconds + 0.5).toFixed(2),
          '-i',
          output,
          '-frames:v',
          '1',
          '-y',
          exportFrame,
        ]);
        const live = textBoxFraction(overlayShot, 'white');
        const exported = textBoxFraction(exportFrame, 'white');
        assert.ok(
          Math.abs(live - exported) < 0.05,
          `live width ${live.toFixed(3)} must match exported width ${exported.toFixed(3)}`,
        );
      },
    );
  });
}
