// Ticket 12's rule at the UI boundary: a filter narrows the Library without quietly hiding a
// whole source, an empty-after-filter result is its own state, and clearing restores the set.
// The store's facet semantics are covered in tests/core; this proves the wiring and the copy.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

function clip(temp, name, durationSeconds, rate) {
  const target = path.join(temp, name);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=160x90:rate=${rate}:duration=${durationSeconds}`,
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    target,
  ]);
  return target;
}

test('Library filters narrow in place, explain an empty result, and clear in one action', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-filters-');
  // One clip over a minute, one under a second: the duration presets must separate them.
  const short = clip(temp, 'short-clip.mp4', 1, 30);
  const long = clip(temp, 'long-clip.mp4', 61, 1);
  await runElectronTest(
    { temp, userData, screenshotName: 'library-filters-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();

      await application.evaluate(
        ({ dialog }, files) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
        },
        [short, long],
      );
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('2 imported, 0 reused, 0 failed.', { exact: true }).waitFor();
      await page.getByRole('cell', { name: 'long-clip.mp4', exact: true }).waitFor();

      // A duration filter is a universal facet: it keeps both rows, one of which matches.
      await page.getByRole('combobox', { name: 'Duration', exact: true }).click();
      await page.getByRole('option', { name: '1–5 min', exact: true }).click();
      await page.getByText('Matches in your library: 1', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('cell', { name: 'short-clip.mp4', exact: true }).count(),
        0,
      );
      assert.equal(await page.getByRole('cell', { name: 'long-clip.mp4', exact: true }).count(), 1);

      // An origin facet can empty the set; that is its own state with its own copy, not the
      // "empty library" or "no matching names" message.
      await page.getByRole('combobox', { name: 'Source', exact: true }).click();
      await page.getByRole('option', { name: 'Douyin', exact: true }).click();
      await page.getByText('No library items match these filters', { exact: true }).waitFor();
      assert.equal(await page.getByText('Your library is empty', { exact: true }).count(), 0);

      // One action clears every facet and the set is whole again. (The empty state offers the
      // same command, so scope to the filter region's own control.)
      await page
        .getByRole('region', { name: 'Library filters' })
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
      await page.getByRole('cell', { name: 'short-clip.mp4', exact: true }).waitFor();
      await page.getByRole('cell', { name: 'long-clip.mp4', exact: true }).waitFor();
      assert.equal(await page.getByText('Matches in your library: 1').count(), 0);
    },
  );
});
