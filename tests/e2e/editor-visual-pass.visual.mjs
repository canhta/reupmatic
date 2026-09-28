import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { composeText } from './helpers/ime.mjs';
import { seedSynthesisBundle } from './helpers/synthesis.mjs';
import {
  addMediaToProject,
  chooseLocale,
  openSourcePanel,
  settleAnimations,
  waitForEditorReady,
} from './ui-actions.mjs';

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
  { id: 'text', en: 'Text', vi: 'Kiểu chữ' },
  { id: 'audio', en: 'Audio', vi: 'Âm thanh' },
  { id: 'video', en: 'Video', vi: 'Video' },
];

const COPY = {
  en: {
    editor: 'Editor',
    untitled: 'Untitled project',
    projectMedia: 'Media',
    addMedia: 'Add media',
    setUp: 'Set up…',
    recheck: 'Check again',
    moreActions: 'More actions',
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
    start: (n) => `Start (s) ${n}`,
    end: (n) => `End (s) ${n}`,
    spokenLanguage: 'Language',
    vietnamese: 'Vietnamese',
    english: 'English',
    voice: 'Voice',
    controlled: 'Controlled voice',
    scope: 'Lines',
    allCues: 'All',
    generate: 'Generate voice',
    speechCaptured: 'Captured speech timing',
    listen: 'Listen',
    reviewed: 'I listened',
    applyVoice: 'Apply',
    voiceApplied: 'Voice added',
    soundtrackTitle: 'Music',
    soundtrackPick: 'Choose file…',
    logo: 'Logo',
    frame: 'Frame',
    fades: 'Fade',
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
    createView: 'Create',
    captionSource: 'Source',
    translateSource: 'Translate',
    speechLanguage: 'Language',
    speechStart: 'Create',
    speechReview: 'Transcript draft',
    discardResult: 'Discard',
    sourceLayer: 'From',
    sourceLanguage: 'Language',
    translationStart: 'Create',
    toolRail: 'Tools',
  },
  vi: {
    editor: 'Editor',
    untitled: 'Dự án chưa đặt tên',
    projectMedia: 'Phương tiện',
    addMedia: 'Thêm phương tiện',
    setUp: 'Thiết lập…',
    recheck: 'Kiểm tra lại',
    moreActions: 'Thao tác khác',
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
    start: (n) => `Bắt đầu (s) ${n}`,
    end: (n) => `Kết thúc (s) ${n}`,
    spokenLanguage: 'Ngôn ngữ',
    vietnamese: 'Tiếng Việt',
    english: 'Tiếng Anh',
    voice: 'Giọng đọc',
    controlled: 'Controlled voice',
    scope: 'Câu',
    allCues: 'Tất cả',
    generate: 'Tạo giọng',
    speechCaptured: 'Captured speech timing',
    listen: 'Nghe',
    reviewed: 'Đã nghe',
    applyVoice: 'Áp dụng',
    voiceApplied: 'Đã thêm giọng',
    soundtrackTitle: 'Nhạc',
    soundtrackPick: 'Chọn tệp…',
    logo: 'Logo',
    frame: 'Khung hình',
    fades: 'Mờ dần',
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
    createView: 'Tạo',
    captionSource: 'Nguồn',
    translateSource: 'Dịch',
    speechLanguage: 'Ngôn ngữ',
    speechStart: 'Tạo',
    speechReview: 'Bản nháp chép lời',
    discardResult: 'Bỏ',
    sourceLayer: 'Từ',
    sourceLanguage: 'Ngôn ngữ',
    translationStart: 'Tạo',
    toolRail: 'Công cụ',
  },
};

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

        await shot(page, locale, 'empty');

        await stubOpenDialog(application, [primary]);
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();
        await page.getByText('studio-interview.mp4', { exact: true }).first().waitFor();

        for (const tool of TOOLS) {
          await page.getByRole('tab', { name: tool[locale], exact: true }).click();
          const panel = page.locator(`#panel-${tool.id}`);
          await panel.waitFor({ state: 'visible' });
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
          await page.getByRole('tab', { name: tool[locale], exact: true }).click();
          await page.locator(`#panel-${tool.id}`).waitFor({ state: 'detached' });
        }

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
        await openSourcePanel(page, 'captions');
        const displayedLayer = page.getByRole('combobox', { name: copy.editingLayer, exact: true });
        await displayedLayer.waitFor();

        await displayedLayer.click();
        await page.getByRole('option', { name: copy.spokenLayer }).click();
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const spokenField = page.getByRole('textbox', { name: copy.text(1), exact: true });
        await spokenField.fill(
          locale === 'vi' ? 'Lời dẫn cho đoạn mở đầu.' : 'Narration line for the opening shot.',
        );
        await commitNumber(page, copy.end(1), 4);
        await commitNumber(page, copy.start(1), 0.5);

        await page.getByRole('tab', { name: TOOLS[1][locale], exact: true }).click();
        await page.locator('#panel-audio').waitFor({ state: 'visible' });
        await page.getByRole('combobox', { name: copy.spokenLanguage, exact: true }).click();
        await page
          .getByRole('option', {
            name: locale === 'vi' ? copy.vietnamese : copy.english,
            exact: true,
          })
          .click();
        await page.getByRole('combobox', { name: copy.voice, exact: true }).click();
        await page
          .getByRole('option', { name: copy.controlled, exact: true })
          .waitFor({ timeout: 30000 });
        await page.getByRole('option', { name: copy.controlled, exact: true }).click();
        await page
          .getByRole('radiogroup', { name: copy.scope, exact: true })
          .getByRole('radio', { name: copy.allCues, exact: true })
          .click();
        await page
          .locator('aside:has(#panel-audio)')
          .getByRole('button', { name: copy.generate, exact: true })
          .click();
        await page
          .getByRole('list', { name: copy.speechCaptured, exact: true })
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
        await page
          .locator('aside:has(#panel-audio)')
          .getByRole('button', { name: copy.applyVoice, exact: true })
          .click();
        await page.getByText(copy.voiceApplied, { exact: true }).waitFor();
        await page.getByRole('tab', { name: TOOLS[1][locale], exact: true }).click();

        await openSourcePanel(page, 'captions');
        const transcribe = page.locator('#panel-captions');
        await transcribe.waitFor({ state: 'visible' });
        // Cues opens by default; Create holds the Speech/Screen/Translate/SRT sources.
        await page.getByRole('button', { name: copy.createView, exact: true }).click();
        const languageField = transcribe.getByRole('combobox', { name: copy.speechLanguage });
        if (await languageField.count()) {
          await languageField.click();
          await transcribe
            .getByRole('option', { name: SPEECH_LANGUAGE[locale], exact: true })
            .click();
        }
        await page
          .locator('aside:has(#panel-captions)')
          .getByRole('button', { name: copy.speechStart, exact: true })
          .click();
        await page
          .getByRole('list', { name: copy.speechReview, exact: true })
          .waitFor({ timeout: 90000 });
        await shot(page, locale, 'review');
        await page
          .locator('aside:has(#panel-captions)')
          .getByRole('button', { name: copy.discardResult, exact: true })
          .click();
        await page.locator('.editor-source-rail [role="tab"][data-rail-item="captions"]').click();

        await page.getByRole('tab', { name: TOOLS[2][locale], exact: true }).click();
        await page.locator('#panel-video').waitFor({ state: 'visible' });
        // The Video panel has no Collapsibles any more — every section is already visible.
        await page.getByRole('switch', { name: copy.logo, exact: true }).check();
        await stubOpenDialog(application, [logo]);
        await page.getByRole('button', { name: copy.logoAdd, exact: true }).click();
        await page.getByRole('button', { name: copy.logoAnchorTopLeft, exact: true }).click();
        await page.locator('img[data-monitor-logo="true"]').waitFor();
        await page.getByRole('tab', { name: TOOLS[2][locale], exact: true }).click();

        await openSourcePanel(page, 'media');
        const secondRow = media.locator('li').filter({ hasText: 'b-roll-cutaway.mp4' });
        // "Add to timeline" moved off the row and into its ⋯ menu.
        await secondRow
          .getByRole('button', { name: copy.rowActions('b-roll-cutaway.mp4'), exact: true })
          .click();
        await page.getByRole('menuitem', { name: copy.addToTimeline, exact: true }).click();
        const secondClip = page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'b-roll-cutaway.mp4' })
          .first();
        await secondClip.waitFor();
        await secondClip.click({ button: 'right' });
        await page.getByRole('menu').waitFor();
        await page.getByRole('menuitem', { name: copy.clipDisable }).click();
        await page.locator('.timeline-action-disabled').first().waitFor();

        await page.getByRole('tab', { name: TOOLS[2][locale], exact: true }).click();
        const editPanel = page.locator('#panel-video');
        await editPanel.waitFor({ state: 'visible' });
        // No Collapsibles here any more: every section heading is already visible.
        for (const title of [copy.frame, copy.fades, copy.logo]) {
          await editPanel.getByRole('heading', { name: title, exact: true }).waitFor();
        }
        await assertNoEngineeringCopy(editPanel, '#panel-video');
        await shot(page, locale, 'panel-edit-composition');
        await page.getByRole('tab', { name: TOOLS[2][locale], exact: true }).click();

        await openSourcePanel(page, 'media');
        await shot(page, locale, 'media');
        await page.locator('.timeline-lane-headers').waitFor();
        await shot(page, locale, 'timeline');

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

        const laneSizes = await page
          .locator('.timeline-lane-name')
          .evaluateAll((nodes) => [...new Set(nodes.map((n) => getComputedStyle(n).fontSize))]);
        assert.equal(laneSizes.length, 1, `lane headers share one size: ${laneSizes.join(', ')}`);

        // The Media row's neutral "used" StatusDot is gone (usage is plain description text
        // now), so there is no second neutral indicator left to compare this against.
        const burned = page
          .locator('.timeline-lane-headers')
          .getByRole('img', { name: copy.burnedIn, exact: true });
        await burned.waitFor();

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
        await page.locator('.editor-project-header button').first().click();
        const nameField = page.getByRole('textbox', { name: copy.nameLabel, exact: true });
        await nameField.waitFor();
        await nameField.fill(copy.renamed);
        await shot(page, locale, 'rename');
        await nameField.press('Enter');
        await page.getByRole('button', { name: copy.renamed, exact: true }).waitFor();

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
        assert.equal(rail.length, 6, 'six rail items');
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
      inPanel: Boolean(element.closest('.side-panel-content')),
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

        const title = page.locator('.editor-project-header button').first();
        await title.focus();
        const headerStart = await activeInfo(page);
        assert.ok(headerStart.text.length > 0, 'the header title is focused');
        await page.keyboard.press('Tab');
        const afterTab = await activeInfo(page);
        assert.notEqual(afterTab.text, headerStart.text, 'Tab leaves the header title');

        await openSourcePanel(page, 'media');
        // The Add button lives in the drawer header now, not inside .project-media.
        const addButton = page.getByRole('button', { name: copy.addMedia, exact: true });
        await addButton.focus();
        assert.equal((await activeInfo(page)).text, copy.addMedia, 'Add media holds focus');
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

        await openSourcePanel(page, 'captions');
        const addCue = page.getByRole('button', { name: copy.addCue, exact: true });
        await addCue.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('textbox', { name: copy.text(1), exact: true }).waitFor();

        // Transcribe/Translate/Voice no longer have their own rail tabs: Speech and Translate
        // are Create-view sources inside Captions, and voice generation lives in Audio.
        await page.locator('#tab-text').focus();
        await page.keyboard.press('ArrowDown');
        assert.equal((await activeInfo(page)).id, 'tab-audio', 'ArrowDown moves one rail item');
        await page.keyboard.press('Enter');
        await page.locator('#panel-audio').waitFor({ state: 'visible' });
        assert.equal((await activeInfo(page)).id, 'tab-audio', 'Enter keeps focus on the tab');
        await shot(page, locale, 'focus-rail');
        await page.keyboard.press('Tab');
        assert.equal(
          (await activeInfo(page)).inPanel,
          true,
          'Tab moves from the rail into the open panel',
        );
        await page.locator('#tab-audio').focus();
        await page.keyboard.press('Escape');
        await page.locator('#panel-audio').waitFor({ state: 'detached' });

        await openSourcePanel(page, 'media');
        const row = page.locator('.project-media li').filter({ hasText: 'keyboard-insert.mp4' });
        await row
          .getByRole('button', { name: copy.rowActions('keyboard-insert.mp4'), exact: true })
          .click();
        await page.getByRole('menuitem', { name: copy.addToTimeline, exact: true }).click();
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
        // Playwright's synthetic Shift+F10 does not emit contextmenu; dispatch it.
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

      await page.getByRole('tab', { name: 'Kiểu chữ', exact: true }).click();
      const style = page.locator('#panel-text');
      await style.waitFor({ state: 'visible' });
      // "Text color" is now a ColorRow: the free-text field inside it is always named "Hex".
      const styleTextField = style.getByRole('textbox', { name: 'Mã hex', exact: true }).first();
      await styleTextField.fill('');
      await composeText(page, styleTextField, 'Phông chữ Việt — Đà Nẵng');
      assert.equal(await styleTextField.inputValue(), 'Phông chữ Việt — Đà Nẵng');

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

  test(`Editor missing-model actions show Set up as the primary command, Check again in ⋯ (${locale})`, {
    timeout: 120000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace(`reupmatic-setup-${locale}-`);
    const video = path.join(temp, 'setup-cut.mp4');
    makePlainVideo(video, 4);

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

        // Speech and Translate are Create-view sources inside Captions now; voice generation
        // lives in Audio. A missing model replaces the whole primary command with Set up (it no
        // longer sits beside a disabled Create/Generate), and Check again moved into the
        // footer's ⋯ menu — so there is no more "same row" pairing to check, only that every
        // surface renders the one Set up treatment and still offers Check again.
        const surfaces = ['speech', 'translate', 'voice'];
        const backgrounds = new Set();
        for (const id of surfaces) {
          if (id === 'voice') {
            await page.getByRole('tab', { name: TOOLS[1][locale], exact: true }).click();
          } else {
            await openSourcePanel(page, 'captions');
            await page.getByRole('button', { name: copy.createView, exact: true }).click();
            if (id === 'translate') {
              await page
                .getByRole('radiogroup', { name: copy.captionSource, exact: true })
                .getByRole('radio', { name: copy.translateSource, exact: true })
                .click();
            }
          }
          const panelId = id === 'voice' ? 'panel-audio' : 'panel-captions';
          await page.locator(`#${panelId}`).waitFor({ state: 'visible' });
          const aside = page.locator(`aside:has(#${panelId})`);
          const setUp = aside.getByRole('button', { name: copy.setUp, exact: true });
          await setUp.waitFor({ timeout: 30000 });
          backgrounds.add(
            await setUp.evaluate((element) => getComputedStyle(element).backgroundColor),
          );
          await aside.getByRole('button', { name: copy.moreActions, exact: true }).click();
          await page.getByRole('menuitem', { name: copy.recheck, exact: true }).waitFor();
          await page.keyboard.press('Escape');
        }
        assert.equal(backgrounds.size, 1, 'every Set up action shares one visual treatment');
        const [background] = [...backgrounds];
        assert.notEqual(
          background,
          'rgba(0, 0, 0, 0)',
          'Set up paints a button surface, not a bare ghost label',
        );
      },
    );
  });
}
