import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { composeText } from './helpers/ime.mjs';
import { seedSynthesisBundle } from './helpers/synthesis.mjs';
import { addMediaToProject, chooseLocale, waitForEditorReady } from './ui-actions.mjs';

const run = promisify(execFile);

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
    voiceTab: 'Audio',
    editTab: 'Video',
    language: 'Language',
    vietnamese: 'Vietnamese',
    voice: 'Voice',
    scope: 'Lines',
    allCues: 'All',
    generate: 'Generate voice',
    running: 'Generating speech',
    comparison: 'Captured speech timing',
    listen: 'Listen',
    reviewed: 'I listened',
    apply: 'Apply',
    applied: 'Voice added',
    missing: 'No voice model',
    setUp: 'Set up…',
    voicePanel: 'Voiceover',
    voiceSource: 'Mode',
    mix: 'Mix',
    voiceGain: 'Volume',
    voiceFadeIn: 'Fade in',
    voiceFadeOut: 'Fade out',
    keepVoice: 'Keep',
    remove: 'Remove voiceover',
    moreActions: 'More actions',
    addMusic: 'Add music',
    decimal: '.',
    staleVoice: /Text changed/,
    audioTab: 'Audio',
    monitorPlay: 'Play',
    monitorPause: 'Pause',
    export: 'Export…',
    exportRun: 'Export',
    editorArea: 'Editor',
  },
  vi: {
    editingLayer: 'Lớp',
    spokenLayer: /^Nội dung đọc/,
    addCue: 'Thêm câu',
    text: (n) => `Nội dung ${n}`,
    start: (n) => `Bắt đầu (s) ${n}`,
    end: (n) => `Kết thúc (s) ${n}`,
    voiceTab: 'Âm thanh',
    editTab: 'Video',
    language: 'Ngôn ngữ',
    vietnamese: 'Tiếng Việt',
    voice: 'Giọng đọc',
    scope: 'Câu',
    allCues: 'Tất cả',
    generate: 'Tạo giọng',
    running: 'Đang tạo giọng nói',
    comparison: 'Thời gian giọng đã chụp',
    listen: 'Nghe',
    reviewed: 'Đã nghe',
    apply: 'Áp dụng',
    applied: 'Đã thêm giọng',
    missing: 'Chưa có model giọng',
    setUp: 'Thiết lập…',
    voicePanel: 'Lồng tiếng',
    voiceSource: 'Chế độ',
    mix: 'Trộn',
    voiceGain: 'Âm lượng',
    voiceFadeIn: 'Mờ vào',
    voiceFadeOut: 'Mờ ra',
    keepVoice: 'Giữ',
    remove: 'Xóa lồng tiếng',
    moreActions: 'Thao tác khác',
    addMusic: 'Thêm nhạc',
    decimal: ',',
    staleVoice: /Văn bản đã đổi/,
    audioTab: 'Âm thanh',
    monitorPlay: 'Phát',
    monitorPause: 'Tạm dừng',
    export: 'Xuất…',
    exportRun: 'Xuất',
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
  const panel = page.locator('#panel-audio');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
  }
  await panel.waitFor({ state: 'visible' });
}

function voiceoverSection(page, copy) {
  return page.locator(`section[aria-label="${copy.voicePanel}"]`);
}

// The drawer footer's ⋯ menu is portaled outside #panel-audio, into the aside around it.
async function openAudioMoreActions(page, copy) {
  await page
    .locator('aside:has(#panel-audio)')
    .getByRole('button', { name: copy.moreActions, exact: true })
    .click();
}

async function clickAudioMoreAction(page, copy, itemLabel) {
  await openAudioMoreActions(page, copy);
  await page.getByRole('menuitem', { name: itemLabel, exact: true }).click();
}

async function audioMoreActionDisabled(page, copy, itemLabel) {
  await openAudioMoreActions(page, copy);
  const disabled = await page.getByRole('menuitem', { name: itemLabel, exact: true }).isDisabled();
  await page.keyboard.press('Escape');
  return disabled;
}

/** With a draft on screen Apply is the primary, and Generate voice moves into the footer's ⋯. */
async function generateReview(page, copy, { hasDraft = false } = {}) {
  await page.getByRole('combobox', { name: copy.voice, exact: true }).click();
  await page
    .getByRole('option', { name: 'Controlled voice', exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole('option', { name: 'Controlled voice', exact: true }).click();
  await voiceoverSection(page, copy)
    .getByRole('radiogroup', { name: copy.scope, exact: true })
    .getByRole('radio', { name: copy.allCues, exact: true })
    .click();
  if (hasDraft) await clickAudioMoreAction(page, copy, copy.generate);
  else await page.getByRole('button', { name: copy.generate, exact: true }).click();
  await page.getByText(copy.running, { exact: false }).first().waitFor({ timeout: 10000 });
  await page.getByRole('list', { name: copy.comparison, exact: true }).waitFor({ timeout: 90000 });
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
        await page.locator('#panel-audio').waitFor({ state: 'visible' });
        await voiceoverSection(page, copy)
          .getByRole('combobox', { name: copy.language, exact: true })
          .click();
        await page.getByRole('option', { name: copy.vietnamese, exact: true }).click();

        // No voice track yet: the applied-track controls have not mounted.
        await voiceoverSection(page, copy)
          .getByRole('radiogroup', { name: copy.voiceSource, exact: true })
          .waitFor({ state: 'detached' });

        await generateReview(page, copy);
        const reviewList = page.getByRole('list', { name: copy.comparison, exact: true });
        const firstRow = reviewList.getByRole('listitem').filter({ hasText: CUES[0].text }).first();
        const firstRowText = await firstRow.innerText();
        // Seconds follow the UI locale's decimal separator.
        assert.ok(
          firstRowText.includes(`4${copy.decimal}50`),
          `the slot length must be shown in seconds (${firstRowText})`,
        );
        assert.ok(
          firstRowText.includes(`0${copy.decimal}10`),
          `the speech length must be shown in seconds (${firstRowText})`,
        );
        assertNoEngineeringLeak(await page.evaluate(() => document.body.innerText));

        await scrollToTopOf(page, reviewList);
        await page.screenshot({ path: artifactPath(`voice-track-${locale}-review-1420x900.png`) });

        await listenAndAttest(page, copy);
        await page.locator('audio[controls]').focus();
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
        const gain = voiceoverSection(page, copy).getByRole('spinbutton', {
          name: copy.voiceGain,
          exact: true,
        });
        await gain.waitFor();
        await gain.focus();
        const panelOrder = [];
        for (let i = 0; i < 3; i += 1) {
          await page.keyboard.press('Tab');
          panelOrder.push(await focusedDescription(page));
        }
        // Voiceover's fades are consecutive stops; focus then moves on to the next section (Music).
        assert.deepEqual(panelOrder, [copy.voiceFadeIn, copy.voiceFadeOut, copy.addMusic]);

        assertNoEngineeringLeak(await page.evaluate(() => document.body.innerText));

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
          await voiceoverSection(page, copy)
            .getByRole('radiogroup', { name: copy.voiceSource, exact: true })
            .getByRole('radio', { name: copy.mix, exact: true })
            .isDisabled(),
          true,
          'a stale track locks its settings',
        );
        assert.equal(
          await audioMoreActionDisabled(page, copy, copy.remove),
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
          await voiceoverSection(page, copy)
            .getByRole('radiogroup', { name: copy.voiceSource, exact: true })
            .getByRole('radio', { name: copy.mix, exact: true })
            .isDisabled(),
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

        // Add music too, then capture the live program monitor mixing voice and music.
        const music = path.join(temp, `voice-music-${locale}.wav`);
        await run(process.env.FFMPEG_PATH || 'ffmpeg', [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=660:duration=12',
          '-c:a',
          'pcm_s16le',
          '-n',
          music,
        ]);
        await application.evaluate(({ dialog }, filePath) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
        }, music);
        await addMediaToProject(page);
        // The Audio panel is still open; clicking its active rail item would collapse it.
        await showVoicePanel(page, copy, 1420, 900);
        // The Music row now has its own Play/Pause IconButton too; scope to the viewer's transport.
        const monitor = page.locator('.editor-viewer-region');
        await monitor.getByRole('button', { name: copy.monitorPlay, exact: true }).click();
        await page.waitForFunction(() => {
          const video = document.querySelector('video[data-monitor-video="source"]');
          return video instanceof HTMLVideoElement && !video.paused;
        });
        await page.waitForTimeout(800);
        await page.screenshot({
          path: artifactPath(`monitor-live-voice-music-${locale}.png`),
        });
        await monitor.getByRole('button', { name: copy.monitorPause, exact: true }).click();
        await showVoicePanel(page, copy, 1420, 900);

        await clickAudioMoreAction(page, copy, copy.remove);
        await voiceoverSection(page, copy)
          .getByRole('radiogroup', { name: copy.voiceSource, exact: true })
          .waitFor({ state: 'detached' });
        for (const [width, height] of SIZES) {
          await showVoicePanel(page, copy, width, height);
          await scrollToTopOf(
            page,
            page.getByRole('heading', { name: copy.voicePanel, exact: true }),
          );
          await page.screenshot({
            path: artifactPath(`voice-track-${locale}-removed-${width}x${height}.png`),
          });
        }

        await showVoicePanel(page, copy, 1050, 700);
        // The first draft is still reviewable after its track was removed.
        await generateReview(page, copy, { hasDraft: true });
        const narrowList = page.getByRole('list', { name: copy.comparison, exact: true });
        assert.ok(
          await narrowList.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
          'the review list must fit the narrow panel without horizontal scroll',
        );
        await scrollToTopOf(page, narrowList);
        await page.screenshot({
          path: artifactPath(`voice-track-${locale}-review-1050x700.png`),
        });

        // Export, then capture the result view the monitor switches to.
        await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
        await page.locator('#panel-audio').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: copy.export, exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: copy.exportRun, exact: true })
          .click();
        await page.locator('video[data-monitor-video="result"]').waitFor({ timeout: 90000 });
        await page.screenshot({ path: artifactPath(`monitor-result-${locale}.png`) });
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
        await page.locator('#panel-audio').waitFor({ state: 'visible' });

        await page.getByText(copy.missing, { exact: true }).waitFor({ timeout: 30000 });
        // The model problem replaces the primary button with Set up entirely (no separate fix button).
        await page.getByRole('button', { name: copy.setUp, exact: true }).waitFor();
        await voiceoverSection(page, copy)
          .getByRole('radiogroup', { name: copy.voiceSource, exact: true })
          .waitFor({ state: 'detached' });
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

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Voice track: a generated draft survives switching tools (${locale})`, {
    timeout: 110000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-voice-switch-');
    const video = path.join(temp, 'voice-switch.mp4');
    await createVideo(video);
    const sdk = await seedSynthesisBundle(userData, temp);

    await runElectronTest(
      {
        temp,
        userData,
        env: { PYTHONPATH: sdk },
        screenshotName: `voice-switch-${locale}-failure.png`,
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

        await page.getByRole('combobox', { name: copy.editingLayer, exact: true }).click();
        await page.getByRole('option', { name: copy.spokenLayer }).click();
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const field = page.getByRole('textbox', { name: copy.text(1), exact: true });
        await composeText(page, field, CUES[0].text);
        await commitNumber(page, copy.end(1), CUES[0].end);
        await commitNumber(page, copy.start(1), CUES[0].start);

        await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
        await page.locator('#panel-audio').waitFor({ state: 'visible' });
        await voiceoverSection(page, copy)
          .getByRole('combobox', { name: copy.language, exact: true })
          .click();
        await page.getByRole('option', { name: copy.vietnamese, exact: true }).click();

        await generateReview(page, copy);

        // Leave the Voice tool and return: the job and its draft must survive the unmount.
        await page.getByRole('tab', { name: copy.editTab, exact: true }).click();
        await page.locator('#panel-audio').waitFor({ state: 'detached' });
        await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
        await page
          .getByRole('list', { name: copy.comparison, exact: true })
          .waitFor({ timeout: 30000 });
        await page.getByRole('button', { name: copy.apply, exact: true }).waitFor();
      },
    );
  });
}
