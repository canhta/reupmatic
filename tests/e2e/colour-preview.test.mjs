import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { colorPreviewMatrix } from '../../dist-core/editing/color-preview.js';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { addMediaToProject, waitForEditorReady } from './ui-actions.mjs';

const COLOR = { brightness: 0.2, contrast: 1.4, saturation: 1.8 };

test('Source monitor applies the eq colour preview and a rendered sample agrees', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-colour-preview-');
  const video = path.join(temp, 'colour-preview.mp4');
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
    { temp, userData, screenshotName: 'colour-preview-failure.png' },
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
      const accumulated = { brightness: 0, contrast: 1, saturation: 1 };
      for (const [name, key, value] of [
        ['Brightness', 'brightness', COLOR.brightness],
        ['Contrast', 'contrast', COLOR.contrast],
        ['Saturation', 'saturation', COLOR.saturation],
      ]) {
        const input = page.getByRole('spinbutton', { name, exact: true });
        await input.fill(String(value));
        await input.press('Enter');
        await input.blur();
        accumulated[key] = value;
        const expected = colorPreviewMatrix(accumulated)
          .map((entry) => Number(entry.toFixed(6)))
          .join(' ');
        await page.waitForFunction((wanted) => {
          const matrix = document.querySelector('#editor-color-preview feColorMatrix');
          if (!matrix) return false;
          const actual = (matrix.getAttribute('values') ?? '')
            .split(' ')
            .map((entry) => Number(Number(entry).toFixed(6)))
            .join(' ');
          return actual === wanted;
        }, expected);
      }

      const expected = colorPreviewMatrix(COLOR)
        .map((value) => Number(value.toFixed(6)))
        .join(' ');
      await page.waitForFunction(() => {
        const source = document.querySelector('video[data-monitor-video="source"]');
        return source && getComputedStyle(source).filter.includes('editor-color-preview');
      });
      const actual = await page
        .locator('#editor-color-preview feColorMatrix')
        .getAttribute('values');
      assert.equal(
        actual
          ?.split(' ')
          .map((value) => Number(Number(value).toFixed(6)))
          .join(' '),
        expected,
      );

      const artifacts = path.join(root, '.test-artifacts');
      await mkdir(artifacts, { recursive: true });
      await page
        .locator('video[data-monitor-video="source"]')
        .screenshot({ path: path.join(artifacts, 'colour-preview-source.png') });

      await page.getByRole('radio', { name: 'Rendered', exact: true }).click();
      await page.getByRole('button', { name: 'Sample', exact: true }).click();
      const renderError = page.locator('.editor-workspace > .error[role="alert"]');
      await page
        .locator('video[data-monitor-video="preview"]')
        .or(renderError)
        .first()
        .waitFor({ state: 'visible', timeout: 60000 });
      if (await renderError.isVisible()) {
        throw new Error(`Render failed in the installed UI: ${await renderError.innerText()}`);
      }
      await page.waitForFunction(() => {
        const element = document.querySelector('video[data-monitor-video="preview"]');
        return element instanceof HTMLVideoElement && element.readyState >= 1;
      });
      await page
        .locator('video[data-monitor-video="preview"]')
        .screenshot({ path: path.join(artifacts, 'colour-preview-rendered.png') });
    },
  );
});
