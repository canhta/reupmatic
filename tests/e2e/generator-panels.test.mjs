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

const SPEECH_SDK = `from types import SimpleNamespace
import os
from pathlib import Path
TEXT = {
    'en': [
        (0.2, 1.5, 'Welcome back to the studio — today we compare two camera setups.'),
        (1.9, 3.4, 'The first shot is handheld, the second is locked on a tripod.'),
    ],
    'vi': [
        (0.2, 1.5, 'Chào mừng trở lại studio — hôm nay ta so sánh hai bộ máy quay.'),
        (1.9, 3.4, 'Cảnh đầu quay cầm tay, cảnh sau cố định trên chân máy ba chân.'),
    ],
}
class WhisperModel:
    def __init__(self, directory, **kwargs):
        assert Path(directory).is_dir()
        assert kwargs == dict(device='cpu', compute_type='int8', cpu_threads=2,
                              num_workers=1, local_files_only=True)
        assert os.environ.get('HF_HUB_OFFLINE') == '1'
        self.model = SimpleNamespace(is_multilingual=True)
    def transcribe(self, audio, **kwargs):
        language = kwargs['language']
        def segments():
            for start, end, text in TEXT[language]:
                yield SimpleNamespace(start=start, end=end, text=text)
        return segments(), SimpleNamespace(language=language)
`;

const CT2_SDK = `from types import SimpleNamespace
class Translator:
    def __init__(self, directory, **kwargs):
        pass
    def translate_batch(self, tokens, **kwargs):
        return [SimpleNamespace(hypotheses=[['Xin', 'chào', 'bạn', '</s>']]) for _ in tokens]
`;

const SPM_SDK = `class SentencePieceProcessor:
    def __init__(self, model_file):
        pass
    def encode(self, text, out_type=str):
        return text.split()
    def decode(self, tokens):
        return ' '.join(tokens)
`;

const SPEECH_FIXTURE_FILES = {
  'config.json': 'controlled-test-config',
  'model.bin': 'controlled-test-weights',
  'tokenizer.json': 'controlled-test-tokenizer',
  'vocabulary.json': 'controlled-test-vocabulary',
};
const TRANSLATION_FIXTURE_FILES = [
  'model.bin',
  'config.json',
  'source.spm',
  'target.spm',
  'shared_vocabulary.json',
];

async function seedControlledSdk(temp) {
  const sdk = path.join(temp, 'controlled-sdk');
  await mkdir(sdk, { recursive: true });
  await writeFile(path.join(sdk, 'faster_whisper.py'), SPEECH_SDK, 'utf8');
  await writeFile(path.join(sdk, 'ctranslate2.py'), CT2_SDK, 'utf8');
  await writeFile(path.join(sdk, 'sentencepiece.py'), SPM_SDK, 'utf8');
  for (const name of ['faster_whisper', 'ctranslate2', 'sentencepiece']) {
    const metadata = path.join(sdk, `${name}-0.0.0.dist-info`);
    await mkdir(metadata, { recursive: true });
    await writeFile(
      path.join(metadata, 'METADATA'),
      `Metadata-Version: 2.1\nName: ${name.replace('_', '-')}\nVersion: 0.0.0\n`,
    );
  }
  return sdk;
}

async function seedSpeechBundle(userData, languages) {
  const workspace = path.join(userData, 'integration-workspace');
  const bundleDir = path.join(workspace, 'speech-fixture');
  await mkdir(bundleDir, { recursive: true });
  const files = {};
  for (const [name, content] of Object.entries(SPEECH_FIXTURE_FILES)) {
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

async function seedTranslationBundle(userData) {
  const workspace = path.join(userData, 'integration-workspace');
  const bundleDir = path.join(workspace, 'translation-fixture');
  await mkdir(bundleDir, { recursive: true });
  const files = {};
  for (const name of TRANSLATION_FIXTURE_FILES) {
    const data = Buffer.from(`controlled-translation-${name}`);
    await writeFile(path.join(bundleDir, name), data);
    files[name] = createHash('sha256').update(data).digest('hex');
  }
  await writeFile(
    path.join(workspace, 'local-translation.json'),
    JSON.stringify({
      engine: 'ctranslate2-sentencepiece',
      directory: 'translation-fixture',
      source_language: 'en',
      target_language: 'vi',
      files,
    }),
  );
}

function createVideoWithAudio(filePath) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30:duration=6',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=6',
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

/** scrollWidth > clientWidth catches a fixed-column table or nowrap child overflowing the column. */
async function assertReviewFits(cuePanel, expectedFirstResult) {
  const review = cuePanel.locator('.generator-review');
  await review.waitFor({ state: 'visible' });
  const overflows = await review.evaluate((root) =>
    [root, ...root.querySelectorAll('*')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)} ` +
          `${element.scrollWidth}>${element.clientWidth}`,
      ),
  );
  assert.deepEqual(overflows, [], 'no element in the review may overflow its column');
  const firstRow = review.locator('.review-rows li').first();
  await firstRow.waitFor();
  const result = firstRow.locator('.rule-comparison-text').last();
  assert.equal(
    (await result.innerText()).trim(),
    expectedFirstResult,
    "the first cue's result text must be visible in full",
  );
}

const COPY = {
  en: {
    editor: 'Editor',
    transcribeTab: 'Transcribe',
    translateTab: 'Translate',
    speechSection: 'Recognise speech',
    ocrSection: 'Extract text',
    language: 'Transcript language',
    spokenLanguage: 'English',
    english: 'English',
    start: 'Recognize speech',
    review: 'Transcript result — not applied',
    speechResult: 'Welcome back to the studio — today we compare two camera setups.',
    discard: 'Discard result',
    addMedia: 'Add…',
    sourceLayer: 'Source layer',
    displayedLayer: 'Displayed subtitles',
    sourceLanguage: 'Displayed subtitles language',
    translationStart: 'Create draft',
    translationReview: 'Review',
    translationResult: 'Xin chào bạn',
  },
  vi: {
    editor: 'Editor',
    transcribeTab: 'Nhận dạng',
    translateTab: 'Dịch',
    speechSection: 'Nhận dạng giọng nói',
    ocrSection: 'Trích chữ',
    language: 'Ngôn ngữ lớp Bản chép lời',
    spokenLanguage: 'Tiếng Việt',
    english: 'Tiếng Anh',
    start: 'Nhận dạng giọng nói',
    review: 'Kết quả chép lời — chưa áp dụng',
    speechResult: 'Chào mừng trở lại studio — hôm nay ta so sánh hai bộ máy quay.',
    discard: 'Bỏ kết quả',
    addMedia: 'Thêm…',
    sourceLayer: 'Lớp nguồn',
    displayedLayer: 'Phụ đề hiển thị',
    sourceLanguage: 'Ngôn ngữ lớp Phụ đề hiển thị',
    translationStart: 'Tạo bản nháp',
    translationReview: 'Duyệt',
    translationResult: 'Xin chào bạn',
  },
};

const SIZES = [
  [1420, 900],
  [1050, 700],
];

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`generator panels: screenshots (${locale}, 1420x900 and 1050x700)`, {
    timeout: 180000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace(`reupmatic-generator-panels-${locale}-`);
    const video = path.join(temp, 'panels.mp4');
    const srt = path.join(temp, 'cues.srt');
    createVideoWithAudio(video);
    await writeFile(
      srt,
      '1\n00:00:00,300 --> 00:00:02,200\nA realistic first line for translation\n\n' +
        '2\n00:00:02,600 --> 00:00:04,400\nA second line, slightly longer than the first\n',
    );
    const sdk = await seedControlledSdk(temp);
    await seedSpeechBundle(userData, ['en', 'vi']);
    await seedTranslationBundle(userData);
    const screenshots = path.join(root, '.test-artifacts');
    await mkdir(screenshots, { recursive: true });

    await runElectronTest(
      {
        temp,
        userData,
        env: { PYTHONPATH: sdk },
        screenshotName: `generator-panels-${locale}-failure.png`,
      },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editor, exact: true }).click();
        }
        await application.evaluate(
          ({ dialog }, files) => {
            const pending = [files.video];
            dialog.showOpenDialog = async () => {
              const filename = pending.shift();
              return filename ? { canceled: false, filePaths: [filename] } : { canceled: true };
            };
          },
          { video },
        );
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();

        await page.getByRole('tab', { name: copy.transcribeTab, exact: true }).click();
        const transcribe = page.locator('#panel-transcribe');
        await transcribe.waitFor({ state: 'visible' });
        const speechSection = transcribe.getByLabel(copy.speechSection, { exact: true });
        const ocrSection = transcribe.getByLabel(copy.ocrSection, { exact: true });
        const languageField = speechSection.getByRole('combobox', { name: copy.language });
        await languageField.click();
        await transcribe.getByRole('option', { name: copy.spokenLanguage, exact: true }).click();
        await speechSection
          .getByRole('combobox', {
            name: locale === 'vi' ? 'Phạm vi nhận dạng' : 'Recognition range',
          })
          .waitFor();

        for (const [width, height] of SIZES) {
          await page.setViewportSize({ width, height });
          assertSectionRowsDoNotOverlap(
            await panelSectionRows(speechSection),
            `${locale} ${width}x${height} speech`,
          );
          assertSectionRowsDoNotOverlap(
            await panelSectionRows(ocrSection),
            `${locale} ${width}x${height} OCR`,
          );
          await page.screenshot({
            path: path.join(screenshots, `transcribe-panel-${locale}-${width}x${height}.png`),
          });
          await ocrSection.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(screenshots, `transcribe-ocr-section-${locale}-${width}x${height}.png`),
          });
          await page.evaluate(() => {
            const body = document.querySelector('.editor-side-panel-body');
            if (body) body.scrollTo({ top: 0 });
          });
        }

        await page.setViewportSize({ width: 1420, height: 900 });
        await speechSection.getByRole('button', { name: copy.start, exact: true }).click();
        await page.getByText(copy.review, { exact: true }).waitFor({ timeout: 90000 });
        const cuePanel = page.locator('.cue-panel');
        for (const [width, height] of SIZES) {
          await page.setViewportSize({ width, height });
          await assertReviewFits(cuePanel, copy.speechResult);
          await page.screenshot({
            path: path.join(screenshots, `speech-review-${locale}-${width}x${height}.png`),
          });
        }
        // Back to wide before interacting: at 1050 the panel overlays the review.
        await page.setViewportSize({ width: 1420, height: 900 });
        await page.getByRole('button', { name: copy.discard, exact: true }).click();
        await page.locator('.cue-panel').waitFor();

        await application.evaluate(({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, srt);
        await addMediaToProject(page);
        await page.getByRole('tab', { name: copy.translateTab, exact: true }).click();
        const translate = page.locator('#panel-translate');
        await translate.waitFor({ state: 'visible' });
        await translate.getByRole('combobox', { name: copy.sourceLayer, exact: true }).click();
        await translate.getByRole('option', { name: copy.displayedLayer, exact: true }).click();
        const sourceLanguage = translate.getByRole('combobox', { name: copy.sourceLanguage });
        if (await sourceLanguage.count()) {
          await sourceLanguage.click();
          await translate.getByRole('option', { name: copy.english, exact: true }).click();
        }
        assert.ok(
          (await translate.getByText(copy.sourceLayer).count()) > 0,
          'the Translate panel must render its source-layer control',
        );
        for (const [width, height] of SIZES) {
          await page.setViewportSize({ width, height });
          await page.screenshot({
            path: path.join(screenshots, `translate-panel-${locale}-${width}x${height}.png`),
          });
        }
        await page.setViewportSize({ width: 1420, height: 900 });
        await translate.getByRole('button', { name: copy.translationStart, exact: true }).click();
        await page
          .getByRole('button', { name: copy.translationReview, exact: true })
          .waitFor({ timeout: 90000 });
        await page.getByRole('button', { name: copy.translationReview, exact: true }).click();
        await page.getByRole('button', { name: copy.translationReview, exact: true }).click();
        const translationRows = cuePanel.locator('.review-rows');
        await translationRows.waitFor({ timeout: 30000 });
        for (const [width, height] of SIZES) {
          await page.setViewportSize({ width, height });
          await assertReviewFits(cuePanel, copy.translationResult);
          await translationRows.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(screenshots, `translation-review-${locale}-${width}x${height}.png`),
          });
        }
      },
    );
  });
}
