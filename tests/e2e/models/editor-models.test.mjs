// Opt-in suite: the full Editor flow against the real installed speech and translation models.
// It copies the owner's model configuration into an isolated temp workspace, runs the staged
// interpreter (`python/`) and never uploads or publishes anything. The export hides the burned-in
// text with the subtitle cover band.
//
// Run it only on request: `npm run test:e2e:models`. It skips itself with a clear message when
// the staged interpreter or the installed model configuration is absent.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from '../helpers/electron-harness.mjs';
import { addMediaToProject, waitForEditorReady } from '../ui-actions.mjs';

const CONFIGS = ['local-speech.json', 'local-models.json', 'local-translation.json'];
const SHOTS_DIR = path.join(root, '.test-artifacts');
const stagedPython =
  process.platform === 'win32'
    ? path.join(root, 'python', 'python.exe')
    : path.join(root, 'python', 'bin', 'python3');

function realWorkspace() {
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library/Application Support/Reupmatic/integration-workspace');
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA ?? os.homedir(), 'Reupmatic', 'integration-workspace');
  return path.join(os.homedir(), '.config', 'Reupmatic', 'integration-workspace');
}

function commandExists(command) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// A zh_CN voice so recognition and the zh→vi model both see real Chinese, not English mislabelled.
function chineseVoice() {
  const rows = execFileSync('say', ['-v', '?'], { encoding: 'utf8' }).split('\n');
  const line =
    rows.find((row) => /\szh_CN\s/.test(row)) ?? rows.find((row) => /\szh_TW\s/.test(row));
  return line ? line.replace(/\s(?:zh_CN|zh_TW)\s[\s\S]*/, '').trim() : null;
}

function missingPrerequisites() {
  const missing = [];
  if (!existsSync(stagedPython)) missing.push(`staged interpreter ${stagedPython}`);
  if (!commandExists(process.env.FFMPEG_PATH || 'ffmpeg')) missing.push('ffmpeg');
  if (!(process.platform === 'darwin' && commandExists('say'))) {
    missing.push('macOS `say` (the speech fixture)');
  } else if (!chineseVoice()) {
    missing.push('a Chinese `say` voice (zh_CN/zh_TW)');
  }
  const workspace = realWorkspace();
  for (const name of CONFIGS) {
    if (!existsSync(path.join(workspace, name))) missing.push(path.join(workspace, name));
  }
  return missing;
}

// The fixture burns one line in at 1–2 s; the OCR model's language picks the text and font.
function ocrLanguage() {
  try {
    const config = JSON.parse(
      readFileSync(path.join(realWorkspace(), 'local-models.json'), 'utf8'),
    );
    for (const language of ['zh', 'en', 'vi']) if (config.ocr?.[language]) return language;
  } catch {
    // No local OCR configuration.
  }
  return null;
}

function buildOcrMedia(temp, language) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const video = path.join(temp, 'ocr-e2e.mp4');
  const text = language === 'zh' ? '你好世界' : 'HELLO';
  const font = language === 'zh' ? ':fontfile=/System/Library/Fonts/PingFang.ttc' : '';
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=black:s=360x640:r=24:d=3',
      '-vf',
      `drawtext=text='${text}'${font}:fontsize=72:fontcolor=white:x=(w-tw)/2:y=h-200:` +
        "enable='between(t,1,2)'",
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      video,
    ],
    { stdio: 'ignore' },
  );
  return video;
}

function buildMedia(temp) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const speech = path.join(temp, 'speech.aiff');
  execFileSync('say', [
    '-v',
    chineseVoice(),
    '-o',
    speech,
    '你好，欢迎观看这个简短的测试视频。谢谢观看。',
  ]);
  const video = path.join(temp, 'models-e2e.mp4');
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=360x640:rate=24:duration=3',
      '-i',
      speech,
      '-vf',
      "drawtext=text='XIN CHAO':fontsize=72:fontcolor=white:x=(w-tw)/2:y=h-200:box=1:boxcolor=black",
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-af',
      'apad',
      '-shortest',
      video,
    ],
    { stdio: 'ignore' },
  );
  return video;
}

// Fail the moment a tool shows an error code; otherwise succeed when the result appears.
async function waitForOutcome(page, panel, result, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const code = await panel
      .locator('[role="alert"] code')
      .first()
      .innerText()
      .catch(() => null);
    if (code?.trim()) throw new Error(`${label} failed: ${code.trim()}`);
    if (
      (await result.count()) &&
      (await result
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      return result.first();
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
}

// The monitor owns the export; wait for the result view or the job's error code, and return the id.
async function waitForExport(page, timeoutMs) {
  const result = page.locator('video[data-monitor-video="result"]');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const code = await page
      .evaluate(() => window.__renderErrors?.shift() ?? null)
      .catch(() => null);
    if (code) throw new Error(`Export failed: ${code}`);
    if (
      (await result.count()) &&
      (await result
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await page.waitForFunction(
        () => {
          const element = document.querySelector('video[data-monitor-video="result"]');
          return (
            element instanceof HTMLVideoElement && element.readyState >= 1 && element.duration > 0
          );
        },
        undefined,
        { timeout: timeoutMs },
      );
      const src = await result.getAttribute('src');
      assert.ok(src?.startsWith('media://local/'), 'the result loads through media://');
      return src.slice('media://local/'.length);
    }
    await page.waitForTimeout(1000);
  }
  const diagnostic = await page
    .evaluate(() => ({
      replyErrors: window.__renderReplyErrors ?? [],
      events: window.__renderEvents?.slice(-10) ?? [],
      alerts: [...document.querySelectorAll('[role="alert"]')]
        .map((element) => (element.innerText || '').trim())
        .filter(Boolean),
    }))
    .catch(() => null);
  throw new Error(
    `Export timed out after ${Math.round(timeoutMs / 1000)}s: ${JSON.stringify(diagnostic)}`,
  );
}

async function captureRenderDiagnostics(page) {
  await page.evaluate(() => {
    window.__renderErrors = [];
    window.__renderEvents = [];
    window.__renderReplyErrors = [];
    window.reupmatic.onJob((message) => {
      if (message.event === 'error') window.__renderErrors.push(message.data.code);
      else window.__renderEvents.push(`${message.event}:${message.data?.phase ?? ''}`);
    });
    const original = window.reupmatic.render?.bind(window.reupmatic);
    if (original) {
      window.reupmatic.render = async (input) => {
        const reply = await original(input);
        if (reply && reply.ok === false) window.__renderReplyErrors.push(reply.error);
        return reply;
      };
    }
  });
}

test('Editor with real models: recognise, apply, translate and export with a cover band', {
  timeout: 900000,
}, async (t) => {
  const missing = missingPrerequisites();
  if (missing.length) {
    t.skip(`models e2e needs: ${missing.join('; ')}`);
    return;
  }

  const { temp, userData } = await createTempWorkspace('reupmatic-models-e2e-');
  const video = buildMedia(temp);
  const workspace = path.join(userData, 'integration-workspace');
  await mkdir(workspace, { recursive: true });
  for (const name of CONFIGS) {
    await copyFile(path.join(realWorkspace(), name), path.join(workspace, name));
  }

  await runElectronTest(
    {
      temp,
      userData,
      env: { PYTHON: stagedPython },
      screenshotName: 'models-e2e-failure.png',
    },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await captureRenderDiagnostics(page);
      await application.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, video);
      await addMediaToProject(page);
      await page.locator('.viewers video').first().waitFor({ timeout: 30000 });

      // Recognise: the installed model is multilingual, recognise as Chinese to translate zh→vi.
      await page.getByRole('tab', { name: 'Transcribe', exact: true }).click();
      const transcribe = page.locator('#panel-transcribe');
      await transcribe.waitFor({ state: 'visible' });
      const speech = transcribe.getByLabel('Recognize speech', { exact: true });
      await speech.getByRole('combobox', { name: 'Transcript language' }).click();
      await page.getByRole('option', { name: 'Chinese', exact: true }).click();
      const range = speech.getByRole('combobox', { name: 'Recognition range' });
      if (await range.count()) {
        await range.click();
        await page.getByRole('option', { name: 'Full original video', exact: true }).click();
      }
      await speech.getByRole('button', { name: 'Recognize speech', exact: true }).click();
      const applyTranscript = await waitForOutcome(
        page,
        transcribe,
        page.getByRole('button', { name: 'Replace transcript', exact: true }),
        300000,
        'Recognition',
      );
      await applyTranscript.click();

      // Translate zh→vi with the installed opus-mt model.
      await page.getByRole('tab', { name: 'Translate', exact: true }).click();
      const translate = page.locator('#panel-translate');
      await translate.waitFor({ state: 'visible' });
      await translate.getByRole('combobox', { name: 'Target language' }).click();
      await page.getByRole('option', { name: 'Vietnamese', exact: true }).click();
      const createDraft = translate.getByRole('button', { name: 'Create draft', exact: true });
      await createDraft.waitFor({ timeout: 120000 });
      await createDraft.click();
      const applyTranslation = await waitForOutcome(
        page,
        translate,
        page.getByRole('button', { name: 'Apply', exact: true }),
        300000,
        'Translation review',
      );
      await applyTranslation.click();

      // Cover the burned-in original subtitles with the cover band on the render.
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      const style = page.locator('#panel-style');
      await style.waitFor({ state: 'visible' });
      await style.getByRole('checkbox', { name: 'Cover original subtitles', exact: true }).check();
      // Burn a word-emphasis template: all caps with the active word in the accent colour.
      await style.getByText('Bold highlight', { exact: true }).click();

      // Export the whole video with the cover band step.
      await page.getByRole('button', { name: 'Export…', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Cover original subtitles', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Export', exact: true }).click();
      const artifactId = await waitForExport(page, 600000);
      const output = path.join(workspace, 'renders', artifactId, 'output.mp4');
      const exported = await stat(output);
      assert.ok(exported.size > 1000, 'the export is a real file, never published anywhere');
      await mkdir(SHOTS_DIR, { recursive: true });
      execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-v',
        'error',
        '-ss',
        '0.5',
        '-i',
        output,
        '-frames:v',
        '1',
        '-y',
        path.join(SHOTS_DIR, 'models-exported-frame.png'),
      ]);
    },
  );
});

test('Editor with real models: OCR a burned-in line, translate and export it', {
  timeout: 900000,
}, async (t) => {
  const language = ocrLanguage();
  if (!language) {
    t.skip('models e2e OCR needs a local OCR model in local-models.json');
    return;
  }
  const missing = missingPrerequisites();
  if (missing.length) {
    t.skip(`models e2e needs: ${missing.join('; ')}`);
    return;
  }
  const languageNames = { zh: 'Chinese', en: 'English', vi: 'Vietnamese' };
  const { temp, userData } = await createTempWorkspace('reupmatic-models-ocr-');
  const video = buildOcrMedia(temp, language);
  const workspace = path.join(userData, 'integration-workspace');
  await mkdir(workspace, { recursive: true });
  for (const name of CONFIGS) {
    await copyFile(path.join(realWorkspace(), name), path.join(workspace, name));
  }

  await runElectronTest(
    {
      temp,
      userData,
      env: { PYTHON: stagedPython },
      screenshotName: 'models-ocr-failure.png',
    },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await captureRenderDiagnostics(page);
      await application.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, video);
      await addMediaToProject(page);
      await page.locator('.viewers video').first().waitFor({ timeout: 30000 });

      // OCR the burned-in line; its cue window is the fixture's window.
      await page.getByRole('tab', { name: 'Transcribe', exact: true }).click();
      const transcribe = page.locator('#panel-transcribe');
      await transcribe.waitFor({ state: 'visible' });
      await transcribe
        .getByRole('combobox', { name: 'Displayed subtitles language', exact: true })
        .click();
      await page.getByRole('option', { name: languageNames[language], exact: true }).click();
      await transcribe.getByRole('button', { name: 'Extract', exact: true }).click();
      const applyOcr = await waitForOutcome(
        page,
        transcribe,
        page.getByRole('button', { name: 'Apply draft', exact: true }),
        300000,
        'OCR',
      );
      const rows = await page.locator('.review-rows').first().innerText();
      assert.match(rows, /1\.0[^\d]2\.0/, 'OCR keeps the burned-in line at 1.0–2.0 s');
      await applyOcr.click();

      // Translate the recognised line, keeping its window.
      await page.getByRole('tab', { name: 'Translate', exact: true }).click();
      const translate = page.locator('#panel-translate');
      await translate.waitFor({ state: 'visible' });
      await translate.getByRole('combobox', { name: 'Target language' }).click();
      await page.getByRole('option', { name: 'Vietnamese', exact: true }).click();
      const createDraft = translate.getByRole('button', { name: 'Create draft', exact: true });
      await createDraft.waitFor({ timeout: 120000 });
      await createDraft.click();
      const applyTranslation = await waitForOutcome(
        page,
        translate,
        page.getByRole('button', { name: 'Apply', exact: true }),
        300000,
        'Translation review',
      );
      await applyTranslation.click();

      // Fit the cover band to the detected originals, then export.
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      const style = page.locator('#panel-style');
      await style.waitFor({ state: 'visible' });
      await style.getByRole('checkbox', { name: 'Cover original subtitles', exact: true }).check();
      await style.getByRole('button', { name: 'Fit to original subtitles', exact: true }).click();
      await page.getByRole('button', { name: 'Export…', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Export', exact: true }).click();
      const artifactId = await waitForExport(page, 600000);
      const output = path.join(workspace, 'renders', artifactId, 'output.mp4');
      const exported = await stat(output);
      assert.ok(exported.size > 1000, 'the export is a real file, never published anywhere');
    },
  );
});
