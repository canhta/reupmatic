import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  createTempWorkspace,
  root,
  runElectronTest,
  seedRecoveryDraft,
  seedSavedProject,
} from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  chooseLocale,
  clickMenuItem,
  openSourcePanel,
  settleAnimations,
  waitForEditorReady,
} from './ui-actions.mjs';

const COPY = {
  en: {
    editorArea: 'Editor',
    untitled: 'Untitled project',
    projectNameFromVideo: 'header-clip',
    renamed: 'Summer recap',
    edited: 'Summer recap two',
    nameLabel: 'Project name',
    save: 'Save',
    saved: 'Saved',
    fileMenu: 'File',
    fileSaveProject: 'Save Project',
    fileNewProject: 'New Project',
    newProject: 'New project',
    openProject: 'Open project…',
    projectMedia: 'Media',
    recovered: 'Recovered',
    discard: 'Discard',
    cancel: 'Cancel',
    draftSource: 'draft-source',
  },
  vi: {
    editorArea: 'Editor',
    untitled: 'Dự án chưa đặt tên',
    projectNameFromVideo: 'header-clip',
    renamed: 'Tổng kết hè',
    edited: 'Tổng kết hè hai',
    nameLabel: 'Tên dự án',
    save: 'Lưu',
    saved: 'Đã lưu',
    fileMenu: 'Tệp',
    fileSaveProject: 'Lưu dự án',
    fileNewProject: 'Dự án mới',
    newProject: 'Dự án mới',
    openProject: 'Mở project…',
    projectMedia: 'Phương tiện',
    recovered: 'Đã khôi phục',
    discard: 'Huỷ',
    cancel: 'Hủy',
    draftSource: 'draft-source',
  },
};

function makeVideo(filePath) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=4',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    filePath,
  ]);
}

async function seedLibrary(userData, video, temp) {
  const sha256 = createHash('sha256')
    .update(await readFile(video))
    .digest('hex');
  const now = Date.now();
  await seedSavedProject(userData, {
    path: path.join(temp, 'archive-one.reupmatic.json'),
    name: 'Archive one',
    sourcePath: video,
    sourceSha256: sha256,
    openedAt: now - 2000,
  });
  await seedSavedProject(userData, {
    path: path.join(temp, 'archive-two.reupmatic.json'),
    name: 'Archive two',
    sourcePath: video,
    sourceSha256: sha256,
    openedAt: now - 1000,
  });
  await seedRecoveryDraft(userData, {
    id: 'recovery-draft-header',
    sourcePath: path.join(temp, 'draft-source.mp4'),
    sourceSha256: 'b'.repeat(64),
    cues: [{ id: 'cue1', start_ms: 200, end_ms: 1800, text: 'Bản nháp' }],
  });
}

for (const locale of ['en', 'vi']) {
  test(`the header is the project: open, create, rename, save, reopen (${locale})`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-project-header-');
    const video = path.join(temp, 'header-clip.mp4');
    const project = path.join(temp, 'header-project.reupmatic.json');
    makeVideo(video);
    await seedLibrary(userData, video, temp);
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });
    const copy = COPY[locale];

    await runElectronTest(
      { temp, userData, screenshotName: `project-header-${locale}-failure.png` },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editorArea, exact: true }).click();
        }
        const title = page.getByRole('button', { name: copy.untitled, exact: true });
        await title.waitFor();
        const saveButton = () => page.locator('[data-project-save]');

        const shot = async (subject, width, height) => {
          await page.setViewportSize({ width, height });
          await settleAnimations(page);
          await page.screenshot({
            path: path.join(
              artifacts,
              `project-header-${locale}-${subject}-${width}x${height}.png`,
            ),
          });
          await page.setViewportSize({ width: 1420, height: 900 });
          await settleAnimations(page);
        };

        assert.equal(await saveButton().textContent(), copy.save);
        assert.equal(await saveButton().isDisabled(), true);
        await shot('empty', 1420, 900);
        await shot('empty', 1050, 700);

        await title.click();
        await page.getByRole('menuitem', { name: copy.openProject, exact: true }).waitFor();
        await page.getByRole('menuitem', { name: copy.newProject, exact: true }).waitFor();
        await page.getByRole('menuitem', { name: /^Archive two/ }).waitFor();
        await page.getByRole('menuitem', { name: /^Archive one/ }).waitFor();
        await page.getByRole('menuitem', { name: new RegExp(`^${copy.draftSource}`) }).waitFor();
        await page.getByText(copy.recovered, { exact: true }).waitFor();
        const allowed = [
          'Archive one',
          'Archive two',
          copy.draftSource,
          copy.openProject,
          copy.newProject,
        ];
        for (const text of await page.getByRole('menuitem').allTextContents()) {
          const trimmed = text.trim();
          assert.ok(
            allowed.some((label) => trimmed.startsWith(label)),
            `unexpected project-menu item: ${trimmed}`,
          );
        }
        await settleAnimations(page);
        const surface = page.locator('.astryx-popover-surface').last();
        assert.notEqual(
          await surface.evaluate((element) => getComputedStyle(element).backgroundColor),
          'rgba(0, 0, 0, 0)',
          'the open menu must paint a background',
        );
        const menuBox = await page.getByRole('menu').boundingBox();
        assert.ok(menuBox, 'the menu has a box');
        const headerBox = await page.locator('.editor-side-panel-header').boundingBox();
        assert.ok(headerBox, 'the open panel has a header');
        const intersects = !(
          menuBox.x + menuBox.width <= headerBox.x ||
          headerBox.x + headerBox.width <= menuBox.x ||
          menuBox.y + menuBox.height <= headerBox.y ||
          headerBox.y + headerBox.height <= menuBox.y
        );
        if (intersects) {
          const covered = await page.evaluate(
            ({ x, y }) =>
              Boolean(document.elementFromPoint(x, y)?.closest('.astryx-popover-surface')),
            { x: headerBox.x + headerBox.width / 2, y: headerBox.y + headerBox.height / 2 },
          );
          assert.equal(covered, true, 'header text under the menu must be covered by its surface');
        }
        await shot('dropdown', 1420, 900);
        await shot('dropdown', 1050, 700);
        await page.keyboard.press('Escape');

        await application.evaluate(
          ({ dialog }, files) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.video] });
            dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.project });
          },
          { video, project },
        );

        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();
        await openSourcePanel(page, 'media');
        await page
          .getByRole('tabpanel', { name: copy.projectMedia })
          .getByText('header-clip.mp4', { exact: true })
          .waitFor();
        const named = page.getByRole('button', { name: copy.projectNameFromVideo, exact: true });
        await named.waitFor();
        assert.equal(await saveButton().textContent(), copy.save);
        await shot('named', 1420, 900);
        await shot('named', 1050, 700);

        await named.click();
        const nameField = page.getByRole('textbox', { name: copy.nameLabel, exact: true });
        await nameField.waitFor();
        await nameField.fill(copy.renamed);
        await shot('renaming', 1420, 900);
        await shot('renaming', 1050, 700);
        await nameField.press('Enter');
        const renamed = page.getByRole('button', { name: copy.renamed, exact: true });
        await renamed.waitFor();
        assert.equal(await saveButton().textContent(), copy.save);

        await renamed.click();
        const emptyField = page.getByRole('textbox', { name: copy.nameLabel, exact: true });
        await emptyField.fill('   ');
        await emptyField.press('Enter');
        await emptyField.waitFor();
        await emptyField.fill(copy.renamed);
        await emptyField.press('Escape');
        await renamed.waitFor();

        await renamed.click();
        await page.getByRole('textbox', { name: copy.nameLabel, exact: true }).waitFor();
        await page.locator('.viewers').click({ position: { x: 4, y: 4 } });
        await renamed.waitFor();

        await saveButton().click();
        await page.waitForFunction(
          (label) => document.querySelector('[data-project-save]')?.textContent === label,
          copy.saved,
        );
        assert.equal(await saveButton().isDisabled(), true);
        await shot('saved', 1420, 900);

        await renamed.click();
        const secondField = page.getByRole('textbox', { name: copy.nameLabel, exact: true });
        await secondField.fill(copy.edited);
        await secondField.press('Enter');
        const edited = page.getByRole('button', { name: copy.edited, exact: true });
        await edited.waitFor();
        assert.equal(await saveButton().textContent(), copy.save);
        await shot('unsaved', 1420, 900);
        await shot('unsaved', 1050, 700);
        await application.evaluate(({ dialog }) => {
          dialog.showSaveDialog = async () => {
            throw new Error('Save must not open a destination dialog for a project with a file');
          };
        });
        await clickMenuItem(application, copy.fileMenu, copy.fileSaveProject);
        await page.waitForFunction(
          (label) => document.querySelector('[data-project-save]')?.textContent === label,
          copy.saved,
        );
        assert.equal(JSON.parse(await readFile(project, 'utf8')).name, copy.edited);

        await edited.click();
        const dirtyField = page.getByRole('textbox', { name: copy.nameLabel, exact: true });
        const draftName = locale === 'vi' ? 'Bản nháp' : 'Draft take';
        await dirtyField.fill(draftName);
        await dirtyField.press('Enter');
        await page.getByRole('button', { name: draftName, exact: true }).waitFor();
        await clickMenuItem(application, copy.fileMenu, copy.fileNewProject);
        const dialog = page.getByRole('alertdialog');
        await dialog.waitFor();
        await dialog.getByRole('button', { name: copy.cancel, exact: true }).click();
        await page.getByRole('button', { name: draftName, exact: true }).waitFor();

        await clickMenuItem(application, copy.fileMenu, copy.fileNewProject);
        await dialog.waitFor();
        await dialog.getByRole('button', { name: copy.discard, exact: true }).click();
        await title.waitFor();
        assert.equal(await page.locator('.viewers video').count(), 0);

        await title.click();
        await page.getByRole('menuitem', { name: new RegExp(`^${copy.edited}`) }).click();
        await page.getByRole('button', { name: copy.edited, exact: true }).waitFor();
        await page.locator('.viewers video').waitFor();
      },
    );
  });
}
