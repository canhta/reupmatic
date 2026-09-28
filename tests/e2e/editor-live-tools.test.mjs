import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { addMediaToProject, waitForEditorReady } from './ui-actions.mjs';

test('Editor tool panels apply live, validate in place and hide empty actions', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-live-tools-');
  const video = path.join(temp, 'tools.mp4');
  const music = path.join(temp, 'music.wav');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=5',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-n',
    video,
  ]);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=5',
    '-c:a',
    'pcm_s16le',
    '-n',
    music,
  ]);
  const artifacts = path.join(root, '.test-artifacts');
  await mkdir(artifacts, { recursive: true });

  await runElectronTest(
    { temp, userData, screenshotName: 'editor-live-tools-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await application.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, video);
      await addMediaToProject(page);
      await page.locator('video[data-monitor-video="source"]').waitFor();

      // Style: the font is chosen from the bundled families only; invalid fields are marked
      // inline and never applied; valid edits apply live.
      await page.getByRole('tab', { name: 'Text', exact: true }).click();
      await page.locator('#panel-text').waitFor({ state: 'visible' });
      const font = page.getByRole('combobox', { name: 'Family', exact: true });
      await font.click();
      await page.getByRole('option', { name: 'Be Vietnam Pro', exact: true }).click();
      const color = page.getByRole('textbox', { name: 'Color Hex', exact: true });
      const colorError = page
        .locator('#panel-text')
        .getByText('Use #RRGGBB', { exact: true })
        .first();
      await color.fill('red');
      await color.blur();
      await colorError.waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Apply appearance', exact: true }).count(),
        0,
        'the style panel must not keep an Apply action',
      );
      await color.fill('#FF00FF');
      await color.blur();
      await colorError.waitFor({ state: 'hidden' });

      // Audio: Remove is hidden until a track exists, and there is no Apply/Revert pair.
      await page.getByRole('tab', { name: 'Audio', exact: true }).click();
      await page.locator('#panel-audio').waitFor({ state: 'visible' });
      assert.equal(
        await page.getByRole('button', { name: 'Add music', exact: true }).count(),
        1,
        'the Music section header offers Add music while no track exists',
      );
      assert.equal(
        await page.getByRole('button', { name: 'Music actions', exact: true }).count(),
        0,
        'the track actions must stay hidden while no music track is selected',
      );
      await application.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, music);
      await addMediaToProject(page);
      await page.getByRole('button', { name: 'Music actions', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Apply', exact: true }).count(),
        0,
        'the audio panel must not keep an Apply action',
      );

      // Export: the step summary names the logo that will be rendered.
      await page.getByRole('tab', { name: 'Video', exact: true }).click();
      await page.locator('#panel-video').waitFor({ state: 'visible' });
      await page.getByRole('switch', { name: 'Logo', exact: true }).click();
      await page.getByRole('button', { name: 'Export…', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Logo', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(artifacts, 'editor-live-tools.png') });
    },
  );
});
