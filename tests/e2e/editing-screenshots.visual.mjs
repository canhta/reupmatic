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
    editTab: 'Video',
    frame: 'Frame',
    fades: 'Fade',
    rotate: 'Rotate',
    rotate90: '90°',
    crop: 'Crop',
    cropWidth: 'Width',
    cropHeight: 'Height',
    fadeIn: 'Fade in',
    play: 'Play',
    logo: 'Logo',
    logoAdd: 'Add image…',
    logoUsed: 'Used as logo',
    logoAnchor: 'Position',
    logoAnchorTopLeft: 'Top left',
    projectMedia: 'Media',
    batchNav: 'Batch & jobs',
    batchAdd: 'Add videos',
    original: 'Original',
    screenText: 'Screen text',
    font: 'Font',
    processing: 'Processing recipe',
  },
  vi: {
    editTab: 'Video',
    frame: 'Khung hình',
    fades: 'Mờ dần',
    rotate: 'Xoay',
    rotate90: '90°',
    crop: 'Cắt khung hình',
    cropWidth: 'Rộng',
    cropHeight: 'Cao',
    fadeIn: 'Mờ vào',
    play: 'Phát',
    logo: 'Logo',
    logoAdd: 'Thêm ảnh…',
    logoUsed: 'Dùng làm logo',
    logoAnchor: 'Vị trí',
    logoAnchorTopLeft: 'Trên trái',
    projectMedia: 'Phương tiện',
    batchNav: 'Xử lý lô & tác vụ',
    batchAdd: 'Thêm video',
    original: 'Âm gốc',
    screenText: 'Chữ trên màn hình',
    font: 'Phông chữ',
    processing: 'Cấu hình xử lý',
  },
};

// Rotate (and, on the profile surface, Fade/Framing toggles) are Astryx
// SegmentedControls now: a radiogroup of radio options, not a combobox.
async function clickRadio(page, groupLabel, optionLabel) {
  await page
    .getByRole('radiogroup', { name: groupLabel, exact: true })
    .getByRole('radio', { name: optionLabel, exact: true })
    .click();
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
      // The Video panel shows its sections directly now — no Collapsible to open first.
      await clickRadio(page, text.rotate, text.rotate90);
      await page.getByRole('switch', { name: text.crop, exact: true }).check();
      await commitNumber(page, text.cropWidth, '50');
      await commitNumber(page, text.cropHeight, '50');

      await page.locator('.editor-tool-panel-region').waitFor();
      await page.getByRole('button', { name: text.play, exact: true }).waitFor();
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: path.join(SHOTS_DIR, `edit-framing-${locale}-${width}x${height}.png`),
        });
        await page
          .getByRole('radiogroup', { name: text.rotate, exact: true })
          .scrollIntoViewIfNeeded();
        await page.locator('.editor-tool-panel').screenshot({
          path: path.join(SHOTS_DIR, `edit-panel-${locale}-${width}x${height}.png`),
        });
      }

      // The Fade section's on/off switch is named after the section itself.
      await page.getByRole('switch', { name: text.fades, exact: true }).check();
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

      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, logo);
      await page.getByRole('switch', { name: text.logo, exact: true }).check();
      await page.getByRole('button', { name: text.logoAdd, exact: true }).click();
      // Position is a 3x3 grid of icon toggle buttons, not a combobox.
      await page.getByRole('button', { name: text.logoAnchorTopLeft, exact: true }).click();
      await page.locator('img[data-monitor-logo="true"]').waitFor();
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-${locale}-${width}x${height}.png`),
        });
        await page
          .getByRole('button', { name: text.logoAnchorTopLeft, exact: true })
          .scrollIntoViewIfNeeded();
        await page.locator('.editor-tool-panel').screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-panel-${locale}-${width}x${height}.png`),
        });
        await page.locator('.video-tray').screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-monitor-${locale}-${width}x${height}.png`),
        });
        await openSourcePanel(page, 'media');
        await page.getByRole('tabpanel', { name: text.projectMedia, exact: true }).screenshot({
          path: path.join(SHOTS_DIR, `edit-logo-media-${locale}-${width}x${height}.png`),
        });
        await openSourcePanel(page, 'captions');
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
      // The profile shows every section directly; nothing to open first.
      await page.getByRole('heading', { name: text.frame, exact: true }).waitFor();
      await clickRadio(page, text.rotate, text.rotate90);
      // A profile surface toggles sections with CheckboxInput, not Switch.
      await page.getByRole('checkbox', { name: text.fades, exact: true }).check();
      await commitNumber(page, text.fadeIn, '1');
      assert.equal(
        await page.getByRole('radiogroup', { name: text.rotate, exact: true }).count(),
        1,
        'the batch editor shows the one current framing control',
      );
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });

        const sectionNames = [
          text.processing,
          text.frame,
          text.fades,
          text.original,
          text.screenText,
          text.font,
        ];
        const rows = [];
        for (const name of sectionNames) {
          const box = await page.getByRole('heading', { name, exact: true }).boundingBox();
          assert.ok(box, `"${name}" must render in the batch drawer`);
          rows.push({ name, box });
        }
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
