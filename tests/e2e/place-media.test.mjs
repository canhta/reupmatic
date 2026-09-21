// Ticket 05 (D-63, ED-P01) and its review round: adding a video through Project
// media never places it; the one placement path is "Add to timeline" (append) or
// dragging the row onto the clips lane (insert at the drop position). The clips
// lane is always present with the project's own video as its first clip, the row
// action is a compact "+" so the file name keeps its width, and a full timeline
// gets its own clip-limit notice before any IPC. Real Electron/Playwright against
// the installed app; both locales, with screenshots at 1420×900 and 1050×700.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  createTempWorkspace,
  root,
  runElectronTest,
  seedSavedProject,
} from './helpers/electron-harness.mjs';
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
    addToTimeline: 'Add to timeline',
    remove: 'Remove',
    rowActions: (name) => `Actions for ${name}`,
    laneClips: 'Clips',
    fileMenu: 'File',
    saveProject: 'Save Project',
    clean: 'No unsaved changes',
    clipLimit: 'The timeline holds up to 64 clips.',
    openProjectMenu: 'Open project…',
  },
  vi: {
    editorArea: 'Editor',
    projectMedia: 'Phương tiện',
    addMedia: 'Thêm…',
    addToTimeline: 'Thêm vào timeline',
    remove: 'Xoá',
    rowActions: (name) => `Thao tác cho ${name}`,
    laneClips: 'Đoạn phim',
    fileMenu: 'Tệp',
    saveProject: 'Lưu dự án',
    clean: 'Không có thay đổi chưa lưu',
    clipLimit: 'Timeline chứa tối đa 64 đoạn.',
    openProjectMenu: 'Mở project…',
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

const SIZES = [
  [1420, 900],
  [1050, 700],
];

// Dispatching a drag inside the page is the only way to drive HTML5 drag events
// in Electron/Playwright; the row's own `dragstart` handler fills the payload,
// then the band's handlers run exactly as a real pointer drag would.
function dragRowToBand(page, filename, fraction) {
  return page.evaluate(
    async ({ filename, fraction }) => {
      const row = [...document.querySelectorAll('.project-media li')].find((item) =>
        item.textContent?.includes(filename),
      );
      if (!row) throw new Error(`${filename} row not found`);
      const dataTransfer = new DataTransfer();
      row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      const band = document.querySelector('.timeline-band');
      const rect = band.getBoundingClientRect();
      const clientX = rect.left + rect.width * fraction;
      const clientY = rect.top + rect.height / 2;
      for (const type of ['dragenter', 'dragover']) {
        band.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }),
        );
      }
      window.__placeMediaDrag = dataTransfer;
      window.__placeMediaDrop = { band, dataTransfer, clientX, clientY };
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    },
    { filename, fraction },
  );
}

function dropOnBand(page) {
  return page.evaluate(() => {
    const { band, dataTransfer, clientX, clientY } = window.__placeMediaDrop;
    band.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX,
        clientY,
      }),
    );
  });
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Project media placement: add never appends, Add to timeline appends, drag inserts (${locale})`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-place-media-');
    const primary = path.join(temp, 'studio-interview.mp4');
    const second = path.join(temp, 'b-roll-cutaway.mp4');
    const third = path.join(temp, 'product-shot.mp4');
    const unused = path.join(temp, 'unused-take.mp4');
    const project = path.join(temp, 'placed.reupmatic.json');
    makeVideo(primary, 8);
    makeVideo(second, 4);
    makeVideo(third, 3);
    makeVideo(unused, 2);
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });
    const errors = [];

    await runElectronTest(
      { temp, userData, screenshotName: `place-media-${locale}-failure.png` },
      async ({ application, page }) => {
        page.on('pageerror', (error) => errors.push(error.stack || error.message));
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editorArea, exact: true }).click();
        }
        await application.evaluate(
          ({ dialog }, files) => {
            const pending = [files.primary, files.second, files.third, files.unused];
            dialog.showOpenDialog = async () => {
              const filename = pending.shift();
              if (!filename) throw new Error('Unexpected native file request in test');
              return { canceled: false, filePaths: [filename] };
            };
            dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.project });
          },
          { primary, second, third, unused, project },
        );
        await openSourcePanel(page, 'media');
        const media = page.getByRole('tabpanel', { name: copy.projectMedia });
        const headers = page.locator('.timeline-lane-headers');
        const clipsLane = () => headers.getByText(copy.laneClips, { exact: true });
        const clipNames = () =>
          page
            .locator('.timeline-editor-edit-row')
            .first()
            .locator('.timeline-action-label')
            .allTextContents();
        const shot = async (subject) => {
          for (const [width, height] of SIZES) {
            await page.setViewportSize({ width, height });
            await page.screenshot({
              path: path.join(artifacts, `place-media-${locale}-${subject}-${width}x${height}.png`),
            });
          }
          await page.setViewportSize({ width: 1420, height: 900 });
        };

        await page.setViewportSize({ width: 1420, height: 900 });
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();

        // Item 1: the project's own video is a clip on the timeline from the
        // moment it opens — the clips lane exists with the primary as its clip,
        // even before any composition does.
        await clipsLane().waitFor();
        await page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'studio-interview.mp4' })
          .first()
          .waitFor();
        assert.deepEqual(await clipNames(), ['studio-interview.mp4']);

        // The primary clip with no composition is a plain label, not a menu: no
        // Disable/split/delete of its own (ticket 04's single-clip decision).
        await page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'studio-interview.mp4' })
          .first()
          .click({ button: 'right' });
        assert.equal(
          await page.getByRole('menu').count(),
          0,
          'the bare primary clip carries no context menu',
        );

        // Item 2: the row action is a compact "+" icon button; its accessible
        // name is the action, so the file name keeps the row's full width.
        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        const secondRow = media.locator('li').filter({ hasText: 'b-roll-cutaway.mp4' });
        await secondRow.waitFor();
        const addButton = secondRow.getByRole('button', { name: copy.addToTimeline, exact: true });
        assert.equal(await addButton.isVisible(), true, 'the row offers Add to timeline');
        assert.equal(await addButton.getAttribute('aria-label'), copy.addToTimeline);
        assert.equal(
          await media.getByText(/process each|xử lý từng/i).count(),
          0,
          'nothing in Project media offers per-video processing',
        );
        await shot('unplaced');

        // At the compact width an unplaced 20-character file name is fully
        // visible: the "+" never steals the label's width.
        await page.setViewportSize({ width: 1050, height: 700 });
        await secondRow.scrollIntoViewIfNeeded();
        const overflow = await secondRow.evaluate((row) => {
          const label = [...row.querySelectorAll('*')].find(
            (element) => element.textContent?.trim() === 'b-roll-cutaway.mp4',
          );
          if (!label) return Number.NaN;
          return label.scrollWidth - label.clientWidth;
        });
        assert.ok(
          Number.isFinite(overflow) && overflow <= 0,
          `the 20-character file name truncates by ${overflow}px at 1050x700`,
        );
        await page.setViewportSize({ width: 1420, height: 900 });

        // The row's own overflow menu carries the same action plus Remove.
        await secondRow
          .getByRole('button', { name: copy.rowActions('b-roll-cutaway.mp4') })
          .click();
        await page.getByRole('menuitem', { name: copy.addToTimeline, exact: true }).waitFor();
        await page.getByRole('menuitem', { name: copy.remove, exact: true }).waitFor();
        await shot('row-menu');
        await page.keyboard.press('Escape');

        // The saved project carries no composition and an empty cue list: adding
        // the second video changed no clip, cue or output duration.
        await clickMenuItem(application, copy.fileMenu, copy.saveProject);
        await page.getByText(copy.clean, { exact: true }).waitFor();
        const unplaced = JSON.parse(await readFile(project, 'utf8'));
        assert.equal(unplaced.composition, undefined, 'no composition before any placement');
        assert.deepEqual(unplaced.cues, [], 'adding media changes no cue');
        assert.equal(
          unplaced.media.some((item) => item.name === 'b-roll-cutaway.mp4'),
          true,
          'the added video is stored as Project media',
        );

        // Item 3: the second video is dragged onto the clips lane before the
        // primary clip — the drag works from the second video on, building the
        // composition with the new clip on that side. The insertion line is
        // visible at capture time.
        await dragRowToBand(page, 'b-roll-cutaway.mp4', 0.05);
        const dropLine = page.locator('.timeline-drop-line');
        await dropLine.waitFor();
        assert.equal(
          await dropLine.isVisible(),
          true,
          'the insertion line is visible during the drag',
        );
        await shot('drag');
        await dropOnBand(page);
        await page.waitForFunction(() => {
          const labels = document.querySelectorAll(
            '.timeline-editor-edit-row:first-child .timeline-action-label',
          );
          return labels.length === 2 && labels[0].textContent === 'b-roll-cutaway.mp4';
        });
        assert.deepEqual(await clipNames(), ['b-roll-cutaway.mp4', 'studio-interview.mp4']);

        // Add to timeline appends the third video at the end.
        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        const thirdRow = media.locator('li').filter({ hasText: 'product-shot.mp4' });
        await thirdRow.waitFor();
        await thirdRow.getByRole('button', { name: copy.addToTimeline, exact: true }).click();
        await page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'product-shot.mp4' })
          .first()
          .waitFor();
        await page.waitForFunction(() => {
          const labels = document.querySelectorAll(
            '.timeline-editor-edit-row:first-child .timeline-action-label',
          );
          return labels.length === 3 && labels[2].textContent === 'product-shot.mp4';
        });
        assert.deepEqual(await clipNames(), [
          'b-roll-cutaway.mp4',
          'studio-interview.mp4',
          'product-shot.mp4',
        ]);

        // A fourth video stays unplaced: the saved composition (what render and
        // export consume) holds exactly the three placed videos and not this one.
        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        const unusedRow = media.locator('li').filter({ hasText: 'unused-take.mp4' });
        await unusedRow.waitFor();
        await clickMenuItem(application, copy.fileMenu, copy.saveProject);
        await page.getByText(copy.clean, { exact: true }).waitFor();
        const placed = JSON.parse(await readFile(project, 'utf8'));
        assert.deepEqual(
          placed.composition.clips.map((clip) => clip.source.name),
          ['b-roll-cutaway.mp4', 'studio-interview.mp4', 'product-shot.mp4'],
          'export uses only the placed clips, in the placed order',
        );
        assert.equal(
          placed.media.some((item) => item.name === 'unused-take.mp4'),
          true,
          'the unplaced video is still Project media, just not in the composition',
        );
        await shot('timeline');

        assert.deepEqual(errors, []);
      },
    );
  });
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`A full timeline refuses a further placement with its own notice (${locale})`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-clip-limit-');
    const video = path.join(temp, 'studio-interview.mp4');
    const extra = path.join(temp, 'one-more-take.mp4');
    const project = path.join(temp, 'full-timeline.reupmatic.json');
    makeVideo(video, 4);
    makeVideo(extra, 2);
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });
    // A real current-format project whose composition already holds MAX_CLIPS
    // clips of the one source: opening it needs no extra picker, and the app
    // registers the anchor for every clip.
    const sha256 = execFileSync('shasum', ['-a', '256', video]).toString().trim().split(/\s+/)[0];
    const canvas = { width: 320, height: 180, fps: 30 };
    const clips = Array.from({ length: 64 }, (_, index) => ({
      id: `clip-${index}`,
      source: { path: video, name: path.basename(video), sha256, duration_ms: 4000 },
      start_ms: 0,
      end_ms: 1000,
      speed: 1,
      enabled: true,
    }));
    await seedSavedProject(userData, {
      path: project,
      name: 'Full timeline',
      sourcePath: video,
      sourceSha256: sha256,
      snapshot: { composition: { canvas, clips } },
    });

    await runElectronTest(
      { temp, userData, screenshotName: `place-media-${locale}-limit-failure.png` },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editorArea, exact: true }).click();
        }
        await application.evaluate(
          ({ dialog }, files) => {
            const pending = [files.project, files.video, files.extra];
            dialog.showOpenDialog = async () => {
              const filename = pending.shift();
              if (!filename) throw new Error('Unexpected native file request in test');
              return { canceled: false, filePaths: [filename] };
            };
          },
          { project, video, extra },
        );
        await openSourcePanel(page, 'media');
        const media = page.getByRole('tabpanel', { name: copy.projectMedia });

        await page.setViewportSize({ width: 1420, height: 900 });
        await page.locator('.editor-project-header button[aria-haspopup="menu"]').click();
        await page.getByRole('menuitem', { name: copy.openProjectMenu, exact: true }).click();
        // The open flow asks for the project file, then the anchor video.
        await page
          .locator('.timeline-editor-edit-row')
          .first()
          .locator('.timeline-action-label')
          .first()
          .waitFor();
        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        const extraRow = media.locator('li').filter({ hasText: 'one-more-take.mp4' });
        await extraRow.waitFor();
        const before = await page
          .locator('.timeline-editor-edit-row')
          .first()
          .locator('.timeline-action-label')
          .count();

        // Place: the limit is refused before any host round trip, with its own
        // short message rather than the generic composition error.
        await extraRow.getByRole('button', { name: copy.addToTimeline, exact: true }).click();
        // The refusal is a toast now (D-63, owner) and it carries the
        // message only — the error code belongs to the Diagnostic log, not to
        // user copy. The unchanged timeline below is what proves the refused
        // placement never left the renderer.
        const alert = page.getByRole('alert').last();
        await alert.waitFor();
        assert.match(await alert.innerText(), new RegExp(copy.clipLimit.replace('.', '\\.')));
        assert.equal(
          await page
            .locator('.timeline-editor-edit-row')
            .first()
            .locator('.timeline-action-label')
            .count(),
          before,
          'the timeline is unchanged by the refused placement',
        );
        for (const [width, height] of SIZES) {
          await page.setViewportSize({ width, height });
          await page.screenshot({
            path: path.join(artifacts, `place-media-${locale}-limit-${width}x${height}.png`),
          });
        }
      },
    );
  });
}
