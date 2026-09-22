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

/** status() validates file-set/runtime presence, never content; inert bytes suffice. */
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
          await page.getByRole('button', { name: 'Editor', exact: true }).click();
        }

        await application.evaluate(({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, video);
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();

        await page
          .getByRole('tab', {
            name: locale === 'vi' ? 'Nhận dạng' : 'Transcribe',
            exact: true,
          })
          .click();
        const panel = page.locator('#panel-transcribe');
        await panel.waitFor({ state: 'visible' });
        const speechSection = panel.getByLabel(
          locale === 'vi' ? 'Nhận dạng giọng nói' : 'Recognise speech',
          { exact: true },
        );

        const languageField = speechSection.getByRole('combobox', {
          name: locale === 'vi' ? 'Ngôn ngữ lớp Bản chép lời' : 'Transcript language',
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

        const start = speechSection.getByRole('button', {
          name: locale === 'vi' ? 'Nhận dạng giọng nói' : 'Recognize speech',
          exact: true,
        });
        assert.equal(await start.isDisabled(), false);

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
