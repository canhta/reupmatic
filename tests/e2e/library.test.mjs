import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { chooseLocale, waitForEditorReady } from './ui-actions.mjs';

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

test('Electron Sources & Library list/detail composition, selection, batch and relink', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-library-');
  const clipA = clip(temp, 'vacation-clip.mp4', 2);
  const clipB = clip(temp, 'product-demo.mp4', 3);
  await runElectronTest(
    { temp, userData, screenshotName: 'library-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      const panel = page.locator('#library-panel');

      const sourceTabs = page.getByRole('tablist', { name: 'Sources & Library', exact: true });
      assert.equal(await sourceTabs.getByRole('tab').count(), 2);
      await page.getByRole('tab', { name: 'Library', exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Downloads', exact: true }).waitFor();
      assert.equal(await page.getByRole('tab', { name: 'Assets', exact: true }).count(), 0);
      assert.equal(await page.getByRole('tab', { name: 'Shared labels', exact: true }).count(), 0);

      await page.getByText('Your library is empty', { exact: true }).waitFor();
      assert.equal(
        await page.getByText('Source videos, projects, subtitles', { exact: false }).count(),
        0,
      );
      assert.equal(await panel.getByText(/selected/i).count(), 0);
      assert.equal(
        await page.getByRole('button', { name: 'Go to previous page', exact: true }).count(),
        0,
      );
      assert.equal(await page.getByRole('complementary').count(), 0);

      await application.evaluate(
        ({ dialog }, files) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
        },
        [clipA, clipB],
      );
      await page.getByRole('button', { name: 'Import local files', exact: true }).click();
      await page.getByText('2 imported, 0 reused, 0 failed.', { exact: true }).waitFor();

      assert.equal(
        await page
          .locator('.library-toolbar-actions')
          .getByText(/imported/)
          .count(),
        0,
        'the import summary must not share the toolbar actions row',
      );

      await page.getByRole('cell', { name: 'vacation-clip.mp4', exact: true }).waitFor();
      await page.getByRole('cell', { name: 'product-demo.mp4', exact: true }).waitFor();
      assert.equal(await page.getByRole('complementary').count(), 0);
      assert.equal(
        await page.getByRole('button', { name: 'Go to previous page', exact: true }).count(),
        0,
        'a single page shows no pagination controls',
      );

      await panel
        .getByRole('columnheader', { name: 'Name', exact: false })
        .getByRole('button')
        .first()
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector('#library-panel table tbody tr')
          ?.textContent?.includes('product-demo.mp4'),
      );

      assert.equal(await panel.getByText(/selected/i).count(), 0);
      await page.getByRole('checkbox', { name: 'Select vacation-clip.mp4', exact: true }).check();
      await page.getByText('1 selected', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: 'Select product-demo.mp4', exact: true }).check();
      await page.getByText('2 selected', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: 'Select product-demo.mp4', exact: true }).uncheck();
      await page.getByText('1 selected', { exact: true }).waitFor();

      assert.equal(
        await page
          .getByText('Choose an output folder before queueing', { exact: false })
          .isVisible(),
        false,
      );
      await page.getByRole('button', { name: 'Prepare batch…', exact: true }).click();
      await page.getByText('Choose an output folder before queueing', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Add to batch', exact: true }).click();
      await page.getByText('1 selected', { exact: true }).waitFor({ state: 'detached' });

      await page.getByRole('cell', { name: 'vacation-clip.mp4', exact: true }).click();
      const surfaceA = page.getByRole('complementary', { name: 'vacation-clip.mp4' });
      await surfaceA.waitFor();
      await surfaceA.getByRole('button', { name: 'Open in Editor', exact: true }).waitFor();
      // Focus is rAF-deferred by DetailSurface, so poll rather than assume it landed.
      await page.waitForFunction(() => document.activeElement?.closest('.detail-surface') !== null);

      await surfaceA
        .getByText('Open in Editor and save a file to link it here.', { exact: false })
        .waitFor();
      assert.equal(await surfaceA.getByText('0–0 of 0 items', { exact: true }).count(), 0);

      await surfaceA.getByRole('button', { name: 'More actions', exact: true }).click();
      await surfaceA.getByRole('button', { name: 'Show in folder', exact: true }).waitFor();
      await surfaceA.getByRole('button', { name: 'Remove library listing', exact: true }).waitFor();

      assert.equal(
        await surfaceA.getByRole('tab', { name: 'Assets', exact: true }).count(),
        0,
        'related assets must not be a peer tab',
      );
      await surfaceA.getByRole('button', { name: 'Related assets', exact: true }).click();
      await surfaceA
        .getByRole('textbox', { name: 'Find an asset or its content', exact: true })
        .waitFor();

      await page.keyboard.press('Escape');
      await surfaceA.waitFor({ state: 'detached' });
      const restoredFocus = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') === 'vacation-clip.mp4',
      );
      assert.equal(restoredFocus, true);

      await page.setViewportSize({ width: 1050, height: 700 });
      await page.getByRole('cell', { name: 'vacation-clip.mp4', exact: true }).click();
      const drawerA = page.getByRole('complementary', { name: 'vacation-clip.mp4' });
      await drawerA.waitFor();
      const drawerScroll = page.locator('.detail-surface-scroll');
      await drawerScroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const labelsSection = drawerA
        .getByRole('heading', { name: 'Labels for vacation-clip.mp4', exact: true })
        .locator('..');
      const [labelsBox, drawerBox] = await Promise.all([
        labelsSection.boundingBox(),
        drawerA.boundingBox(),
      ]);
      assert.ok(
        labelsBox &&
          drawerBox &&
          labelsBox.y >= drawerBox.y - 1 &&
          labelsBox.y + labelsBox.height <= drawerBox.y + drawerBox.height + 1,
        'the Labels section must be reachable inside the drawer, not clipped past it',
      );
      await page.keyboard.press('Escape');
      await drawerA.waitFor({ state: 'detached' });
      await page.setViewportSize({ width: 1420, height: 900 });

      await rename(clipB, path.join(temp, 'product-demo-moved.mp4'));
      await page.getByRole('cell', { name: 'product-demo.mp4', exact: true }).click();
      const surfaceB = page.getByRole('complementary', { name: 'product-demo.mp4' });
      await surfaceB.waitFor();
      await surfaceB.getByRole('button', { name: 'Open in Editor', exact: true }).click();
      // Scope to the detail surface: the filter's hidden option list carries the same strings.
      await surfaceB.getByText('Source unavailable', { exact: true }).waitFor();
      await application.evaluate(
        ({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        },
        path.join(temp, 'product-demo-moved.mp4'),
      );
      await surfaceB.getByRole('button', { name: 'Locate moved source', exact: true }).click();
      await surfaceB.getByText('Verified at last access', { exact: true }).waitFor();
      await surfaceB.getByRole('button').first().focus();
      await page.keyboard.press('Escape');
      await surfaceB.waitFor({ state: 'detached' });

      await chooseLocale(application, page, 'vi');
      await page.getByRole('button', { name: 'Nguồn & Thư viện', exact: true }).click();
      await page.getByRole('cell', { name: 'vacation-clip.mp4', exact: true }).waitFor();
      assert.ok((await page.getByText('Đã xác minh ở lần truy cập gần nhất').count()) >= 1);
      await page.getByRole('checkbox', { name: 'Chọn vacation-clip.mp4', exact: true }).check();
      await page.getByText('Đã chọn 1 mục', { exact: true }).waitFor();
      await page.getByRole('cell', { name: 'vacation-clip.mp4', exact: true }).click();
      const vietnameseSurface = page.getByRole('complementary', { name: 'vacation-clip.mp4' });
      await vietnameseSurface.waitFor();
      await vietnameseSurface
        .getByText('Mở trong Editor rồi lưu file để liên kết vào đây.', { exact: false })
        .waitFor();
      assert.equal(await vietnameseSurface.getByText('0–0 trên 0 mục', { exact: true }).count(), 0);

      await page.setViewportSize({ width: 1050, height: 700 });
      const vietnameseDrawerScroll = page.locator('.detail-surface-scroll');
      await vietnameseDrawerScroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const vietnameseLabelsSection = vietnameseSurface
        .getByRole('heading', { name: 'Nhãn của vacation-clip.mp4', exact: true })
        .locator('..');
      const [vietnameseLabelsBox, vietnameseDrawerBox] = await Promise.all([
        vietnameseLabelsSection.boundingBox(),
        vietnameseSurface.boundingBox(),
      ]);
      assert.ok(
        vietnameseLabelsBox &&
          vietnameseDrawerBox &&
          vietnameseLabelsBox.y >= vietnameseDrawerBox.y - 1 &&
          vietnameseLabelsBox.y + vietnameseLabelsBox.height <=
            vietnameseDrawerBox.y + vietnameseDrawerBox.height + 1,
        'the Vietnamese Labels section must be reachable inside the drawer, not clipped past it',
      );
    },
  );
});
