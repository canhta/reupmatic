// Ticket 09 UI pass: the Audio panel's soundtrack section exposes ducking (on/off, amount,
// release) as part of the applied soundtrack contract, shows one short line pointing at the
// existing Render sample label only while ducking is on, never overflows its panel horizontally,
// and keeps its heading fixed while the body scrolls. The setting survives Apply into a real
// sample render. Real Electron/Playwright; only the native file dialog is stubbed. Screenshots at
// 1420×900 and 1050×700 for both locales.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { addMediaToProject, chooseLocale, waitForEditorReady } from './ui-actions.mjs';

const COPY = {
  en: {
    audioTab: 'Audio',
    addMedia: 'Add…',
    duck: 'Lower music under voice',
    amount: 'Amount (dB)',
    release: 'Release (seconds)',
    help: (sample) => `Hear it with ${sample}.`,
    apply: 'Apply audio track',
    draft: 'Draft not applied — rendering uses the last applied track.',
    renderSample: 'Sample',
    editorArea: 'Editor',
  },
  vi: {
    audioTab: 'Âm thanh',
    addMedia: 'Thêm…',
    duck: 'Giảm nhạc khi có giọng nói',
    amount: 'Mức giảm (dB)',
    release: 'Thời gian hồi phục (giây)',
    help: (sample) => `Nghe thử bằng ${sample}.`,
    apply: 'Áp dụng âm thanh',
    draft: 'Bản nháp chưa áp dụng — render vẫn dùng nhạc đã áp dụng lần cuối.',
    renderSample: 'Đoạn mẫu',
    editorArea: 'Editor',
  },
};

function makeVideo(filePath) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=6',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:duration=6',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-c:a',
    'aac',
    '-shortest',
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
    'sine=frequency=660:duration=6',
    '-c:a',
    'pcm_s16le',
    '-n',
    filePath,
  ]);
}

/** Astryx's NumberInput keeps its locale-formatted value while focused, so `fill` appends to it
 *  ("0,25" + "0.35"); selecting all first and typing a raw number commits under any locale. */
async function commitNumber(page, name, value) {
  const input = page.getByRole('spinbutton', { name, exact: true });
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.pressSequentially(String(value));
  await input.press('Enter');
  await input.blur();
}

/** Nothing in a tool panel may be wider than the panel itself; the panel body is the one scroll
 *  container, so its own `scrollWidth` is the whole surface's width. */
async function assertNoHorizontalOverflow(page, where) {
  const widths = await page.evaluate(() => {
    const body = document.getElementById('panel-audio');
    const panel = document.querySelector('.editor-tool-panel');
    return {
      body: [body.clientWidth, body.scrollWidth],
      panel: [panel.clientWidth, panel.scrollWidth],
    };
  });
  assert.ok(
    widths.body[1] <= widths.body[0],
    `${where}: Audio panel body overflows horizontally (scrollWidth ${widths.body[1]} > clientWidth ${widths.body[0]})`,
  );
  assert.ok(
    widths.panel[1] <= widths.panel[0],
    `${where}: tool panel overflows horizontally (scrollWidth ${widths.panel[1]} > clientWidth ${widths.panel[0]})`,
  );
}

/** The heading heads the panel in both layouts and must not move when the body scrolls. */
async function assertHeadingStaysFixed(page, headingName) {
  const body = page.locator('#panel-audio');
  const heading = page.getByRole('heading', { name: headingName, exact: true });
  const before = await heading.boundingBox();
  assert.ok(before, 'the panel heading must be visible');
  const scrollTop = await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  assert.ok(scrollTop > 0, 'the Audio panel body must actually scroll for this check');
  const after = await heading.boundingBox();
  assert.ok(after, 'the panel heading must stay visible after scrolling the body');
  assert.ok(
    Math.abs(after.y - before.y) < 1,
    `the panel heading scrolled with the body (${before.y} → ${after.y})`,
  );
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];
  test(`Audio panel ducks the soundtrack under speech (${locale})`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-audio-ducking-');
    const video = path.join(temp, 'audio-ducking.mp4');
    const music = path.join(temp, 'music.wav');
    makeVideo(video);
    makeMusic(music);
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });

    await runElectronTest(
      { temp, userData, screenshotName: `audio-ducking-${locale}-failure.png` },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editorArea, exact: true }).click();
        }
        await application.evaluate(({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, video);
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();

        await page.setViewportSize({ width: 1420, height: 900 });
        await page.getByRole('tab', { name: copy.audioTab, exact: true }).click();
        await page.locator('#panel-audio').waitFor({ state: 'visible' });

        await application.evaluate(({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, music);
        await addMediaToProject(page);
        const duck = page.getByRole('checkbox', { name: copy.duck, exact: true });
        await duck.waitFor();
        assert.equal(await duck.isChecked(), false);

        // With ducking off there is no pointer-at-Render-sample line; turning it on shows the one
        // short line, which reuses the existing Render sample label rather than retyping it.
        await page
          .getByText(copy.help(copy.renderSample), { exact: true })
          .waitFor({ state: 'hidden' });
        await duck.click();
        await page.getByText(copy.help(copy.renderSample), { exact: true }).waitFor();
        await commitNumber(page, copy.amount, 12);
        await commitNumber(page, copy.release, 0.35);
        assert.equal(
          await page.getByRole('spinbutton', { name: copy.release, exact: true }).inputValue(),
          '0.35',
        );
        await page.getByRole('button', { name: copy.apply, exact: true }).click();
        await page.getByText(copy.draft, { exact: true }).waitFor({ state: 'hidden' });

        await assertNoHorizontalOverflow(page, `${locale} 1420×900`);
        await assertHeadingStaysFixed(page, copy.audioTab);
        await page.screenshot({
          path: path.join(artifacts, `audio-ducking-${locale}-1420x900.png`),
        });

        await page.setViewportSize({ width: 1050, height: 700 });
        await assertNoHorizontalOverflow(page, `${locale} 1050×700`);
        await page.screenshot({
          path: path.join(artifacts, `audio-ducking-${locale}-1050x700.png`),
        });

        // The applied setting flows through the real worker: a sample render must succeed with the
        // duck enabled (a rejected contract would surface as the editor's render error).
        await page.setViewportSize({ width: 1420, height: 900 });
        await page.getByRole('button', { name: copy.renderSample, exact: true }).click();
        const preview = page.locator('video[data-monitor-video="preview"]');
        const renderError = page.locator('.editor-workspace > .error[role="alert"]');
        await preview.or(renderError).first().waitFor({ state: 'visible', timeout: 90000 });
        if (await renderError.isVisible()) {
          throw new Error(`Render failed in the installed UI: ${await renderError.innerText()}`);
        }
      },
    );
  });
}
