import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { addMediaToProject, openSourcePanel, waitForEditorReady } from './ui-actions.mjs';

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

async function stubMediaPicker(application, files) {
  await application.evaluate(({ dialog }, pendingFiles) => {
    const pending = [...pendingFiles];
    dialog.showOpenDialog = async () => {
      const filename = pending.shift();
      if (!filename) throw new Error('Unexpected native file request in test');
      return { canceled: false, filePaths: [filename] };
    };
  }, files);
}

// Opens the first video (the anchor), whose file the stub returns first.
async function openEditor(page, application, files) {
  await waitForEditorReady(page);
  await stubMediaPicker(application, files);
  await addMediaToProject(page);
  await page.locator('video[data-monitor-video="source"]').waitFor();
}

// Adds one more video as a timeline clip, turning the project into a composition.
async function addClip(page, name) {
  await openSourcePanel(page, 'media');
  // Add media lives in the drawer header, outside the #panel-media tabpanel.
  const asideHeader = page.locator('aside:has(#panel-media)');
  const media = page.getByRole('tabpanel', { name: 'Media' });
  await asideHeader.getByRole('button', { name: 'Add media', exact: true }).click();
  const row = media.locator('li').filter({ hasText: name });
  await row.waitFor();
  await row.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add to timeline', exact: true }).click();
  await page.locator('.timeline-editor-action').filter({ hasText: name }).first().waitFor();
}

function clipAction(page, name) {
  return page.locator('.timeline-editor-action').filter({ hasText: name }).first();
}

async function disableClip(page, name) {
  const clip = clipAction(page, name);
  await clip.scrollIntoViewIfNeeded();
  await clip.click();
  await page.keyboard.press('v');
  await page.locator('.timeline-action-disabled').first().waitFor();
  return clip;
}

test('#38 composition mode keeps the output edit window visible', { timeout: 180000 }, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-composition-window-');
  const primary = path.join(temp, 'primary.mp4');
  const second = path.join(temp, 'second.mp4');
  makeVideo(primary, 4);
  makeVideo(second, 3);

  await runElectronTest(
    { temp, userData, screenshotName: 'composition-window-failure.png' },
    async ({ application, page }) => {
      await openEditor(page, application, [primary, second]);
      await addClip(page, 'second.mp4');

      await page.getByRole('tab', { name: 'Video', exact: true }).click();
      await page.locator('#panel-video').waitFor();
      const trim = page.getByRole('switch', { name: 'Trim', exact: true });
      await trim.waitFor();
      assert.equal(await trim.isVisible(), true, 'the output edit window stays reachable');
    },
  );
});

test('#41 composition mode blocks OCR with a banner', { timeout: 180000 }, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-composition-ocr-');
  const primary = path.join(temp, 'primary.mp4');
  const second = path.join(temp, 'second.mp4');
  makeVideo(primary, 4);
  makeVideo(second, 3);

  await runElectronTest(
    { temp, userData, screenshotName: 'composition-ocr-failure.png' },
    async ({ application, page }) => {
      await openEditor(page, application, [primary, second]);
      await addClip(page, 'second.mp4');

      await openSourcePanel(page, 'captions');
      await page.locator('#panel-captions').waitFor();
      const aside = page.locator('aside:has(#panel-captions)');
      await aside.getByRole('button', { name: 'Create', exact: true }).click();
      await page
        .getByRole('radiogroup', { name: 'Source', exact: true })
        .getByRole('radio', { name: 'Screen', exact: true })
        .click();
      // The footer status says why, in place of a Set up that could not lift it.
      await aside.getByRole('status').filter({ hasText: 'Unavailable in compositions' }).waitFor();
      assert.equal(await aside.getByRole('button', { name: 'Set up…', exact: true }).count(), 0);
      // "Create" also names the view tab; the primary command is the last match in the aside.
      const extract = aside.getByRole('button', { name: 'Create', exact: true }).last();
      assert.equal(await extract.isDisabled(), true, 'Create is blocked on a composition');
    },
  );
});

test('#40 a disabled span renders black when the playhead lands on it', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-composition-black-');
  const primary = path.join(temp, 'primary.mp4');
  const second = path.join(temp, 'second.mp4');
  makeVideo(primary, 4);
  makeVideo(second, 3);

  await runElectronTest(
    { temp, userData, screenshotName: 'composition-black-failure.png' },
    async ({ application, page }) => {
      await openEditor(page, application, [primary, second]);
      await addClip(page, 'second.mp4');

      const clip = await disableClip(page, 'second.mp4');
      await clip.click();
      await page.locator('.source-empty-frame').waitFor({ timeout: 15000 });
      assert.equal(
        await page.locator('video[data-monitor-video="source"]').count(),
        0,
        'the source is silent over a disabled span',
      );
    },
  );
});

test('#40 playback crosses a disabled span black and continues to the next clip', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-composition-black-play-');
  const primary = path.join(temp, 'primary.mp4');
  const second = path.join(temp, 'second.mp4');
  const third = path.join(temp, 'third.mp4');
  makeVideo(primary, 2);
  makeVideo(second, 2);
  makeVideo(third, 2);

  await runElectronTest(
    { temp, userData, screenshotName: 'composition-black-play-failure.png' },
    async ({ application, page }) => {
      await openEditor(page, application, [primary, second, third]);
      await addClip(page, 'second.mp4');
      await addClip(page, 'third.mp4');
      await disableClip(page, 'second.mp4');
      // Park on the first clip so playback starts from an element, then crosses the disabled run.
      await clipAction(page, 'primary.mp4').click();

      await page.getByRole('button', { name: 'Play', exact: true }).click();
      // Two seconds of primary, then the disabled clip plays black, then the third clip.
      await page.locator('.source-empty-frame').waitFor({ timeout: 30000 });
      assert.equal(
        await page.locator('video[data-monitor-video="source"]').count(),
        0,
        'the source is silent over a disabled span',
      );
      await page
        .locator('.monitor-source-name')
        .filter({ hasText: 'third.mp4' })
        .waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
    },
  );
});

test('#40 the monitor paints composition subtitles from the worker ASS overlay', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-composition-overlay-');
  const primary = path.join(temp, 'primary.mp4');
  const second = path.join(temp, 'second.mp4');
  makeVideo(primary, 6);
  makeVideo(second, 3);

  await runElectronTest(
    { temp, userData, screenshotName: 'composition-overlay-failure.png' },
    async ({ application, page }) => {
      await openEditor(page, application, [primary, second]);
      await addClip(page, 'second.mp4');

      const overlay = page.locator('canvas.JASSUB');
      await overlay.waitFor({ timeout: 30000 });
      // Hide the video so only subtitle pixels can change inside the overlay element.
      await page.evaluate(() => {
        const video = document.querySelector('video[data-monitor-video="source"]');
        if (video instanceof HTMLElement) video.style.visibility = 'hidden';
      });
      const without = await overlay.screenshot();

      await openSourcePanel(page, 'captions');
      await page.getByRole('button', { name: 'Add cue', exact: true }).click();
      const text = page.getByRole('textbox', { name: 'Text 1', exact: true });
      await text.fill('Xin chào composition');
      await text.blur();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();

      let painted = null;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        painted = await overlay.screenshot();
        if (!painted.equals(without)) break;
        await page.waitForTimeout(300);
      }
      assert.ok(
        painted && !painted.equals(without),
        'the composition overlay must paint the active cue',
      );
    },
  );
});

test('#39 the monitor advances into the next clip instead of stopping at the boundary', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-composition-advance-');
  const primary = path.join(temp, 'primary.mp4');
  const second = path.join(temp, 'second.mp4');
  makeVideo(primary, 3);
  makeVideo(second, 3);

  await runElectronTest(
    { temp, userData, screenshotName: 'composition-advance-failure.png' },
    async ({ application, page }) => {
      await openEditor(page, application, [primary, second]);
      await addClip(page, 'second.mp4');

      const name = page.locator('.monitor-source-name');
      await name.filter({ hasText: 'primary.mp4' }).waitFor();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      // Three seconds of primary, then the monitor must move to the second clip and keep playing.
      await name.filter({ hasText: 'second.mp4' }).waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
    },
  );
});
