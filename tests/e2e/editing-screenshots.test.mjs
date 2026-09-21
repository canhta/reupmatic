// Screenshot pass for the Edit framing/fade controls and the Batch editor's
// copy of them: the coordinator reviews these, so it captures the real editor
// window with a rotated + cropped source and the upright monitor transport, the
// Edit panel with the framing and fade controls expanded, and the Batch editor
// showing the same new fields — in both locales and at the study's sizes.
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

const SHOTS_DIR = path.join(root, '.test-artifacts');
const SIZES = [
  [1420, 900],
  [1050, 700],
];

const TEXT = {
  en: {
    editTab: 'Edit',
    framing: 'Video framing & color',
    fades: 'Head and tail fades',
    rotate: 'Rotate',
    rotate90: '90° right',
    crop: 'Crop source frame',
    cropWidth: 'Width (%)',
    cropHeight: 'Height (%)',
    fade: 'Fade the start and end',
    fadeIn: 'Fade in (seconds)',
    play: 'Play',
    logo: 'Logo',
    logoEnable: 'Show a logo over the video',
    logoAdd: 'Add image…',
    logoUsed: 'Used as logo',
    logoAnchor: 'Position',
    logoAnchorTopLeft: 'Top left',
    projectMedia: 'Media',
    batchNav: 'Batch & jobs',
    batchAdd: 'Add videos',
    audio: 'Playback speed & source audio',
    reset: 'Reset video & audio edits',
    style: 'Style',
    processing: 'Processing recipe',
  },
  vi: {
    editTab: 'Chỉnh sửa',
    framing: 'Khung hình & màu sắc',
    fades: 'Mờ đầu và cuối',
    rotate: 'Xoay',
    rotate90: '90° sang phải',
    crop: 'Crop khung hình gốc',
    cropWidth: 'Rộng (%)',
    cropHeight: 'Cao (%)',
    fade: 'Mờ dần đầu và cuối',
    fadeIn: 'Mờ vào (giây)',
    play: 'Phát',
    logo: 'Logo',
    logoEnable: 'Hiện logo trên video',
    logoAdd: 'Thêm ảnh…',
    logoUsed: 'Dùng làm logo',
    logoAnchor: 'Vị trí',
    logoAnchorTopLeft: 'Trên trái',
    projectMedia: 'Phương tiện',
    batchNav: 'Xử lý lô & tác vụ',
    batchAdd: 'Thêm video',
    audio: 'Tốc độ & âm thanh gốc',
    reset: 'Đặt lại chỉnh sửa hình & tiếng',
    style: 'Định dạng',
    processing: 'Cấu hình xử lý',
  },
};

async function choose(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function commitNumber(page, label, value) {
  const input = page.getByRole('spinbutton', { name: label, exact: true });
  await input.fill(value);
  await input.press('Enter');
  await input.blur();
}

function makeVideo(temp) {
  const video = path.join(temp, 'framing-demo.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30:duration=4',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-n',
    video,
  ]);
  return video;
}

function makeLogo(temp) {
  const logo = path.join(temp, 'studio-mark.png');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=magenta:s=160x80',
    '-frames:v',
    '1',
    '-n',
    logo,
  ]);
  return logo;
}

for (const locale of ['en', 'vi']) {
  test(`Edit framing and fade controls screenshots (${locale})`, { timeout: 180000 }, async () => {
    const { temp, userData } = await createTempWorkspace(`reupmatic-edit-shots-${locale}-`);
    const video = makeVideo(temp);
    const logo = makeLogo(temp);
    await mkdir(SHOTS_DIR, { recursive: true });
    await runElectronTest({ temp, userData }, async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      if (locale === 'vi') {
        await chooseLocale(application, page, 'vi');
        await page.getByRole('button', { name: 'Editor', exact: true }).click();
      }
      const text = TEXT[locale];
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, video);
      await addMediaToProject(page);
      await page.locator('video[data-monitor-video="source"]').waitFor();

      await page.getByRole('tab', { name: text.editTab, exact: true }).click();
      await page.getByRole('button', { name: text.framing, exact: true }).click();
      await choose(page, text.rotate, text.rotate90);
      await page.getByRole('checkbox', { name: text.crop, exact: true }).check();
      await commitNumber(page, text.cropWidth, '50');
      await commitNumber(page, text.cropHeight, '50');

      // The whole editor window before fades: the rotated + cropped source is
      // visible, with the upright monitor transport that replaces the rotated
      // native controls. Then the framing toolbar close-up showing Rotate.
      await page.locator('.editor-tool-panel-region').waitFor();
      await page.getByRole('button', { name: text.play, exact: true }).waitFor();
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: path.join(SHOTS_DIR, `edit-framing-${locale}-${width}x${height}.png`),
        });
        await page
          .getByRole('combobox', { name: text.rotate, exact: true })
          .scrollIntoViewIfNeeded();
        await page.locator('.editor-tool-panel').screenshot({
          path: path.join(SHOTS_DIR, `edit-panel-${locale}-${width}x${height}.png`),
        });
      }

      // Then the fade controls, expanded with a non-zero fade-in value.
      await page.getByRole('button', { name: text.fades, exact: true }).click();
      await page.getByRole('checkbox', { name: text.fade, exact: true }).check();
      await commitNumber(page, text.fadeIn, '1');
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page
          .getByRole('spinbutton', { name: text.fadeIn, exact: true })
          .scrollIntoViewIfNeeded();
        await page.locator('.editor-tool-panel').screenshot({
          path: path.join(SHOTS_DIR, `edit-fades-${locale}-${width}x${height}.png`),
        });
      }

      // The Logo section: one still image as a Project media image row, drawn on
      // the monitor from the placement the export overlays. Top-left keeps the
      // logo clear of the narrow-width overlay drawer in the screenshots.
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, logo);
      await page.getByRole('button', { name: text.logo, exact: true }).click();
      await page.getByRole('checkbox', { name: text.logoEnable, exact: true }).check();
      await page.getByRole('button', { name: text.logoAdd, exact: true }).click();
      await page.getByRole('combobox', { name: text.logoAnchor, exact: true }).click();
      await page.getByRole('option', { name: text.logoAnchorTopLeft, exact: true }).click();
      await page.locator('img[data-monitor-logo="true"]').waitFor();
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-${locale}-${width}x${height}.png`),
        });
        await page
          .getByRole('combobox', { name: text.logoAnchor, exact: true })
          .scrollIntoViewIfNeeded();
        await page.locator('.editor-tool-panel').screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-panel-${locale}-${width}x${height}.png`),
        });
        await page.locator('.video-tray').screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-monitor-${locale}-${width}x${height}.png`),
        });
        // The Media panel takes the left column's one slot while it is open.
        await openSourcePanel(page, 'media');
        await page.getByRole('tabpanel', { name: text.projectMedia, exact: true }).screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-media-${locale}-${width}x${height}.png`),
        });
        await openSourcePanel(page, 'cues');
      }
    });
  });
}

for (const locale of ['en', 'vi']) {
  test(`Batch editor framing and fade controls screenshots (${locale})`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace(`reupmatic-batch-shots-${locale}-`);
    const video = makeVideo(temp);
    await mkdir(SHOTS_DIR, { recursive: true });
    await runElectronTest({ temp, userData }, async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      if (locale === 'vi') {
        await chooseLocale(application, page, 'vi');
      }
      const text = TEXT[locale];
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, video);
      await page.getByRole('button', { name: text.batchNav, exact: true }).click();
      await page.getByRole('button', { name: text.batchAdd, exact: true }).click();
      // The batch draft table (and its processing options) appears once a video
      // is staged for the queue.
      await page.getByRole('button', { name: text.framing, exact: true }).waitFor();
      await page.getByRole('button', { name: text.framing, exact: true }).click();
      await choose(page, text.rotate, text.rotate90);
      await page.getByRole('button', { name: text.fades, exact: true }).click();
      await page.getByRole('checkbox', { name: text.fade, exact: true }).check();
      await commitNumber(page, text.fadeIn, '1');
      assert.equal(
        await page.getByRole('combobox', { name: text.rotate, exact: true }).count(),
        1,
        'the batch editor shows the one current framing control',
      );
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });

        // The section triggers and the Reset action must each own their own row:
        // a larger heading trigger or a nested grid collapsing the gap made the
        // Reset button run into "Style", and "Style" into "Processing recipe".
        const sectionNames = [text.framing, text.fades, text.audio, text.reset, text.style];
        const rows = [];
        for (const name of sectionNames) {
          const box = await page.getByRole('button', { name, exact: true }).boundingBox();
          assert.ok(box, `"${name}" must render in the batch drawer`);
          rows.push({ name, box });
        }
        const heading = await page
          .getByRole('heading', { name: text.processing, exact: true })
          .boundingBox();
        assert.ok(heading, `"${text.processing}" must render in the batch drawer`);
        rows.push({ name: text.processing, box: heading });
        for (let index = 0; index + 1 < rows.length; index += 1) {
          const current = rows[index];
          const next = rows[index + 1];
          const gap = next.box.y - (current.box.y + current.box.height);
          assert.ok(
            gap >= 8,
            `${width}x${height}: "${current.name}" and "${next.name}" are only ${gap}px apart`,
          );
        }

        await page.screenshot({
          path: path.join(SHOTS_DIR, `batch-editing-${locale}-${width}x${height}.png`),
        });
      }
    });
  });
}
