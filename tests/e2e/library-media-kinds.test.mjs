// The Library's local Import accepts audio and subtitle files beside video, each becoming a
// top-level item of its own kind. The native picker is fixture input; the real worker hashes and
// probes the files, and only a video record offers the Editor action.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

function audio(temp, name) {
  const target = path.join(temp, name);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:a',
    'aac',
    '-n',
    target,
  ]);
  return target;
}

test('importing audio and subtitle files lists them as their own media kinds', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-media-kinds-');
  const voice = audio(temp, 'voice-note.m4a');
  const captions = path.join(temp, 'bai-giang.srt');
  await writeFile(captions, '1\n00:00:00,000 --> 00:00:01,000\nXin chào\n');

  await runElectronTest(
    { temp, userData, screenshotName: 'library-media-kinds-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();

      await application.evaluate(
        ({ dialog }, files) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
        },
        [voice, captions],
      );
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('2 imported, 0 reused, 0 failed.', { exact: true }).waitFor();

      // Both files are real rows under their own names, not folded into a video record.
      await page.getByRole('cell', { name: 'voice-note.m4a', exact: true }).waitFor();
      await page.getByRole('cell', { name: 'bai-giang.srt', exact: true }).waitFor();

      // The media-type facet separates them.
      await page.getByRole('combobox', { name: 'Media type', exact: true }).click();
      await page.getByRole('option', { name: 'Audio', exact: true }).click();
      await page.getByText('Matches in your library: 1', { exact: true }).waitFor();
      await page.getByRole('cell', { name: 'voice-note.m4a', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('cell', { name: 'bai-giang.srt', exact: true }).count(),
        0,
        'the Audio facet must exclude the subtitle row',
      );
      await page
        .getByRole('region', { name: 'Library filters' })
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();

      // An audio record lists and reveals, but offers no Editor action: no surface accepts it.
      await page.getByRole('cell', { name: 'voice-note.m4a', exact: true }).click();
      const audioSurface = page.getByRole('complementary', { name: 'voice-note.m4a' });
      await audioSurface.waitFor();
      assert.equal(
        await audioSurface.getByRole('button', { name: 'Open in Editor', exact: true }).count(),
        0,
      );
      await page.keyboard.press('Escape');

      await page.getByRole('cell', { name: 'bai-giang.srt', exact: true }).click();
      const subtitleSurface = page.getByRole('complementary', { name: 'bai-giang.srt' });
      await subtitleSurface.waitFor();
      assert.equal(
        await subtitleSurface.getByRole('button', { name: 'Open in Editor', exact: true }).count(),
        0,
      );
    },
  );
});
