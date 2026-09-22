import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  clickMenuItem,
  openSourcePanel,
  waitForEditorReady,
} from './ui-actions.mjs';

const COPY = {
  editTab: 'Edit',
  logoSection: 'Logo',
  enable: 'Overlay logo',
  image: 'Logo image',
  addImage: 'Add image…',
  anchor: 'Position',
  anchorTopLeft: 'Top left',
  opacity: 'Opacity (%)',
  projectMedia: 'Media',
  usedLogo: 'Used as logo',
  missing: 'File missing',
  relink: 'Relink…',
  addMedia: 'Add…',
  editMenu: 'Edit',
  undo: 'Undo',
};

function makeVideo(filePath, source) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    source,
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-n',
    filePath,
  ]);
}

function makeLogo(filePath) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=magenta:s=80x40',
    '-frames:v',
    '1',
    '-n',
    filePath,
  ]);
}

test('the Logo section places, previews, undoes and relinks a project image', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-logo-overlay-');
  const video = path.join(temp, 'studio.mp4');
  const extra = path.join(temp, 'b-roll.mp4');
  const logo = path.join(temp, 'logo-mark.png');
  makeVideo(video, 'testsrc2=size=320x180:rate=30:duration=8');
  makeVideo(extra, 'testsrc2=size=320x180:rate=30:duration=4');
  makeLogo(logo);

  await runElectronTest(
    { temp, userData, screenshotName: 'logo-overlay-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      const pending = [video, logo, extra, logo];
      await application.evaluate(({ dialog }, files) => {
        const queue = [...files];
        globalThis.__dialogFilters = [];
        dialog.showOpenDialog = async (_window, options) => {
          globalThis.__dialogFilters.push(options?.filters ?? []);
          const filename = queue.shift();
          if (!filename) throw new Error('Unexpected native file request in test');
          return { canceled: false, filePaths: [filename] };
        };
      }, pending);

      await addMediaToProject(page);
      await page.locator('video[data-monitor-video="source"]').waitFor();

      await page.getByRole('tab', { name: COPY.editTab, exact: true }).click();
      await page.getByRole('button', { name: COPY.logoSection, exact: true }).click();
      await page.getByRole('checkbox', { name: COPY.enable, exact: true }).check();
      await page.getByRole('button', { name: COPY.addImage, exact: true }).click();

      const pickerFilters = await application.evaluate(() => globalThis.__dialogFilters.at(-1));
      const pickerExtensions = pickerFilters.flatMap((filter) => filter.extensions);
      assert.ok(
        pickerExtensions.length > 0 &&
          pickerExtensions.every((extension) => ['png', 'jpg', 'jpeg'].includes(extension)),
        `the logo picker offers only image extensions, saw ${pickerExtensions.join(', ')}`,
      );

      await openSourcePanel(page, 'media');
      const region = page.getByRole('tabpanel', { name: COPY.projectMedia });
      await region.getByText('logo-mark.png', { exact: true }).waitFor();
      assert.equal(
        await region.getByRole('img', { name: COPY.usedLogo, exact: true }).count(),
        1,
        'the image row shows the used-as-logo marker',
      );
      const selector = page.getByRole('combobox', { name: COPY.image, exact: true });
      assert.match(await selector.textContent(), /logo-mark\.png/);

      const logoImage = page.locator('img[data-monitor-logo="true"]');
      await logoImage.waitFor();
      const frame = await page.locator('.geometry-frame').boundingBox();
      const box = await logoImage.boundingBox();
      assert.ok(frame && box, 'the output frame and logo box render');
      const widthRatio = box.width / frame.width;
      assert.ok(
        Math.abs(widthRatio - 0.2) < 0.03,
        `the logo is 20% of the frame width, saw ${widthRatio.toFixed(3)}`,
      );
      assert.ok(box.x > frame.x + frame.width / 2, 'the default anchor is on the right');
      assert.ok(box.y > frame.y + frame.height / 2, 'the default anchor is at the bottom');

      await page.getByRole('combobox', { name: COPY.anchor, exact: true }).click();
      await page.getByRole('option', { name: COPY.anchorTopLeft, exact: true }).click();
      await page.waitForFunction(() => {
        const image = document.querySelector('img[data-monitor-logo="true"]');
        const frameElement = document.querySelector('.geometry-frame');
        if (!image || !frameElement) return false;
        const a = image.getBoundingClientRect();
        const b = frameElement.getBoundingClientRect();
        return a.left - b.left < b.width / 4;
      });
      const moved = await logoImage.boundingBox();
      assert.ok(
        moved.x < frame.x + frame.width / 4 && moved.y < frame.y + frame.height / 4,
        'the top-left anchor moves the box into the top-left corner',
      );

      const opacity = page.getByRole('spinbutton', { name: COPY.opacity, exact: true });
      await opacity.fill('50');
      await opacity.press('Enter');
      await opacity.blur();
      await page.waitForFunction(
        () => document.querySelector('img[data-monitor-logo="true"]')?.style.opacity === '0.5',
      );

      await clickMenuItem(application, COPY.editMenu, COPY.undo);
      await page.waitForFunction(
        () => document.querySelector('img[data-monitor-logo="true"]')?.style.opacity === '1',
      );

      await rm(logo);
      await region.getByRole('button', { name: COPY.addMedia, exact: true }).click();
      await region.getByText('b-roll.mp4', { exact: true }).waitFor();
      await region.getByText(COPY.missing, { exact: true }).waitFor();
      makeLogo(logo);
      await page.getByRole('button', { name: COPY.relink, exact: true }).click();
      await page.getByText(COPY.missing, { exact: true }).waitFor({ state: 'hidden' });
      await logoImage.waitFor();
    },
  );
});
