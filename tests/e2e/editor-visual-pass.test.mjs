// Ticket 11's closing visual and interaction pass over the finished Editor
// re-layout (D-63): screenshots of every state in English and Vietnamese at
// 1420×900 and 1050×700 with realistic data, a keyboard-only walk, and
// Vietnamese IME entry in a tool panel and the project rename field. The
// recognition/translation/synthesis runs use the same controlled SDK doubles
// the other editor specs use (never real model weights); the media itself is a
// real FFmpeg render with speech-like audio so the original-audio waveform is
// a real envelope rather than a constant-tone block.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { pythonExecutable } from '../../scripts/python.mjs';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { composeText } from './helpers/ime.mjs';
import {
  addMediaToProject,
  chooseLocale,
  openSourcePanel,
  settleAnimations,
  waitForEditorReady,
} from './ui-actions.mjs';

const run = promisify(execFile);
const ARTIFACTS = path.join(root, '.test-artifacts');
const SIZES = [
  [1420, 900],
  [1050, 700],
];
const SPEECH_LANGUAGE = { en: 'English', vi: 'Tiếng Việt' };

const SPEECH_SDK = `from types import SimpleNamespace
import os
from pathlib import Path
TEXT = {
    'en': [
        (0.2, 1.5, 'Welcome back to the studio, today we compare two camera setups.'),
        (1.9, 3.4, 'The first shot is handheld, the second is locked on a tripod.'),
    ],
    'vi': [
        (0.2, 1.5, 'Chao mung tro lai studio, hom nay ta so sanh hai bo may quay.'),
        (1.9, 3.4, 'Canh dau quay cam tay, canh sau co dinh tren chan may ba chan.'),
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
        return [SimpleNamespace(hypotheses=[['Xin', 'chao', 'ban', '</s>']]) for _ in tokens]
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

/** Speech-like audio: a 170 Hz tone gated into syllable bursts so the stored
 * peaks have a real envelope, unlike the constant sine the earlier lane
 * screenshots used. */
const SPEECH_FILTER = "aeval='0.7*sin(2*PI*170*t)*if(lt(mod(t,0.6),0.35),1,0.15)'";

function makeSpeechVideo(filePath, seconds = 8) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=640x360:rate=30:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=200:sample_rate=44100:duration=${seconds}`,
    '-af',
    SPEECH_FILTER,
    '-ac',
    '2',
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

function makePlainVideo(filePath, seconds = 4) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=480x270:rate=30:duration=${seconds}`,
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

function makeLogo(filePath) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=magenta:s=160x80',
    '-frames:v',
    '1',
    '-n',
    filePath,
  ]);
}

async function seedControlledSdk(temp) {
  // Not `controlled-sdk`: synthesis_fixture.sdk() owns that name under the same
  // temp root, and two seeds must not collide on one directory.
  const sdk = path.join(temp, 'speech-sdk');
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

async function seedSynthesisBundle(userData, temp) {
  const workspace = path.join(userData, 'integration-workspace');
  await mkdir(workspace, { recursive: true });
  const { stdout } = await run(
    pythonExecutable(root),
    [
      '-c',
      'from pathlib import Path; import sys,json; from synthesis_fixture import bundle,sdk; ' +
        'root=Path(sys.argv[1]); manifest,_=bundle(root); ' +
        'print(json.dumps({"manifest":str(manifest),"sdk":str(sdk(root))}))',
      temp,
    ],
    { env: { ...process.env, PYTHONPATH: path.join(root, 'tests/python') } },
  );
  const { manifest, sdk } = JSON.parse(stdout);
  await writeFile(path.join(workspace, 'local-synthesis.json'), await readFile(manifest, 'utf8'));
  return sdk;
}

/** A dialog stub that hands out the queued files in order and cancels once the
 * queue is empty (so a stray request never hangs the run). */
async function stubOpenDialog(application, files) {
  await application.evaluate(({ dialog }, queue) => {
    const pending = [...queue];
    dialog.showOpenDialog = async () => {
      const filename = pending.shift();
      return filename ? { canceled: false, filePaths: [filename] } : { canceled: true };
    };
  }, files);
}

async function shot(page, locale, state, { sizes = SIZES } = {}) {
  await mkdir(ARTIFACTS, { recursive: true });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await settleAnimations(page);
    await page.screenshot({
      path: path.join(ARTIFACTS, `visual-${locale}-${state}-${width}x${height}.png`),
    });
  }
  await page.setViewportSize({ width: 1420, height: 900 });
  await settleAnimations(page);
}

const TOOLS = [
  { id: 'transcribe', en: 'Transcribe', vi: 'Nhận dạng' },
  { id: 'translate', en: 'Translate', vi: 'Dịch' },
  { id: 'voice', en: 'Voice', vi: 'Giọng đọc' },
  { id: 'style', en: 'Style', vi: 'Kiểu chữ' },
  { id: 'clean-up', en: 'Clean up', vi: 'Xoá chữ' },
  { id: 'audio', en: 'Audio', vi: 'Âm thanh' },
  { id: 'edit', en: 'Edit', vi: 'Chỉnh sửa' },
];

const COPY = {
  en: {
    editor: 'Editor',
    untitled: 'Untitled project',
    projectMedia: 'Media',
    addMedia: 'Add…',
    setUp: 'Set up…',
    recheck: 'Check again',
    importInto: 'Import into layer…',
    addToTimeline: 'Add to timeline',
    missing: 'File missing',
    relink: 'Relink…',
    rowActions: (n) => `Actions for ${n}`,
    used: 'On timeline',
    editingLayer: 'Layer',
    displayedLayer: /^Displayed subtitles/,
    spokenLayer: /^Spoken text/,
    addCue: 'Add cue',
    text: (n) => `Text ${n}`,
    start: (n) => `Start (seconds) ${n}`,
    end: (n) => `End (seconds) ${n}`,
    spokenLanguage: 'Set the Spoken text layer language',
    vietnamese: 'Vietnamese',
    english: 'English',
    voice: 'Preset voice',
    controlled: 'Controlled voice',
    scope: 'Cues to generate',
    allCues: 'All spoken cues',
    generate: 'Generate audio draft',
    draftHeading: 'Generated voice — not aligned or added to video',
    listen: 'Listen and check',
    reviewed: 'I checked the captured text and listened',
    applyVoice: 'Use as the project voice track',
    voiceApplied: 'Voice track added to the project.',
    soundtrackTitle: 'Music / replacement audio',
    soundtrackPick: 'Choose file…',
    logo: 'Logo',
    framing: 'Video framing & color',
    fades: 'Head and tail fades',
    logoEnable: 'Show a logo over the video',
    logoAdd: 'Add image…',
    logoAnchor: 'Position',
    logoAnchorTopLeft: 'Top left',
    nameLabel: 'Project name',
    renamed: 'Summer recap',
    laneClips: 'Clips',
    laneOriginal: 'Original',
    laneVoice: 'Voice',
    laneMusic: 'Music',
    burnedIn: 'Burned in',
    clipDisable: 'Disable clip',
    clipEnable: 'Enable clip',
    transcribeTab: 'Transcribe',
    translateTab: 'Translate',
    speechSection: 'Recognise speech',
    speechLanguage: 'Set the Transcript layer language',
    speechStart: 'Recognize speech',
    speechReview: 'Transcript result — not applied',
    discardResult: 'Discard result',
    sourceLayer: 'Source layer',
    sourceLanguage: 'Set the Displayed subtitles layer language',
    translationStart: 'Create translation draft',
    translationReview: 'Review against current translated text',
    toolRail: 'Tools',
  },
  vi: {
    editor: 'Editor',
    untitled: 'Dự án chưa đặt tên',
    projectMedia: 'Phương tiện',
    addMedia: 'Thêm…',
    setUp: 'Thiết lập…',
    recheck: 'Kiểm tra lại',
    importInto: 'Nhập vào lớp…',
    addToTimeline: 'Thêm vào timeline',
    missing: 'Thiếu file',
    relink: 'Liên kết lại…',
    rowActions: (n) => `Thao tác cho ${n}`,
    used: 'Trên timeline',
    editingLayer: 'Lớp',
    displayedLayer: /^Phụ đề hiển thị/,
    spokenLayer: /^Nội dung đọc/,
    addCue: 'Thêm câu',
    text: (n) => `Nội dung ${n}`,
    start: (n) => `Bắt đầu (giây) ${n}`,
    end: (n) => `Kết thúc (giây) ${n}`,
    spokenLanguage: 'Đặt ngôn ngữ cho lớp Nội dung đọc',
    vietnamese: 'Tiếng Việt',
    english: 'Tiếng Anh',
    voice: 'Giọng có sẵn',
    controlled: 'Controlled voice',
    scope: 'Các câu cần tạo giọng',
    allCues: 'Toàn bộ lớp nội dung đọc',
    generate: 'Tạo bản nháp âm thanh',
    draftHeading: 'Giọng đã tạo — chưa căn thời gian hay thêm vào video',
    listen: 'Nghe và kiểm tra',
    reviewed: 'Tôi đã đối chiếu nội dung',
    applyVoice: 'Dùng làm bản giọng đọc của dự án',
    voiceApplied: 'Đã thêm bản giọng đọc vào dự án.',
    soundtrackTitle: 'Nhạc / âm thanh thay thế',
    soundtrackPick: 'Chọn tệp…',
    logo: 'Logo',
    framing: 'Khung hình & màu sắc',
    fades: 'Mờ đầu và cuối',
    logoEnable: 'Hiện logo trên video',
    logoAdd: 'Thêm ảnh…',
    logoAnchor: 'Vị trí',
    logoAnchorTopLeft: 'Trên trái',
    nameLabel: 'Tên dự án',
    renamed: 'Tổng kết hè',
    laneClips: 'Đoạn phim',
    laneOriginal: 'Âm gốc',
    laneVoice: 'Giọng đọc',
    laneMusic: 'Nhạc nền',
    burnedIn: 'Gắn cứng',
    clipDisable: 'Tắt đoạn',
    clipEnable: 'Bật đoạn',
    transcribeTab: 'Nhận dạng',
    translateTab: 'Dịch',
    speechSection: 'Nhận dạng giọng nói',
    speechLanguage: 'Đặt ngôn ngữ cho lớp Bản chép lời',
    speechStart: 'Nhận dạng giọng nói',
    speechReview: 'Kết quả chép lời — chưa áp dụng',
    discardResult: 'Bỏ kết quả',
    sourceLayer: 'Lớp nguồn',
    sourceLanguage: 'Đặt ngôn ngữ cho lớp Phụ đề hiển thị',
    translationStart: 'Tạo bản nháp dịch',
    translationReview: 'Duyệt với bản dịch hiện tại',
    toolRail: 'Công cụ',
  },
};

// Reviewer/engineering copy that must never reach a panel: build-state
// disclaimers, bundles, runtime checks, artifacts and "model found" status.
const ENGINEERING_LEAKS = [
  /\bnot yet\b/i,
  /coming soon/i,
  /\bbundle\b/i,
  /\bruntime\b/i,
  /\bartifact\b/i,
  /\bworker\b/i,
  /\bdependenc/i,
  /local components/i,
  /thành phần cục bộ/i,
  /xác minh/i,
];

async function assertNoEngineeringCopy(panel, label) {
  const text = await panel.evaluate((element) => element.innerText);
  for (const pattern of ENGINEERING_LEAKS) {
    assert.ok(!pattern.test(text), `${label} leaks engineering copy matching ${pattern}:\n${text}`);
  }
}

async function commitNumber(page, name, value) {
  const field = page.getByRole('spinbutton', { name, exact: true });
  await field.fill(String(value));
  await field.press('Enter');
  await field.blur();
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Editor visual pass — populated (${locale})`, { timeout: 180000 }, async () => {
    const { temp, userData } = await createTempWorkspace(`reupmatic-visual-${locale}-`);
    const primary = path.join(temp, 'studio-interview.mp4');
    const second = path.join(temp, 'b-roll-cutaway.mp4');
    const unused = path.join(temp, 'unused-take.mp4');
    const lost = path.join(temp, 'lost-take.mp4');
    const music = path.join(temp, 'background-music.wav');
    const logo = path.join(temp, 'studio-mark.png');
    const srt = path.join(temp, 'subs.srt');
    makeSpeechVideo(primary);
    makePlainVideo(second);
    makePlainVideo(unused);
    makePlainVideo(lost);
    makeMusic(music);
    makeLogo(logo);
    await writeFile(
      srt,
      '1\n00:00:00,300 --> 00:00:02,200\nA realistic first line for the cue list\n\n' +
        '2\n00:00:02,600 --> 00:00:04,400\nA second line, slightly longer than the first\n',
    );
    const controlled = await seedControlledSdk(temp);
    const synthesis = await seedSynthesisBundle(userData, temp);
    await seedSpeechBundle(userData, ['en', 'vi']);
    await seedTranslationBundle(userData);

    await runElectronTest(
      {
        temp,
        userData,
        env: { PYTHONPATH: `${controlled}${path.delimiter}${synthesis}` },
        screenshotName: `visual-${locale}-populated-failure.png`,
      },
      async ({ application, page }) => {
        await page.setViewportSize({ width: 1420, height: 900 });
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editor, exact: true }).click();
        }

        // 1. Empty project.
        await shot(page, locale, 'empty');

        // 2. The first video enters through Project media Add….
        await stubOpenDialog(application, [primary]);
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();
        await page.getByText('studio-interview.mp4', { exact: true }).first().waitFor();

        // 3. Every one of the seven tool panels, opened from the rail.
        for (const tool of TOOLS) {
          await page.getByRole('tab', { name: tool[locale], exact: true }).click();
          const panel = page.locator(`#panel-${tool.id}`);
          await panel.waitFor({ state: 'visible' });
          // A single-section panel must not repeat its own tool name as a
          // section heading (UI-T04): Translate and Style carry no heading here.
          if (tool.id === 'translate' || tool.id === 'style') {
            const duplicate = await panel
              .locator('h1, h2, h3, h4, h5, h6')
              .evaluateAll(
                (nodes, name) =>
                  nodes.filter((node) => (node.textContent || '').trim() === name).length,
                tool[locale],
              );
            assert.equal(duplicate, 0, `#panel-${tool.id} repeats its own panel name`);
          }
          await assertNoEngineeringCopy(panel, `#panel-${tool.id}`);
          await shot(page, locale, `panel-${tool.id}`);
          // Clean up on a project without OCR/inpainting is the error state:
          // the panel shows the missing-model status and its Set up action.
          if (tool.id === 'clean-up') await shot(page, locale, 'error');
          await page.getByRole('tab', { name: tool[locale], exact: true }).click();
          await page.locator(`#panel-${tool.id}`).waitFor({ state: 'detached' });
        }

        // 4. Media panel: a used video, an unused video, a missing video, an
        //    unused audio file, the imported subtitle and the logo image. The
        //    left column shows one panel at a time, so Media stays open across
        //    this whole step.
        await openSourcePanel(page, 'media');
        await stubOpenDialog(application, [second, lost]);
        await addMediaToProject(page);
        await page.getByText('b-roll-cutaway.mp4', { exact: true }).first().waitFor();
        await addMediaToProject(page);
        await page.getByText('lost-take.mp4', { exact: true }).first().waitFor();
        await unlink(lost);
        await stubOpenDialog(application, [unused, music, srt, logo]);
        await addMediaToProject(page);
        await page.getByText('unused-take.mp4', { exact: true }).first().waitFor();
        await addMediaToProject(page);
        await page.getByText('background-music.wav', { exact: true }).first().waitFor();
        await addMediaToProject(page);
        await page.getByText('subs.srt', { exact: true }).first().waitFor();
        const media = page.getByRole('tabpanel', { name: copy.projectMedia });
        await page.getByText(copy.missing, { exact: true }).waitFor({ timeout: 20000 });
        // Adding an SRT imports straight into the active (Displayed) layer, so
        // the first text layer already holds two cues — in the Subtitles panel,
        // which the left rail opens in place of Media.
        await openSourcePanel(page, 'cues');
        const displayedLayer = page.getByRole('combobox', { name: copy.editingLayer, exact: true });
        await displayedLayer.waitFor();

        // 5. A spoken cue in a second text layer, so two subtitle lanes exist.
        await displayedLayer.click();
        await page.getByRole('option', { name: copy.spokenLayer }).click();
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const spokenField = page.getByRole('textbox', { name: copy.text(1), exact: true });
        await spokenField.fill(
          locale === 'vi' ? 'Lời dẫn cho đoạn mở đầu.' : 'Narration line for the opening shot.',
        );
        await commitNumber(page, copy.end(1), 4);
        await commitNumber(page, copy.start(1), 0.5);

        // 6. A real voice track from the controlled synthesis double.
        await page.getByRole('tab', { name: TOOLS[2][locale], exact: true }).click();
        await page.locator('#panel-voice').waitFor({ state: 'visible' });
        await page.getByRole('combobox', { name: copy.spokenLanguage, exact: true }).click();
        await page
          .getByRole('option', {
            name: locale === 'vi' ? copy.vietnamese : copy.english,
            exact: true,
          })
          .click();
        // The models have loaded when the voice picker offers the controlled
        // voice; the panel no longer prints a "bundle found" status line.
        await page.getByRole('combobox', { name: copy.voice, exact: true }).click();
        await page
          .getByRole('option', { name: copy.controlled, exact: true })
          .waitFor({ timeout: 30000 });
        await page.getByRole('option', { name: copy.controlled, exact: true }).click();
        await page.getByRole('combobox', { name: copy.scope, exact: true }).click();
        await page.getByRole('option', { name: copy.allCues, exact: true }).click();
        await page.getByRole('button', { name: copy.generate, exact: true }).click();
        await page
          .getByRole('heading', { name: copy.draftHeading, exact: true })
          .waitFor({ timeout: 90000 });
        await page.getByRole('button', { name: copy.listen, exact: true }).click();
        const player = page.locator('audio[controls]');
        await player.waitFor({ timeout: 30000 });
        await player.evaluate(async (element) => {
          element.muted = true;
          try {
            await element.play();
          } catch {
            element.dispatchEvent(new Event('play', { bubbles: true }));
          }
        });
        const reviewed = page.getByRole('checkbox', { name: copy.reviewed });
        await reviewed.waitFor();
        await reviewed.check();
        await page.getByRole('button', { name: copy.applyVoice, exact: true }).click();
        await page.getByText(copy.voiceApplied, { exact: true }).waitFor();
        await page.getByRole('tab', { name: TOOLS[2][locale], exact: true }).click();

        // 7. A recognition run leaves its review in the cue column. It runs
        //    before any composition exists: Transcribe disables its Run once
        //    the project is a composition (composition mode has no speech path).
        await page.getByRole('tab', { name: copy.transcribeTab, exact: true }).click();
        const transcribe = page.locator('#panel-transcribe');
        await transcribe.waitFor({ state: 'visible' });
        const speechSection = transcribe.getByLabel(copy.speechSection, { exact: true });
        const languageField = speechSection.getByRole('combobox', { name: copy.speechLanguage });
        if (await languageField.count()) {
          await languageField.click();
          await transcribe
            .getByRole('option', { name: SPEECH_LANGUAGE[locale], exact: true })
            .click();
        }
        await speechSection.getByRole('button', { name: copy.speechStart, exact: true }).click();
        await page.getByText(copy.speechReview, { exact: true }).waitFor({ timeout: 90000 });
        await shot(page, locale, 'review');
        await page.getByRole('button', { name: copy.discardResult, exact: true }).click();
        await page.getByRole('tab', { name: copy.transcribeTab, exact: true }).click();

        // 8. A logo over the video (its image is a Project media row). This
        //    runs before any composition: with a composition the Edit panel is
        //    the composition's own clip list, which does not carry the logo.
        await page.getByRole('tab', { name: TOOLS[6][locale], exact: true }).click();
        await page.locator('#panel-edit').waitFor({ state: 'visible' });
        await page.getByRole('button', { name: copy.logo, exact: true }).click();
        await page.getByRole('checkbox', { name: copy.logoEnable, exact: true }).check();
        await stubOpenDialog(application, [logo]);
        await page.getByRole('button', { name: copy.logoAdd, exact: true }).click();
        await page.getByRole('combobox', { name: copy.logoAnchor, exact: true }).click();
        await page.getByRole('option', { name: copy.logoAnchorTopLeft, exact: true }).click();
        await page.locator('img[data-monitor-logo="true"]').waitFor();
        await page.getByRole('tab', { name: TOOLS[6][locale], exact: true }).click();

        // 9. Place the second video and disable its clip, so the clips lane has
        //    a dimmed, excluded clip. Placing starts from the Media panel.
        await openSourcePanel(page, 'media');
        const secondRow = media.locator('li').filter({ hasText: 'b-roll-cutaway.mp4' });
        await secondRow.getByRole('button', { name: copy.addToTimeline, exact: true }).click();
        const secondClip = page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'b-roll-cutaway.mp4' })
          .first();
        await secondClip.waitFor();
        await secondClip.click({ button: 'right' });
        await page.getByRole('menu').waitFor();
        // The item's accessible name carries its Kbd shortcut badge ("Disable
        // clip V"), so this is a substring match, as the lane spec does.
        await page.getByRole('menuitem', { name: copy.clipDisable }).click();
        await page.locator('.timeline-action-disabled').first().waitFor();

        // 10. The Edit panel keeps the global framing, fades and logo once a
        //     composition exists — they must not vanish with the single-video
        //     controls, because the recipe they write is global.
        await page.getByRole('tab', { name: TOOLS[6][locale], exact: true }).click();
        const editPanel = page.locator('#panel-edit');
        await editPanel.waitFor({ state: 'visible' });
        for (const title of [copy.framing, copy.fades, copy.logo]) {
          await editPanel.getByRole('button', { name: title, exact: true }).waitFor();
        }
        await assertNoEngineeringCopy(editPanel, '#panel-edit');
        // The panel re-mounts on each open, so expand all three for the shot.
        for (const title of [copy.framing, copy.fades, copy.logo]) {
          await editPanel.getByRole('button', { name: title, exact: true }).click();
        }
        await shot(page, locale, 'panel-edit-composition');
        await page.getByRole('tab', { name: TOOLS[6][locale], exact: true }).click();

        // 11. Media panel, timeline with all lanes, rename.
        await openSourcePanel(page, 'media');
        await shot(page, locale, 'media');
        await page.locator('.timeline-lane-headers').waitFor();
        await shot(page, locale, 'timeline');

        // The ruler's "0" is fully inside the band at the default width — it is
        // not clipped at the left edge.
        const ruler = await page.evaluate(() => {
          const band = document.querySelector('.timeline-band')?.getBoundingClientRect();
          const label = document.querySelector('.timeline-editor-time-unit-scale');
          if (!band || !label) return null;
          const rect = label.getBoundingClientRect();
          return {
            text: (label.textContent || '').trim(),
            left: rect.left,
            right: rect.right,
            width: rect.width,
            bandLeft: band.left,
            bandRight: band.right,
          };
        });
        assert.ok(ruler && ruler.width > 0, 'the ruler has a first scale label');
        assert.equal(ruler.text, '0', 'the first ruler label is the 0 mark');
        assert.ok(
          ruler.left >= ruler.bandLeft - 1 && ruler.right <= ruler.bandRight + 1,
          `the 0 label is fully inside the timeline band (${JSON.stringify(ruler)})`,
        );

        // Every lane header reads at one type size: "Clips" is not larger.
        const laneSizes = await page
          .locator('.timeline-lane-name')
          .evaluateAll((nodes) => [...new Set(nodes.map((n) => getComputedStyle(n).fontSize))]);
        assert.equal(laneSizes.length, 1, `lane headers share one size: ${laneSizes.join(', ')}`);

        // The burned-in marker is the same neutral status as a used row, not the
        // accent reserved for selection/progress/focus (UI-CL02).
        const burned = page
          .locator('.timeline-lane-headers')
          .getByRole('img', { name: copy.burnedIn, exact: true });
        await burned.waitFor();
        const burnedBackground = await burned.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        );
        const usedBackground = await media
          .getByRole('img', { name: copy.used, exact: true })
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor);
        assert.equal(burnedBackground, usedBackground, 'burned-in uses the neutral status colour');

        // The original-audio lane draws a real envelope from the speech-like
        // fixture, not one flat block: more than a couple of distinct bar tops.
        await page.locator('.timeline-waveform canvas').first().waitFor({ timeout: 20000 });
        const wave = await page
          .locator('.timeline-waveform canvas')
          .first()
          .evaluate((canvas) => {
            const context = canvas.getContext('2d');
            const { width, height } = canvas;
            const data = context.getImageData(0, 0, width, height).data;
            const tops = new Set();
            for (let x = 0; x < width; x += 1) {
              for (let y = 0; y < height; y += 1) {
                if (data[(y * width + x) * 4 + 3] > 8) {
                  tops.add(y);
                  break;
                }
              }
            }
            return { width, height, distinctTops: tops.size };
          });
        assert.ok(
          wave.distinctTops > 3,
          `the waveform shows a real envelope, not a flat block (${JSON.stringify(wave)})`,
        );
        // With a project open the header title is the project's name and
        // clicking it renames in place; the picker (and its shot) belongs to
        // the empty state (D-63, owner).
        await page.locator('.editor-project-header button').first().click();
        const nameField = page.getByRole('textbox', { name: copy.nameLabel, exact: true });
        await nameField.waitFor();
        await nameField.fill(copy.renamed);
        await shot(page, locale, 'rename');
        await nameField.press('Enter');
        await page.getByRole('button', { name: copy.renamed, exact: true }).waitFor();

        // 11. The icon-only rail stays centred and named at 1050×700
        //     (D-63, owner).
        await page.setViewportSize({ width: 1050, height: 700 });
        await page.locator('.editor-tool-rail').waitFor();
        const rail = await page.evaluate(() => {
          const railBox = document.querySelector('.editor-tool-rail').getBoundingClientRect();
          return [...document.querySelectorAll('.editor-tool-rail [role="tab"]')].map((element) => {
            const icon = element.querySelector('svg').getBoundingClientRect();
            return {
              name: element.getAttribute('aria-label'),
              text: (element.textContent || '').trim(),
              offCentre: Math.abs(icon.left + icon.width / 2 - (railBox.left + railBox.width / 2)),
              flushRight: Math.abs(railBox.right - window.innerWidth),
            };
          });
        });
        assert.equal(rail.length, 7, 'seven rail items');
        for (const item of rail) {
          assert.ok(item.name, 'every rail item has an accessible name');
          assert.equal(item.text, '', `rail item "${item.name}" shows no label text`);
          assert.ok(
            item.offCentre <= 1,
            `rail item "${item.name}" is ${item.offCentre}px off centre`,
          );
          assert.ok(item.flushRight <= 1, 'the rail sits flush against the window edge');
        }
      },
    );
  });
}

async function activeInfo(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element) return null;
    return {
      id: element.id,
      tag: element.tagName,
      role: element.getAttribute('role'),
      label: element.getAttribute('aria-label'),
      text: (element.textContent || '').trim().slice(0, 48),
      inPanel: Boolean(element.closest('.editor-side-panel-body')),
    };
  });
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Editor keyboard-only walk (${locale})`, { timeout: 120000 }, async () => {
    const { temp, userData } = await createTempWorkspace(`reupmatic-keyboard-${locale}-`);
    const primary = path.join(temp, 'keyboard-cut.mp4');
    const second = path.join(temp, 'keyboard-insert.mp4');
    makePlainVideo(primary, 6);
    makePlainVideo(second, 3);

    await runElectronTest(
      { temp, userData, screenshotName: `visual-${locale}-keyboard-failure.png` },
      async ({ application, page }) => {
        await page.setViewportSize({ width: 1420, height: 900 });
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editor, exact: true }).click();
        }
        await stubOpenDialog(application, [primary, second]);
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();
        await addMediaToProject(page);
        await openSourcePanel(page, 'media');
        await page.getByText('keyboard-insert.mp4', { exact: true }).first().waitFor();

        // Header: the project title is the first focusable control and Tab moves on.
        // With a project open it is the rename trigger, not the picker.
        const title = page.locator('.editor-project-header button').first();
        await title.focus();
        const headerStart = await activeInfo(page);
        assert.ok(headerStart.text.length > 0, 'the header title is focused');
        await page.keyboard.press('Tab');
        const afterTab = await activeInfo(page);
        assert.notEqual(afterTab.text, headerStart.text, 'Tab leaves the header title');

        // Media panel: its Add… control and a row's own menu are reachable by keyboard.
        await openSourcePanel(page, 'media');
        const addButton = page.locator('.project-media > button').first();
        await addButton.focus();
        assert.equal((await activeInfo(page)).text, copy.addMedia, 'Add… holds focus');
        const rowMenu = page.getByRole('button', {
          name: copy.rowActions('keyboard-insert.mp4'),
          exact: true,
        });
        await rowMenu.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('menu').waitFor();
        await page.getByRole('menuitem', { name: copy.addToTimeline }).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'hidden' });

        // Cue list: Add cue activates from the keyboard.
        await openSourcePanel(page, 'cues');
        const addCue = page.getByRole('button', { name: copy.addCue, exact: true });
        await addCue.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('textbox', { name: copy.text(1), exact: true }).waitFor();

        // Rail: Up/Down move between tabs, Enter opens, Tab moves into the panel,
        // Escape collapses.
        await page.locator('#tab-transcribe').focus();
        await page.keyboard.press('ArrowDown');
        assert.equal((await activeInfo(page)).id, 'tab-translate', 'ArrowDown moves one rail item');
        await page.keyboard.press('ArrowDown');
        assert.equal((await activeInfo(page)).id, 'tab-voice', 'ArrowDown moves to Voice');
        await page.keyboard.press('Enter');
        await page.locator('#panel-voice').waitFor({ state: 'visible' });
        assert.equal((await activeInfo(page)).id, 'tab-voice', 'Enter keeps focus on the tab');
        await shot(page, locale, 'focus-rail');
        await page.keyboard.press('Tab');
        assert.equal(
          (await activeInfo(page)).inPanel,
          true,
          'Tab moves from the rail into the open panel',
        );
        await page.locator('#tab-voice').focus();
        await page.keyboard.press('Escape');
        await page.locator('#panel-voice').waitFor({ state: 'detached' });

        // Timeline: a composition clip's own menu opens with Shift+F10 on the
        // focused label — no pointer required. Placing it starts from the
        // Media panel's row.
        await openSourcePanel(page, 'media');
        const row = page.locator('.project-media li').filter({ hasText: 'keyboard-insert.mp4' });
        await row.getByRole('button', { name: copy.addToTimeline, exact: true }).click();
        const clip = page
          .locator('.timeline-editor-action .timeline-action-label')
          .filter({ hasText: 'keyboard-insert.mp4' })
          .first();
        await clip.waitFor();
        await clip.focus();
        assert.ok(
          (await activeInfo(page)).text.includes('keyboard-insert.mp4'),
          'the clip label can hold keyboard focus',
        );
        // Shift+F10 / the Menu key makes the browser fire a `contextmenu` event
        // (0,0 coordinates, detail 0) at the focused element; Playwright's
        // synthetic key does not emit it, so the exact event is dispatched.
        await clip.dispatchEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 0,
          clientY: 0,
        });
        await page.getByRole('menu').waitFor();
        await page.getByRole('menuitem', { name: copy.clipDisable }).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'hidden' });
      },
    );
  });
}

test('Vietnamese IME commits diacritics in a tool panel and the project name', {
  timeout: 120000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-visual-ime-');
  const video = path.join(temp, 'ime-cut.mp4');
  makePlainVideo(video, 4);
  const vi = COPY.vi;

  await runElectronTest(
    { temp, userData, screenshotName: 'visual-vi-ime-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await chooseLocale(application, page, 'vi');
      await page.getByRole('button', { name: vi.editor, exact: true }).click();
      await stubOpenDialog(application, [video]);
      await addMediaToProject(page);
      await page.locator('.viewers video').waitFor();

      // A tool panel's own text field: the Style panel's installed-font field.
      await page.getByRole('tab', { name: 'Kiểu chữ', exact: true }).click();
      const style = page.locator('#panel-style');
      await style.waitFor({ state: 'visible' });
      const fontField = style.getByRole('textbox', { name: 'Tên font đã cài', exact: true });
      await fontField.fill('');
      await composeText(page, fontField, 'Phông chữ Việt — Đà Nẵng');
      assert.equal(await fontField.inputValue(), 'Phông chữ Việt — Đà Nẵng');

      // The project rename field in the header: the title itself starts it
      // (D-63, owner — no separate pencil).
      await page.locator('.editor-project-header button').first().click();
      const nameField = page.getByRole('textbox', { name: vi.nameLabel, exact: true });
      await nameField.waitFor();
      await nameField.fill('');
      await composeText(page, nameField, 'Dự án Đà Nẵng');
      assert.equal(await nameField.inputValue(), 'Dự án Đà Nẵng');
    },
  );
});

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Editor missing-model actions (set up and re-check) are one treatment (${locale})`, {
    timeout: 120000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace(`reupmatic-setup-${locale}-`);
    const video = path.join(temp, 'setup-cut.mp4');
    makePlainVideo(video, 4);
    const tools = ['transcribe', 'translate', 'voice', 'clean-up'];

    await runElectronTest(
      { temp, userData, screenshotName: `visual-${locale}-setup-failure.png` },
      async ({ application, page }) => {
        await page.setViewportSize({ width: 1420, height: 900 });
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editor, exact: true }).click();
        }
        await stubOpenDialog(application, [video]);
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();

        const shapes = new Set();
        for (const id of tools) {
          const tool = TOOLS.find((entry) => entry.id === id);
          await page.getByRole('tab', { name: tool[locale], exact: true }).click();
          const panel = page.locator(`#panel-${id}`);
          await panel.waitFor({ state: 'visible' });
          await panel
            .getByRole('button', { name: copy.setUp, exact: true })
            .first()
            .waitFor({ timeout: 30000 });
          const found = await panel.evaluate(
            (element, [setUpLabel, recheckLabel]) => {
              const style = getComputedStyle(element);
              const contentLeft =
                element.getBoundingClientRect().x + Number.parseFloat(style.paddingLeft);
              return [...element.querySelectorAll('button')]
                .filter((button) =>
                  [setUpLabel, recheckLabel].includes((button.textContent || '').trim()),
                )
                .map((button) => {
                  const computed = getComputedStyle(button);
                  const text = (button.textContent || '').trim();
                  const row = button.closest('.action-row');
                  return {
                    text,
                    kind: text === recheckLabel ? 'recheck' : 'setUp',
                    // The re-check must sit in the same action row as Set up,
                    // never inline beside the section title.
                    sameRowAsSetUp: Boolean(
                      row &&
                        [...row.querySelectorAll('button')].some(
                          (sibling) => (sibling.textContent || '').trim() === setUpLabel,
                        ),
                    ),
                    inset: Number((button.getBoundingClientRect().x - contentLeft).toFixed(1)),
                    background: computed.backgroundColor,
                    borderWidth: computed.borderTopWidth,
                    padding: computed.paddingLeft,
                  };
                });
            },
            [copy.setUp, copy.recheck],
          );
          assert.ok(
            found.some((button) => button.kind === 'setUp'),
            `${id} shows a Set up action`,
          );
          const rechecks = found.filter((button) => button.kind === 'recheck');
          assert.ok(rechecks.length >= 1, `${id} shows a re-check action`);
          for (const button of rechecks) {
            assert.equal(
              button.sameRowAsSetUp,
              true,
              `${id}: the re-check must share the Set up action row`,
            );
          }
          const firstInset = Math.min(...found.map((button) => Math.abs(button.inset)));
          assert.ok(
            firstInset <= 1,
            `${id}: the action row starts ${firstInset}px off the column edge`,
          );
          for (const button of found) {
            shapes.add(`${button.background}|${button.borderWidth}|${button.padding}`);
          }
          await page.getByRole('tab', { name: tool[locale], exact: true }).click();
        }
        assert.equal(shapes.size, 1, 'every model action shares one visual treatment');
        const [shape] = [...shapes];
        assert.notEqual(
          shape.split('|')[0],
          'rgba(0, 0, 0, 0)',
          'the model actions paint a button surface, not a bare ghost label',
        );
      },
    );
  });
}
