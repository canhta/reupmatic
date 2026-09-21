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
        await openSourcePanel(page, 'media');
        const region = page.getByRole('tabpanel', { name: copy.projectMedia });
        const screenshot = async (subject, width, height) => {
          await page.setViewportSize({ width, height });
          await page.screenshot({
            path: path.join(artifacts, `project-media-${locale}-${subject}-${width}x${height}.png`),
          });
        };

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

        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();
        await region.getByText('studio-interview.mp4', { exact: true }).waitFor();

        await region.getByRole('button', { name: copy.addMedia, exact: true }).click();
        await region.getByText('background-music.wav', { exact: true }).waitFor();

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
        await openSourcePanel(page, 'cues');
        await page
          .getByRole('textbox', { name: locale === 'vi' ? 'Nội dung 1' : 'Text 1' })
          .waitFor();
        await openSourcePanel(page, 'media');

        await srtRow.getByRole('button', { name: copy.rowActions('interview-vi.srt') }).click();
        await page.getByRole('menuitem', { name: copy.importInto, exact: true }).waitFor();
        await page.keyboard.press('Escape');

        await region.getByRole('button', { name: copy.addMedia, exact: true }).click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: copy.cancel, exact: true })
          .click();
        const secondRow = region.locator('li').filter({ hasText: 'extra-vi.srt' });
        await secondRow.getByRole('button', { name: copy.importInto, exact: true }).waitFor();
        assert.equal(await secondRow.getByRole('img').count(), 0);

        await screenshot('populated', 1420, 900);
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

        const mediaTab = page.locator('.editor-source-rail [role="tab"][data-rail-item="media"]');
        await mediaTab.click();
        assert.equal(await page.locator('.editor-source-region').count(), 0);
        assert.equal(await page.locator('.editor-source-rail [role="tab"]').count(), 2);
        await screenshot('collapsed', 1420, 900);
        await screenshot('collapsed', 1050, 700);
        await page.setViewportSize({ width: 1420, height: 900 });
        await mediaTab.click();

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

        await writeFile(srt, SRT);
        await relink.click();
        await missing.waitFor({ state: 'hidden' });

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
