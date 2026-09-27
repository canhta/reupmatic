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

// Adds the second video as a timeline clip, turning the project into a two-clip composition.
async function addSecondClip(page, secondName) {
  await openSourcePanel(page, 'media');
  const media = page.getByRole('tabpanel', { name: 'Media' });
  await media.getByRole('button', { name: 'Add…', exact: true }).click();
  const row = media.locator('li').filter({ hasText: secondName });
  await row.waitFor();
  await row.getByRole('button', { name: 'Add to timeline', exact: true }).click();
  await page.locator('.timeline-editor-action').filter({ hasText: secondName }).first().waitFor();
}

test('composition mode keeps the edit window, blocks OCR and renders a disabled span black', {
  timeout: 180000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-composition-guards-');
  const primary = path.join(temp, 'primary.mp4');
  const second = path.join(temp, 'second.mp4');
  makeVideo(primary, 4);
  makeVideo(second, 3);

  await runElectronTest(
    { temp, userData, screenshotName: 'composition-guards-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await stubMediaPicker(application, [primary, second]);
      await addMediaToProject(page);
      await page.locator('video[data-monitor-video="source"]').waitFor();
      await addSecondClip(page, 'second.mp4');

      // #38: the output edit window must stay visible in composition mode.
      await page.getByRole('tab', { name: 'Edit', exact: true }).click();
      await page.locator('#panel-edit').waitFor();
      const trim = page.getByRole('checkbox', { name: 'Trim source', exact: true });
      await trim.waitFor();
      assert.equal(await trim.isVisible(), true, 'the trim window stays reachable');

      // #41: OCR cannot run on a composition and the reason is shown.
      await page.getByRole('tab', { name: 'Transcribe', exact: true }).click();
      await page.locator('#panel-transcribe').waitFor();
      await page
        .getByText('Extract text from the original clip before composing.', { exact: true })
        .waitFor();
      const extract = page.getByRole('button', { name: 'Extract', exact: true });
      assert.equal(await extract.isDisabled(), true, 'Extract is blocked on a composition');

      // #40 M2: a disabled span shows the black frame the export renders.
      const secondClip = page
        .locator('.timeline-editor-action')
        .filter({ hasText: 'second.mp4' })
        .first();
      await secondClip.scrollIntoViewIfNeeded();
      await secondClip.click();
      await page.keyboard.press('v');
      await page.locator('.timeline-action-disabled').first().waitFor();
      await secondClip.click();
      await page.locator('.source-empty-frame').waitFor({ timeout: 15000 });
    },
  );
});

test('the monitor advances into the next clip instead of stopping at the boundary', {
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
      await waitForEditorReady(page);
      await stubMediaPicker(application, [primary, second]);
      await addMediaToProject(page);
      await page.locator('video[data-monitor-video="source"]').waitFor();
      await addSecondClip(page, 'second.mp4');

      const name = page.locator('.monitor-source-name');
      await name.filter({ hasText: 'primary.mp4' }).waitFor();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      // Three seconds of primary, then the monitor must move to the second clip and keep playing.
      await name.filter({ hasText: 'second.mp4' }).waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
    },
  );
});
