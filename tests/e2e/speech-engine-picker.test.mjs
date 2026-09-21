// Real Electron/Playwright against the actual Editor window. Ticket 05 adds a per-job engine
// picker to speech recognition, fed only by the one capability seam
// (`presentableSpeechEngines`/`offeredSpeechEngines`, app/core/speech/engine-capability.ts) —
// this proves the Transcribe panel's own presentation, not the seam's filtering rules, which
// tests/core/speech.test.mjs already covers directly against real fixtures. Ticket 02 moved the
// setup form out of a Dialog and into the Transcribe tool panel, so this drives the panel.
//
// This sandbox only has the `faster-whisper` runtime importable (`qwen3-asr`'s own runtime is
// not installed here, and installing it just for this test is forbidden), so the
// achievable local configuration never exceeds one presentable engine. That is exactly the
// "does not clutter" branch the ticket calls out — the informational line, not a Selector —
// and it is what this file proves end to end, with a real worker resolving a real (if
// deliberately garbage) configured bundle. The "more than one engine" Selector branch is
// covered at the core boundary instead (offeredSpeechEngines' own tests).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  assertSectionRowsDoNotOverlap,
  chooseLocale,
  panelSectionRows,
  waitForEditorReady,
} from './ui-actions.mjs';

const FIXTURE_FILES = {
  'config.json': 'controlled-test-config',
  'model.bin': 'controlled-test-weights',
  'tokenizer.json': 'controlled-test-tokenizer',
  'vocabulary.json': 'controlled-test-vocabulary',
};

/** Seeds a configured `faster-whisper` engine the worker's own status check reports
 * `available: true` for, without downloading or shipping any real model weights: `status()`
 * (worker/speech/recognition/models.py) validates the bundle's directory/file-set/runtime
 * presence, never file content, so deliberately-inert fixture bytes are enough — the same
 * choice tests/python/test_speech.py's own manifest fixtures make. */
async function seedSingleEngine(userData, { languages }) {
  const workspace = path.join(userData, 'integration-workspace');
  const bundleDir = path.join(workspace, 'speech-fixture');
  await mkdir(bundleDir, { recursive: true });
  const files = {};
  for (const [name, content] of Object.entries(FIXTURE_FILES)) {
    const data = Buffer.from(content);
    await writeFile(path.join(bundleDir, name), data);
    files[name] = createHash('sha256').update(data).digest('hex');
  }
  await writeFile(
    path.join(workspace, 'local-speech.json'),
    JSON.stringify({
      engines: { 'faster-whisper': { directory: 'speech-fixture', languages, files } },
    }),
  );
}

async function createVideoWithAudio(filePath) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=4',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=4',
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

for (const locale of ['en', 'vi']) {
  test(`Recognise speech: one configured engine names itself, no picker to clutter it (${locale})`, {
    timeout: 60000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-speech-engine-picker-');
    const video = path.join(temp, 'engine-picker.mp4');
    await createVideoWithAudio(video);
    await seedSingleEngine(userData, { languages: ['en'] });

    await runElectronTest(
      { temp, userData, screenshotName: `speech-engine-picker-${locale}-failure.png` },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          // Changing locale goes through the Settings sidebar destination (D-57), which leaves
          // that area selected. "Editor" is the same label in both locales.
          await page.getByRole('button', { name: 'Editor', exact: true }).click();
        }

        await application.evaluate(({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, video);
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();

        // Speech recognition is set up in the Transcribe tool panel (ticket
        // 02); open it from the rail and drive its form.
        await page
          .getByRole('tab', {
            name: locale === 'vi' ? 'Nhận dạng' : 'Transcribe',
            exact: true,
          })
          .click();
        const panel = page.locator('#panel-transcribe');
        await panel.waitFor({ state: 'visible' });
        // Transcribe holds speech and on-screen text as two sections of one
        // panel; scope every control to the speech section.
        const speechSection = panel.getByLabel(
          locale === 'vi' ? 'Nhận dạng giọng nói' : 'Recognise speech',
          { exact: true },
        );

        // A fresh video's Transcript layer has no declared language yet: set it, exactly as a
        // user would, through the one shared inline control (LayerLanguageField).
        const languageField = speechSection.getByRole('combobox', {
          name:
            locale === 'vi'
              ? 'Đặt ngôn ngữ cho lớp Bản chép lời'
              : 'Set the Transcript layer language',
        });
        await languageField.waitFor();
        await languageField.click();
        await panel
          .getByRole('option', { name: locale === 'vi' ? 'Tiếng Anh' : 'English', exact: true })
          .click();

        const rangeField = speechSection.getByRole('combobox', {
          name: locale === 'vi' ? 'Phạm vi nhận dạng' : 'Recognition range',
        });
        await rangeField.waitFor();

        // Exactly one configured engine: the panel names it as plain text, never a Selector —
        // "the control does not clutter" the setup form (ticket 05's own acceptance line).
        const engineField = speechSection.getByRole('combobox', {
          name: locale === 'vi' ? 'Bộ nhận dạng' : 'Recognition engine',
        });
        assert.equal(await engineField.count(), 0, 'a single engine must not render a picker');
        await speechSection
          .getByText(
            locale === 'vi' ? 'Bộ nhận dạng: faster-whisper' : 'Recognition engine: faster-whisper',
            { exact: true },
          )
          .waitFor();

        // A real, resolvable configured engine — not "no model configured" — so Start is
        // actionable once language and audio are both present.
        const start = speechSection.getByRole('button', {
          name: locale === 'vi' ? 'Nhận dạng giọng nói' : 'Recognize speech',
          exact: true,
        });
        assert.equal(await start.isDisabled(), false);

        // Focus order across the toolbar survives the added informational line: once the
        // Transcript layer has a declared language, its field is gone (LayerLanguageField
        // returns null), the plain-text single-engine line is never a Tab stop, and Tab from
        // the range field reaches Start next, not something stray in between.
        await rangeField.focus();
        await page.keyboard.press('Tab');
        assert.equal(
          await start.evaluate((element) => element === document.activeElement),
          true,
          'Tab from the recognition-range field must reach Start next',
        );

        const screenshots = path.join(root, '.test-artifacts');
        await mkdir(screenshots, { recursive: true });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        for (const [width, height] of [
          [1420, 900],
          [1050, 700],
        ]) {
          await page.setViewportSize({ width, height });
          // The engine line, the range select above it and the Run button below it must
          // never paint over one another at either size or locale (ticket 02 review).
          assertSectionRowsDoNotOverlap(
            await panelSectionRows(speechSection),
            `${locale} ${width}x${height} speech section`,
          );
          await page.screenshot({
            path: path.join(screenshots, `speech-engine-picker-${locale}-${width}x${height}.png`),
          });
        }
      },
    );
  });
}
