import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { pythonExecutable } from '../../scripts/python.mjs';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { composeText } from './helpers/ime.mjs';
import { addMediaToProject, chooseLocale, waitForEditorReady } from './ui-actions.mjs';

const run = promisify(execFile);

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

async function createVideo(filePath) {
  await run(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30:duration=12',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:duration=12',
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

const COPY = {
  en: {
    editingLayer: 'Layer',
    spokenLayer: /^Spoken text/,
    addCue: 'Add cue',
    text: (n) => `Text ${n}`,
    start: (n) => `Start (s) ${n}`,
    end: (n) => `End (s) ${n}`,
    voiceTab: 'Voice',
    setSpokenLanguage: 'Spoken text language',
    vietnamese: 'Vietnamese',
    voice: 'Preset voice',
    scope: 'Cues to generate',
    allCues: 'All spoken cues',
    generate: 'Generate voice',
    running: 'Generating speech',
    draftHeading: 'Generated voice — not applied',
    comparison: 'Captured speech timing',
    gridHeaders: [
      'Captured spoken text',
      'Slot (s)',
      'Speech (s)',
      'Compressed (%)',
      'Overrun (s)',
    ],
    engineNatural: 'This engine speaks at its natural rate; the plan placed each line.',
    listen: 'Listen',
    reviewed: 'I checked the text and listened for problems.',
    apply: 'Apply voice',
    applied: 'Voice track added to the project.',
    missing: 'No local voice model is configured.',
    setUp: 'Set up…',
    voicePanel: 'Generated voice',
    voiceNone: 'No generated narration is applied to this project.',
    voiceMix: 'Mix with source',
    voiceGain: 'Narration level (dB)',
    voiceFadeIn: 'Fade in (s)',
    voiceFadeOut: 'Fade out (s)',
    audition: 'Preview',
    keepVoice: 'Keep audio',
    remove: 'Remove narration',
    staleVoice: /The timeline or spoken text changed/,
    editorArea: 'Editor',
  },
  vi: {
    editingLayer: 'Lớp',
    spokenLayer: /^Nội dung đọc/,
    addCue: 'Thêm câu',
    text: (n) => `Nội dung ${n}`,
    start: (n) => `Bắt đầu (s) ${n}`,
    end: (n) => `Kết thúc (s) ${n}`,
    voiceTab: 'Giọng đọc',
    setSpokenLanguage: 'Ngôn ngữ lớp Nội dung đọc',
    vietnamese: 'Tiếng Việt',
    voice: 'Giọng có sẵn',
    scope: 'Các câu cần tạo giọng',
    allCues: 'Toàn bộ lớp nội dung đọc',
    generate: 'Tạo giọng',
    running: 'Đang tạo giọng nói',
    draftHeading: 'Giọng đã tạo — chưa áp dụng',
    comparison: 'Thời gian giọng đã chụp',
    gridHeaders: [
      'Nội dung đọc đã chụp',
      'Khoảng khả dụng (s)',
      'Lời nói (s)',
      'Đã nén (%)',
      'Vượt (s)',
    ],
    engineNatural: 'Bộ máy này đọc ở tốc độ tự nhiên; kế hoạch đặt vị trí từng câu.',
    listen: 'Nghe',
    reviewed: 'Tôi đã đối chiếu nội dung và nghe kiểm tra.',
    apply: 'Áp dụng giọng',
    applied: 'Đã thêm bản giọng đọc vào dự án.',
    missing: 'Chưa cấu hình mô hình giọng nói cục bộ.',
    setUp: 'Thiết lập…',
    voicePanel: 'Giọng đã tạo',
    voiceNone: 'Chưa áp dụng giọng đọc nào cho project này.',
    voiceMix: 'Trộn với nguồn',
    voiceGain: 'Âm lượng giọng đọc (dB)',
    voiceFadeIn: 'Mờ vào (s)',
    voiceFadeOut: 'Mờ ra (s)',
    audition: 'Xem thử',
    keepVoice: 'Giữ âm thanh',
    remove: 'Bỏ giọng đọc',
    staleVoice: /Dòng thời gian hoặc nội dung đọc đã đổi/,
    editorArea: 'Editor',
  },
};

const CUES = [
  { text: 'Xin chào, đây là bản tin buổi sáng.', start: 0, end: 3 },
  { text: 'Hà Nội hôm nay nhiều mây và có mưa nhẹ.', start: 4.5, end: 8 },
  { text: 'Cảm ơn bạn đã theo dõi chương trình.', start: 9.5, end: 12 },
];

const SIZES = [
  [1420, 900],
  [1050, 700],
];

const LEAKS = [
  /\bnot yet\b/i,
  /coming soon/i,
  /sắp ra mắt/i,
  /REUPMATIC_/,
  /docs\//,
  /\.md\b/,
  /\bbundle\b/i,
  /\bruntime\b/i,
  /\bartifact\b/i,
  /\bworker\b/i,
  /\bdependenc/i,
  /failed verification/i,
  /lỗi xác minh/i,
  /local components/i,
  /thành phần cục bộ/i,
  /xác minh/i,
];

function assertNoEngineeringLeak(text) {
  for (const pattern of LEAKS) {
    const match = pattern.exec(text);
    assert.ok(
      !match,
      `user-facing copy must not leak engineering context; matched ${pattern}` +
        (match ? ` near "${text.slice(Math.max(0, match.index - 60), match.index + 60)}"` : ''),
    );
  }
}

function artifactPath(name) {
  return path.join(root, '.test-artifacts', name);
}

async function scrollToTopOf(_page, locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'start' }));
}

// Astryx truncates headers and scrollWidth misses it, so measure text with a Range.
async function assertHeadersFit(table, headers) {
  for (const header of headers) {
    const cell = table.getByRole('columnheader', { name: header, exact: true });
    await cell.waitFor();
    const measured = await cell.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const style = getComputedStyle(element);
      const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd);
      return {
        content: range.getBoundingClientRect().width,
        available: element.clientWidth - padding,
        text: element.textContent,
      };
    });
    assert.ok(
      measured.content <= measured.available + 1,
      `header "${measured.text}" truncates: text ${measured.content}px wider than its ` +
        `${measured.available}px content box`,
    );
  }
}

async function focusedDescription(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const ids = el.getAttribute('aria-labelledby');
    if (ids)
      return ids
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent?.trim() || el.tagName;
    }
    return el.textContent?.trim() || el.tagName;
  });
}

async function commitNumber(page, name, value) {
  const field = page.getByRole('spinbutton', { name, exact: true });
  await field.fill(String(value));
  await field.press('Enter');
  await field.blur();
}

async function showVoicePanel(page, copy, width, height) {
  await page.setViewportSize({ width, height });
  const panel = page.locator('#panel-voice');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
  }
  await panel.waitFor({ state: 'visible' });
}

async function generateReview(page, copy) {
  await page.getByRole('combobox', { name: copy.voice, exact: true }).click();
  await page
    .getByRole('option', { name: 'Controlled voice', exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole('option', { name: 'Controlled voice', exact: true }).click();
  await page.getByRole('combobox', { name: copy.scope, exact: true }).click();
  await page.getByRole('option', { name: copy.allCues, exact: true }).click();
  await page.getByRole('button', { name: copy.generate, exact: true }).click();
  await page.getByText(copy.running, { exact: false }).first().waitFor({ timeout: 10000 });
  await page
    .getByRole('heading', { name: copy.draftHeading, exact: true })
    .waitFor({ timeout: 90000 });
}

async function listenAndAttest(page, copy) {
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
  assert.equal(await reviewed.isChecked(), true);
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Voice track: generated, reviewed and tuned by keyboard (${locale})`, {
    timeout: 110000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-voice-track-');
    const video = path.join(temp, 'voice-track.mp4');
    await createVideo(video);
    const sdk = await seedSynthesisBundle(userData, temp);

    await runElectronTest(
      {
        temp,
        userData,
        env: { PYTHONPATH: sdk },
        screenshotName: `voice-track-${locale}-failure.png`,
      },
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
        await page.getByRole('combobox', { name: copy.editingLayer, exact: true }).click();
        await page.getByRole('option', { name: copy.spokenLayer }).click();
        for (const [index, cue] of CUES.entries()) {
          await page.getByRole('button', { name: copy.addCue, exact: true }).click();
          const n = index + 1;
          const field = page.getByRole('textbox', { name: copy.text(n), exact: true });
          await composeText(page, field, cue.text);
          assert.equal(
            await field.inputValue(),
            cue.text,
            'IME-composed Vietnamese text must survive in the spoken cue',
          );
          // Commit end before start: a second commit can overwrite the first (CuePanel defect).
          await commitNumber(page, copy.end(n), cue.end);
          await commitNumber(page, copy.start(n), cue.start);
        }

        await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
        await page.locator('#panel-voice').waitFor({ state: 'visible' });
        await page.getByRole('combobox', { name: copy.setSpokenLanguage, exact: true }).click();
        await page.getByRole('option', { name: copy.vietnamese, exact: true }).click();

        await page.getByText(copy.voiceNone, { exact: true }).waitFor();

        await generateReview(page, copy);
        const reviewTable = page.getByRole('table', { name: copy.comparison, exact: true });
        await assertHeadersFit(reviewTable, copy.gridHeaders);
        const firstRow = reviewTable.getByRole('row').filter({ hasText: CUES[0].text }).first();
        const firstRowText = await firstRow.innerText();
        assert.match(firstRowText, /4\.500/, 'the slot length must be shown in seconds');
        assert.match(firstRowText, /0\.100/, 'the speech length must be shown in seconds');
        assert.match(firstRowText, /0\.000/, 'the overrun must be shown in seconds, not hidden');
        await page.getByText(copy.engineNatural, { exact: true }).waitFor();
        assertNoEngineeringLeak(await page.evaluate(() => document.body.innerText));

        await scrollToTopOf(page, reviewTable);
        await page.screenshot({ path: artifactPath(`voice-track-${locale}-review-1420x900.png`) });

        await listenAndAttest(page, copy);
        await page.getByRole('button', { name: copy.listen, exact: true }).focus();
        // Native <audio controls> adds shadow-DOM tab stops before focus leaves it.
        const seen = [];
        for (let i = 0; i < 14; i += 1) {
          await page.keyboard.press('Tab');
          seen.push(await focusedDescription(page));
        }
        assert.ok(
          seen.every((label) => label !== null),
          `focus must never fall back to <body> in the review; saw ${JSON.stringify(seen)}`,
        );
        assert.ok(
          seen.includes(copy.apply),
          `the apply action must be reachable by keyboard; saw ${JSON.stringify(seen)}`,
        );

        await page.getByRole('button', { name: copy.apply, exact: true }).click();
        await page.getByText(copy.applied, { exact: true }).waitFor();

        await page.getByRole('heading', { name: copy.voicePanel, exact: true }).waitFor();
        const gain = page.getByRole('spinbutton', { name: copy.voiceGain, exact: true });
        await gain.waitFor();
        await gain.focus();
        const panelOrder = [];
        for (let i = 0; i < 4; i += 1) {
          await page.keyboard.press('Tab');
          panelOrder.push(await focusedDescription(page));
        }
        assert.deepEqual(panelOrder, [
          copy.voiceFadeIn,
          copy.voiceFadeOut,
          copy.audition,
          copy.remove,
        ]);

        assertNoEngineeringLeak(await page.evaluate(() => document.body.innerText));

        await page.getByRole('button', { name: copy.audition, exact: true }).click();
        await page.locator('video[data-monitor-video="preview"]').waitFor({ timeout: 90000 });

        for (const [width, height] of SIZES) {
          await showVoicePanel(page, copy, width, height);
          await scrollToTopOf(
            page,
            page.getByRole('heading', { name: copy.voicePanel, exact: true }),
          );
          await page.screenshot({
            path: artifactPath(`voice-track-${locale}-panel-${width}x${height}.png`),
          });
        }

        await showVoicePanel(page, copy, 1420, 900);
        await page
          .getByRole('textbox', { name: copy.text(3), exact: true })
          .fill('Cảm ơn bạn đã theo dõi — bản đã sửa.');
        await page.getByText(copy.staleVoice).first().waitFor();
        assert.equal(
          await page.getByRole('radio', { name: copy.voiceMix }).isDisabled(),
          true,
          'a stale track locks its settings',
        );
        assert.equal(
          await page.getByRole('button', { name: copy.remove, exact: true }).isDisabled(),
          false,
          'a stale track stays removable',
        );
        await scrollToTopOf(
          page,
          page.getByRole('heading', { name: copy.voicePanel, exact: true }),
        );
        await page.screenshot({
          path: artifactPath(`voice-track-${locale}-stale-1420x900.png`),
        });

        const keep = page.getByRole('button', { name: copy.keepVoice, exact: true });
        await keep.waitFor();
        await keep.click();
        await page.getByText(copy.staleVoice).first().waitFor({ state: 'hidden' });
        assert.equal(
          await page.getByRole('radio', { name: copy.voiceMix }).isDisabled(),
          false,
          'keeping the existing audio unlocks the settings',
        );
        await scrollToTopOf(
          page,
          page.getByRole('heading', { name: copy.voicePanel, exact: true }),
        );
        await page.screenshot({
          path: artifactPath(`voice-track-${locale}-stale-accepted-1420x900.png`),
        });

        await page.getByRole('button', { name: copy.remove, exact: true }).click();
        await page.getByText(copy.voiceNone, { exact: true }).waitFor();
        for (const [width, height] of SIZES) {
          await showVoicePanel(page, copy, width, height);
          await scrollToTopOf(page, page.getByText(copy.voiceNone, { exact: true }));
          await page.screenshot({
            path: artifactPath(`voice-track-${locale}-removed-${width}x${height}.png`),
          });
        }

        await showVoicePanel(page, copy, 1050, 700);
        await generateReview(page, copy);
        const narrowTable = page.getByRole('table', { name: copy.comparison, exact: true });
        await assertHeadersFit(narrowTable, copy.gridHeaders);
        assert.ok(
          await narrowTable.evaluate((element) => {
            const scroller = element.parentElement;
            return scroller != null && scroller.scrollWidth > scroller.clientWidth + 1;
          }),
          'the narrow review grid must scroll horizontally so its right-hand columns stay reachable',
        );
        await scrollToTopOf(
          page,
          page.getByRole('heading', { name: copy.draftHeading, exact: true }),
        );
        await page.screenshot({
          path: artifactPath(`voice-track-${locale}-review-1050x700.png`),
        });
        await narrowTable.evaluate((element) => {
          const scroller = element.parentElement;
          if (scroller) scroller.scrollLeft = scroller.scrollWidth;
        });
        await page.waitForTimeout(100);
        await page.screenshot({
          path: artifactPath(`voice-track-${locale}-review-compressed-1050x700.png`),
        });
      },
    );
  });
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Voice track: a missing local voice model is named, not generic (${locale})`, {
    timeout: 60000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-voice-missing-');
    const video = path.join(temp, 'voice-missing.mp4');
    await createVideo(video);

    await runElectronTest(
      { temp, userData, screenshotName: `voice-track-${locale}-missing-failure.png` },
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

        await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
        await page.locator('#panel-voice').waitFor({ state: 'visible' });

        await page.getByText(copy.missing, { exact: true }).waitFor({ timeout: 30000 });
        await page.getByRole('button', { name: copy.setUp, exact: true }).waitFor();
        await page.getByText(copy.voiceNone, { exact: true }).waitFor();
        assertNoEngineeringLeak(await page.evaluate(() => document.body.innerText));

        for (const [width, height] of SIZES) {
          await showVoicePanel(page, copy, width, height);
          await scrollToTopOf(page, page.getByText(copy.missing, { exact: true }));
          await page.screenshot({
            path: artifactPath(`voice-track-${locale}-missing-${width}x${height}.png`),
          });
        }
      },
    );
  });
}
