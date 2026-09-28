import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

function clip(temp, name, duration) {
  const target = path.join(temp, name);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=320x180:rate=30:duration=${duration}`,
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    target,
  ]);
  return target;
}

const COLUMNS = [
  'Cover',
  'Name',
  'Media type',
  'Duration',
  'Resolution',
  'File size',
  'Imported',
  'Source state',
  'Labels',
  'Related files',
];

test('Library list leads with the cover and the universal columns only', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-library-list-');
  const clipPath = clip(temp, 'harbour-walk.mp4', 2);
  await runElectronTest(
    { temp, userData, screenshotName: 'library-list-cover-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      const panel = page.locator('#library-panel');

      await application.evaluate(
        ({ dialog }, files) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
        },
        [clipPath],
      );
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('1 imported, 0 reused, 0 failed.', { exact: true }).waitFor();

      for (const header of COLUMNS) {
        assert.equal(
          await panel.getByRole('columnheader', { name: header, exact: false }).count(),
          1,
          `missing column "${header}"`,
        );
      }
      for (const forbidden of ['Author', 'Published', 'Views', 'Music', 'Collection', 'Product']) {
        assert.equal(
          await panel.getByRole('columnheader', { name: forbidden, exact: false }).count(),
          0,
          `source-specific fact "${forbidden}" is a column`,
        );
      }

      const row = panel.locator('tr.library-row').first();
      await row.waitFor();

      assert.equal(await row.getByRole('cell', { name: 'Video', exact: true }).count(), 1);
      assert.equal(await row.getByRole('cell', { name: '320×180', exact: true }).count(), 1);
      assert.equal(
        await row.getByRole('cell', { name: /^[0-9][0-9.,]* (B|KB|MB|GB)$/ }).count(),
        1,
        'the file size is not shown',
      );
      assert.equal(await row.getByText('Douyin', { exact: true }).count(), 0);
      assert.equal(await row.getByText('Local file', { exact: true }).count(), 0);

      const coverImage = panel.locator('tr.library-row .library-cover img');
      await coverImage.waitFor();
      const cover = await coverImage.evaluate((element) => ({
        src: element.getAttribute('src'),
        loadedWidth: element.naturalWidth,
      }));
      assert.match(cover.src ?? '', /^media:\/\/local\/cover-/, 'the cover is not a media asset');
      assert.ok(cover.loadedWidth > 0, 'the cover image did not decode');

      assert.equal(
        await coverImage.getAttribute('alt'),
        '',
        'the cover image is not marked decorative',
      );
      assert.equal(
        await row.getByRole('cell', { name: 'harbour-walk.mp4', exact: true }).count(),
        1,
      );

      await row.focus();
      await page.keyboard.press('Enter');
      const surface = page.getByRole('complementary', { name: 'harbour-walk.mp4' });
      await surface.waitFor();
      await surface.getByRole('button', { name: 'Open in Editor', exact: true }).waitFor();
      await surface.getByText('Local file', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await surface.waitFor({ state: 'detached' });

      const database = new DatabaseSync(
        path.join(userData, 'integration-workspace', 'library.sqlite'),
      );
      database
        .prepare("UPDATE library_items SET cover_state='unavailable', cover_path=NULL WHERE name=?")
        .run('harbour-walk.mp4');
      const stored = database
        .prepare('SELECT cover_state FROM library_items WHERE name=?')
        .get('harbour-walk.mp4');
      database.close();
      assert.equal(stored?.cover_state, 'unavailable');

      const search = panel.getByRole('textbox', { name: 'Search the library', exact: true });
      await search.fill('harbour');
      await search.fill('');
      const placeholder = panel.locator('tr.library-row .library-cover svg');
      await placeholder.waitFor({ timeout: 5000 });
      assert.equal(
        await panel.locator('tr.library-row .library-cover img').count(),
        0,
        'an unavailable cover still rendered an image element',
      );
    },
  );
});
