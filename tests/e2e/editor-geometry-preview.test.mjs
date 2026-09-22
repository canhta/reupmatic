import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { geometryPreview } from '../../dist-core/editing/geometry-preview.js';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { addMediaToProject, waitForEditorReady } from './ui-actions.mjs';

const SOURCE = { width: 320, height: 180 };

async function chooseSelector(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('Source monitor previews rotate, flip and crop with the export geometry', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-geometry-preview-');
  const video = path.join(temp, 'geometry.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'smptebars=size=320x180:rate=30:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await runElectronTest(
    { temp, userData, screenshotName: 'geometry-preview-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, video);
      await addMediaToProject(page);
      await page.locator('video[data-monitor-video="source"]').waitFor();

      await page.getByRole('tab', { name: 'Edit', exact: true }).click();
      await page.getByRole('button', { name: 'Framing & color', exact: true }).click();

      await chooseSelector(page, 'Rotate', '90° right');
      const rotated = geometryPreview({ rotate: 90 }, SOURCE);
      await page.locator('.geometry-rotator').waitFor();
      await page.waitForFunction(() => {
        const rotator = document.querySelector('.geometry-rotator');
        return rotator != null && /matrix\(/.test(getComputedStyle(rotator).transform);
      });
      const rotateTransform = await page
        .locator('.geometry-rotator')
        .evaluate((element) => getComputedStyle(element).transform);
      assert.match(rotateTransform, /matrix\(/, 'the rotator applies a transform');
      const frameBox = await page.locator('.geometry-frame').boundingBox();
      assert.ok(frameBox, 'the output frame renders');
      assert.ok(
        Math.abs(frameBox.width / frameBox.height - rotated.outputAspect) < 0.02,
        `the frame keeps the rotated aspect (${frameBox.width / frameBox.height} vs ${rotated.outputAspect})`,
      );
      assert.ok(frameBox.height > frameBox.width, 'a quarter turn makes the frame portrait');

      await chooseSelector(page, 'Flip image', 'Horizontal');
      await page.waitForFunction((previous) => {
        const rotator = document.querySelector('.geometry-rotator');
        return rotator != null && getComputedStyle(rotator).transform !== previous;
      }, rotateTransform);

      await page.getByRole('checkbox', { name: 'Crop source frame', exact: true }).check();
      for (const [label, value] of [
        ['Width (%)', '50'],
        ['Height (%)', '50'],
      ]) {
        const input = page.getByRole('spinbutton', { name: label, exact: true });
        await input.fill(value);
        await input.press('Enter');
        await input.blur();
      }
      const cropped = geometryPreview(
        { rotate: 90, flip: 'horizontal', crop: { x: 0, y: 0, width: 0.5, height: 0.5 } },
        SOURCE,
      );
      await page.locator('.geometry-video').waitFor();
      const viewBox = await page
        .locator('.geometry-video')
        .evaluate((element) => getComputedStyle(element).objectViewBox);
      assert.ok(viewBox?.startsWith('inset('), `object-view-box is set (${viewBox})`);
      const numbers = viewBox
        .slice('inset('.length, -1)
        .split(' ')
        .map((value) => Number.parseFloat(value));
      const expected = [
        cropped.viewBox.top,
        cropped.viewBox.right,
        cropped.viewBox.bottom,
        cropped.viewBox.left,
      ];
      for (const [index, value] of numbers.entries()) {
        assert.ok(
          Math.abs(value - expected[index]) < 0.51,
          `object-view-box inset ${index} (${value}) matches ${expected[index]}`,
        );
      }

      const artifacts = path.join(root, '.test-artifacts');
      await mkdir(artifacts, { recursive: true });
      await page
        .locator('.geometry-stage')
        .screenshot({ path: path.join(artifacts, 'geometry-preview-source.png') });
    },
  );
});

test('Source monitor ramps a head fade on the output clock', { timeout: 180000 }, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-fade-preview-');
  const video = path.join(temp, 'fade.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=3',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await runElectronTest(
    { temp, userData, screenshotName: 'fade-preview-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, video);
      await addMediaToProject(page);
      await page.locator('video[data-monitor-video="source"]').waitFor();

      await page.getByRole('tab', { name: 'Edit', exact: true }).click();
      await page.getByRole('button', { name: 'Fades', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Fade in/out', exact: true }).check();

      const opacity = async () =>
        Number.parseFloat(
          await page
            .locator('.geometry-rotator')
            .evaluate((element) => getComputedStyle(element).opacity),
        );
      const seek = async (seconds) => {
        await page.evaluate((value) => {
          const source = document.querySelector('video[data-monitor-video="source"]');
          if (!source) return;
          source.currentTime = value;
          // Chromium fires timeupdate on seek; dispatch one so opacity never waits on a race.
          source.dispatchEvent(new Event('timeupdate', { bubbles: true }));
        }, seconds);
        await page.waitForTimeout(200);
      };

      await seek(0);
      await page.waitForFunction(() => {
        const rotator = document.querySelector('.geometry-rotator');
        return rotator != null && Number.parseFloat(getComputedStyle(rotator).opacity) < 0.2;
      });
      assert.ok((await opacity()) < 0.2, 'the head fade is transparent at the output start');
      await seek(1.5);
      await page.waitForFunction(() => {
        const rotator = document.querySelector('.geometry-rotator');
        return rotator != null && Number.parseFloat(getComputedStyle(rotator).opacity) > 0.9;
      });
      assert.ok((await opacity()) > 0.9, 'the middle of the output stays opaque');
      await seek(3);
      await page.waitForFunction(() => {
        const rotator = document.querySelector('.geometry-rotator');
        return rotator != null && Number.parseFloat(getComputedStyle(rotator).opacity) < 0.2;
      });
      assert.ok((await opacity()) < 0.2, 'the tail fade returns to transparent');
    },
  );
});
