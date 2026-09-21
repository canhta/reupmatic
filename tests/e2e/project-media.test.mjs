import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  chooseLocale,
  clickMenuItem,
  openSourcePanel,
  waitForEditorReady,
} from './ui-actions.mjs';

// Project media (ticket 03, ED-P01/D-63): the collapsible list above the cue
// list. Rows carry no checkbox; a used marker shows timeline placement, and
// "Remove from project" is offered only on rows not in use.
const COPY = {
  en: {
    editorArea: 'Editor',
    projectMedia: 'Media',
    addMedia: 'Add…',
    empty: 'No media yet',
    used: 'On timeline',
    importedInto: (layer) => `Imported into ${layer}`,
    importInto: 'Import into layer…',
    layerDisplayed: 'Displayed subtitles',
    rowActions: (name) => `Actions for ${name}`,
    missing: 'File missing',
    relink: 'Relink…',
    remove: 'Remove',
    cancel: 'Cancel',
    editMenu: 'Edit',
    undo: 'Undo',
  },
  vi: {
    editorArea: 'Editor',
    projectMedia: 'Phương tiện',
    addMedia: 'Thêm…',
    empty: 'Chưa có phương tiện',
    used: 'Trên timeline',
    importedInto: (layer) => `Đã nhập vào ${layer}`,
    importInto: 'Nhập vào lớp…',
    layerDisplayed: 'Phụ đề hiển thị',
    rowActions: (name) => `Thao tác cho ${name}`,
    missing: 'Thiếu file',
    relink: 'Liên kết lại…',
    remove: 'Xoá',
    cancel: 'Hủy',
    editMenu: 'Chỉnh sửa',
    undo: 'Hoàn tác',
  },
};

function makeVideo(filePath, duration) {
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
    filePath,
  ]);
}

function makeMusic(filePath) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=330:duration=8',
    '-c:a',
    'pcm_s16le',
    '-n',
    filePath,
  ]);
}

const SRT = [
  '1',
  '00:00:00,400 --> 00:00:02,200',
  'Chào mừng trở lại studio.',
  '',
  '2',
  '00:00:03,000 --> 00:00:06,000',
  'Hôm nay chúng ta so sánh hai bộ máy quay.',
  '',
].join('\n');

const SRT_SECOND = ['1', '00:00:01,000 --> 00:00:02,500', 'Phụ đề thứ hai.', ''].join('\n');

for (const locale of ['en', 'vi']) {
  test(`Project media lists, marks, removes and relinks media (${locale})`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-project-media-');
    const video = path.join(temp, 'studio-interview.mp4');
    const music = path.join(temp, 'background-music.wav');
    const srt = path.join(temp, 'interview-vi.srt');
    const second = path.join(temp, 'extra-vi.srt');
    const extra = path.join(temp, 'b-roll-cutaway.mp4');
    makeVideo(video, 8);
    makeMusic(music);
    makeVideo(extra, 4);
    await writeFile(srt, SRT);
    await writeFile(second, SRT_SECOND);
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });
    const copy = COPY[locale];

    await runElectronTest(
      { temp, userData, screenshotName: `project-media-${locale}-failure.png` },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editorArea, exact: true }).click();
        }
        // One panel at a time now (D-63): the left rail opens Media.
        await openSourcePanel(page, 'media');
        const region = page.getByRole('tabpanel', { name: copy.projectMedia });
        const screenshot = async (subject, width, height) => {
          await page.setViewportSize({ width, height });
          await page.screenshot({
            path: path.join(artifacts, `project-media-${locale}-${subject}-${width}x${height}.png`),
          });
        };

        // Empty project: the section exists, shows its empty state, and its one
        // Add… control starts the project from a first video (D-63) rather than
        // being disabled with nothing open.
        await region.getByText(copy.empty, { exact: true }).waitFor();
        assert.equal(
          await region.getByRole('button', { name: copy.addMedia, exact: true }).isDisabled(),
          false,
        );
        await screenshot('empty', 1420, 900);
        await screenshot('empty', 1050, 700);
        await page.setViewportSize({ width: 1420, height: 900 });

        await application.evaluate(
          ({ dialog }, files) => {
            const pending = [
              files.video,
              files.music,
              files.srt,
              files.second,
              files.extra,
              files.srt,
            ];
            dialog.showOpenDialog = async () => {
              const filename = pending.shift();
              if (!filename) throw new Error('Unexpected native file request in test');
              return { canceled: false, filePaths: [filename] };
            };
          },
          { video, music, srt, second, extra },
        );

        // Video → Project media only, shown used from the moment it is open.
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();
        await region.getByText('studio-interview.mp4', { exact: true }).waitFor();

        // Music → the soundtrack, via the same Add… dialog.
        await region.getByRole('button', { name: copy.addMedia, exact: true }).click();
        await region.getByText('background-music.wav', { exact: true }).waitFor();

        // SRT → imported into the active layer; the row now shows the layer it
        // reached and no Import button (re-import is behind the overflow menu).
        await region.getByRole('button', { name: copy.addMedia, exact: true }).click();
        const srtRow = region.locator('li').filter({ hasText: 'interview-vi.srt' });
        await srtRow.getByText(copy.importedInto(copy.layerDisplayed), { exact: true }).waitFor();
        assert.equal(
          await srtRow.getByRole('button', { name: copy.importInto, exact: true }).count(),
          0,
        );
        assert.equal(await region.getByRole('img', { name: copy.used, exact: true }).count(), 2);
        assert.equal(
          await region
            .getByRole('img', { name: copy.importedInto(copy.layerDisplayed), exact: true })
            .count(),
          1,
        );
        // The imported cues land in the Subtitles panel, which the left rail
        // opens in place of Media (D-63 — one panel at a time).
        await openSourcePanel(page, 'cues');
        await page
          .getByRole('textbox', { name: locale === 'vi' ? 'Nội dung 1' : 'Text 1' })
          .waitFor();
        await openSourcePanel(page, 'media');

        // A used SRT's re-import lives only in its overflow menu.
        await srtRow.getByRole('button', { name: copy.rowActions('interview-vi.srt') }).click();
        await page.getByRole('menuitem', { name: copy.importInto, exact: true }).waitFor();
        await page.keyboard.press('Escape');

        // Cancelling the overwrite keeps the second SRT as an unused row: it
        // offers "Import into layer…" and carries no used marker.
        await region.getByRole('button', { name: copy.addMedia, exact: true }).click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: copy.cancel, exact: true })
          .click();
        const secondRow = region.locator('li').filter({ hasText: 'extra-vi.srt' });
        await secondRow.getByRole('button', { name: copy.importInto, exact: true }).waitFor();
        assert.equal(await secondRow.getByRole('img').count(), 0);

        await screenshot('populated', 1420, 900);
        // At 1050×700 the panel still shows at least three rows in full.
        await page.setViewportSize({ width: 1050, height: 700 });
        const body = await region.boundingBox();
        assert.ok(body, 'the Media panel body is visible');
        const itemBoxes = [];
        const items = region.locator('li');
        for (let index = 0; index < (await items.count()); index++)
          itemBoxes.push(await items.nth(index).boundingBox());
        const fullyVisible = itemBoxes.filter(
          (box) => box && box.y >= body.y - 1 && box.y + box.height <= body.y + body.height + 1,
        ).length;
        assert.ok(
          fullyVisible >= 3,
          `expected 3 fully visible Project media rows at 1050x700, saw ${fullyVisible}`,
        );
        await screenshot('populated', 1050, 700);
        await page.setViewportSize({ width: 1420, height: 900 });

        // Closing the panel from its own rail item leaves the rail alone
        // (D-63, owner) and takes the rows with it.
        const mediaTab = page.locator('.editor-source-rail [role="tab"][data-rail-item="media"]');
        await mediaTab.click();
        assert.equal(await page.locator('.editor-source-region').count(), 0);
        assert.equal(await page.locator('.editor-source-rail [role="tab"]').count(), 2);
        await screenshot('collapsed', 1420, 900);
        await screenshot('collapsed', 1050, 700);
        await page.setViewportSize({ width: 1420, height: 900 });
        await mediaTab.click();

        // The subtitle file moves away; adding another video re-checks every
        // stored path and the moved file now shows its relink row.
        await rm(srt);
        await region.getByRole('button', { name: copy.addMedia, exact: true }).click();
        await region.getByText('b-roll-cutaway.mp4', { exact: true }).waitFor();
        const relink = region.getByRole('button', { name: copy.relink, exact: true });
        const missing = region.getByText(copy.missing, { exact: true });
        await missing.waitFor();
        const captureRelink = async (width, height) => {
          await page.setViewportSize({ width, height });
          await missing.scrollIntoViewIfNeeded();
          assert.equal(
            await relink.isVisible(),
            true,
            `relink control visible at ${width}x${height}`,
          );
          await page.screenshot({
            path: path.join(artifacts, `project-media-${locale}-relink-${width}x${height}.png`),
          });
        };
        await captureRelink(1420, 900);
        await captureRelink(1050, 700);
        await page.setViewportSize({ width: 1420, height: 900 });

        // Relink re-registers the file and checks its sha256 against the saved one.
        await writeFile(srt, SRT);
        await relink.click();
        await missing.waitFor({ state: 'hidden' });

        // An unused row offers "Remove from project" from both its overflow menu
        // and its right-click context menu; removing it is one undoable step.
        const extraRow = region.getByText('b-roll-cutaway.mp4', { exact: true });
        await extraRow.scrollIntoViewIfNeeded();
        const overflow = region.getByRole('button', {
          name: copy.rowActions('b-roll-cutaway.mp4'),
        });
        await overflow.click();
        const removeItem = page.getByRole('menuitem', { name: copy.remove, exact: true });
        await removeItem.waitFor();
        assert.equal(await removeItem.isVisible(), true, 'the overflow menu shows Remove');
        await page.keyboard.press('Escape');
        await removeItem.waitFor({ state: 'hidden' });

        const captureContextMenu = async (width, height) => {
          await page.setViewportSize({ width, height });
          await extraRow.scrollIntoViewIfNeeded();
          await extraRow.click({ button: 'right' });
          const item = page.getByRole('menuitem', { name: copy.remove, exact: true });
          await item.waitFor();
          assert.equal(await item.isVisible(), true, `context menu visible at ${width}x${height}`);
          await page.screenshot({
            path: path.join(
              artifacts,
              `project-media-${locale}-context-menu-${width}x${height}.png`,
            ),
          });
          await page.keyboard.press('Escape');
          await item.waitFor({ state: 'hidden' });
        };
        await captureContextMenu(1420, 900);
        await captureContextMenu(1050, 700);
        await page.setViewportSize({ width: 1420, height: 900 });

        await extraRow.click({ button: 'right' });
        await removeItem.waitFor();
        await removeItem.click();
        assert.equal(await region.getByText('b-roll-cutaway.mp4', { exact: true }).count(), 0);
        await clickMenuItem(application, copy.editMenu, copy.undo);
        await region.getByText('b-roll-cutaway.mp4', { exact: true }).waitFor();
      },
    );
  });
}
