// Real Electron/Playwright against the installed application: the voice-track feature walked
// end to end, in both locales, with a controlled SDK double (never real model weights —
// downloading those for a test is forbidden). The worker is the same one the app ships; the double is
// registered the way a bring-your-own bundle is (workspace/local-synthesis.json), so the panel's
// status, the generated artifact, the timing plan and the applied voice track are all produced by
// the real pipeline. This is the UI pass ticket 11 owns: keyboard, focus, IME, both locales and
// real screenshots at 1420×900 and 1050×700 — not a static guard.
//
// The review draft is transient tool-panel state. The D-63 re-layout renders the panel at one
// stable tree position across the wide/narrow breakpoint, so crossing it keeps the open item and
// the draft; the applied voice track is document state and is screenshotted at both sizes from
// one generation.
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

/** Seeds the workspace the same way the Settings "configure a local bundle" action does — the
 * worker's own `SynthesisRegistry` reads `local-synthesis.json` verbatim — from the controlled
 * bundle `tests/python/synthesis_fixture.py` builds (inert bytes, sine output). Returns the
 * controlled SDK directory that must be on PYTHONPATH for the worker to import it. */
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
    start: (n) => `Start (seconds) ${n}`,
    end: (n) => `End (seconds) ${n}`,
    voiceTab: 'Voice',
    setSpokenLanguage: 'Set the Spoken text layer language',
    vietnamese: 'Vietnamese',
    voice: 'Preset voice',
    scope: 'Cues to generate',
    allCues: 'All spoken cues',
    generate: 'Generate audio draft',
    running: 'Generating speech',
    draftHeading: 'Generated voice — not aligned or added to video',
    comparison: 'Captured words and their planned placement',
    gridHeaders: [
      'Captured spoken text',
      'Slot (s)',
      'Speech (s)',
      'Compressed (%)',
      'Overrun (s)',
    ],
    engineNatural: 'This engine speaks at its natural rate; the plan placed each line.',
    listen: 'Listen and check',
    reviewed: 'I checked the captured text and listened',
    apply: 'Use as the project voice track',
    applied: 'Voice track added to the project.',
    missing: 'No local voice model is configured.',
    setUp: 'Set up…',
    voicePanel: 'Generated voice',
    voiceNone: 'No generated narration is applied to this project.',
    voiceMix: 'Mix with source audio',
    voiceGain: 'Narration level (dB)',
    voiceFadeIn: 'Fade in (seconds)',
    voiceFadeOut: 'Fade out (seconds)',
    audition: 'Preview with video',
    keepVoice: 'Keep existing audio',
    remove: 'Remove narration',
    staleVoice: /The timeline or the spoken text changed since this voice was generated/,
    editorArea: 'Editor',
  },
  vi: {
    editingLayer: 'Lớp',
    spokenLayer: /^Nội dung đọc/,
    addCue: 'Thêm câu',
    text: (n) => `Nội dung ${n}`,
    start: (n) => `Bắt đầu (giây) ${n}`,
    end: (n) => `Kết thúc (giây) ${n}`,
    voiceTab: 'Giọng đọc',
    setSpokenLanguage: 'Đặt ngôn ngữ cho lớp Nội dung đọc',
    vietnamese: 'Tiếng Việt',
    voice: 'Giọng có sẵn',
    scope: 'Các câu cần tạo giọng',
    allCues: 'Toàn bộ lớp nội dung đọc',
    generate: 'Tạo bản nháp âm thanh',
    running: 'Đang tạo giọng nói',
    draftHeading: 'Giọng đã tạo — chưa căn thời gian hay thêm vào video',
    comparison: 'Nội dung đã chụp và vị trí đặt theo kế hoạch',
    gridHeaders: [
      'Nội dung đọc đã chụp',
      'Khoảng khả dụng (giây)',
      'Lời nói (giây)',
      'Đã nén (%)',
      'Vượt (giây)',
    ],
    engineNatural: 'Bộ máy này đọc ở tốc độ tự nhiên; kế hoạch đặt vị trí từng câu.',
    listen: 'Nghe và kiểm tra',
    reviewed: 'Tôi đã đối chiếu nội dung',
    apply: 'Dùng làm bản giọng đọc của dự án',
    applied: 'Đã thêm bản giọng đọc vào dự án.',
    missing: 'Chưa cấu hình mô hình giọng nói cục bộ.',
    setUp: 'Thiết lập…',
    voicePanel: 'Giọng đã tạo',
    voiceNone: 'Chưa áp dụng giọng đọc nào cho project này.',
    voiceMix: 'Trộn với âm thanh nguồn',
    voiceGain: 'Âm lượng giọng đọc (dB)',
    voiceFadeIn: 'Tăng âm đầu đoạn (giây)',
    voiceFadeOut: 'Giảm âm cuối đoạn (giây)',
    audition: 'Nghe thử với video',
    keepVoice: 'Giữ âm thanh hiện có',
    remove: 'Bỏ giọng đọc',
    staleVoice: /Dòng thời gian hoặc nội dung đọc đã thay đổi/,
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

// Copy that must never reach an end user: build-state disclaimers, internal names that only
// make sense to whoever wrote the code, and engineering wording about bundles, models being
// "found", verification and runtime checks (review round 1 added this class).
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

/** Astryx truncates every table header, so a column with no explicit width collapses and the
 * header clips with an ellipsis. A table cell's `scrollWidth` does not report that overflow, so
 * measure the header text itself with a Range and compare it to the cell's content box: a number
 * the user acts on must be readable at 1050×700, in both locales. */
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

/** Puts the tool panel on the Voice item at a given window size. Below the wide breakpoint the
 * panel is the overlay drawer, opened from the rail itself; selecting the active item collapses
 * it, so only click when it is not already open. */
async function showVoicePanel(page, copy, width, height) {
  await page.setViewportSize({ width, height });
  const panel = page.locator('#panel-voice');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
  }
  await panel.waitFor({ state: 'visible' });
}

/** Re-select voice and scope, then generate. The panel keeps its state across the breakpoint now,
 * so this is idempotent enough to call again for a fresh review at another size. */
async function generateReview(page, copy) {
  // Models are loaded when the voice picker offers the controlled voice.
  await page.getByRole('combobox', { name: copy.voice, exact: true }).click();
  await page
    .getByRole('option', { name: 'Controlled voice', exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole('option', { name: 'Controlled voice', exact: true }).click();
  await page.getByRole('combobox', { name: copy.scope, exact: true }).click();
  await page.getByRole('option', { name: copy.allCues, exact: true }).click();
  await page.getByRole('button', { name: copy.generate, exact: true }).click();
  // The queued/running state is shown as a status while the worker produces audio. The controlled
  // worker is fast, so this is a generous window rather than a promise it lingers.
  await page.getByText(copy.running, { exact: false }).first().waitFor({ timeout: 10000 });
  await page
    .getByRole('heading', { name: copy.draftHeading, exact: true })
    .waitFor({ timeout: 90000 });
}

/** Listens (a real, muted play event) and attests, enabling the review's commit actions. */
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

        // Populate the spoken layer — the layer the voice feature reads — with realistic
        // Vietnamese narration, driving the cue editor's own IME path (not `.fill()`).
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
          // End before start: CuePanel's `update` maps over a render-captured cue array, so a
          // second field commit in the same render can overwrite the first (a CuePanel defect,
          // reported outside this ticket's surfaces). The review-grid figures below fail loudly
          // if either timing is lost.
          await commitNumber(page, copy.end(n), cue.end);
          await commitNumber(page, copy.start(n), cue.start);
        }

        // The voice tools live in the rail's Voice panel; set the layer language through its
        // own inline control, which only appears while the declared language is missing.
        await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
        await page.locator('#panel-voice').waitFor({ state: 'visible' });
        await page.getByRole('combobox', { name: copy.setSpokenLanguage, exact: true }).click();
        await page.getByRole('option', { name: copy.vietnamese, exact: true }).click();

        // The empty voice panel is a real, populated-document state: no narration applied yet.
        await page.getByText(copy.voiceNone, { exact: true }).waitFor();

        // --- Wide pass: generate, assert the actionable timing figures, and drive the review by
        // keyboard before capturing it at 1420×900. ---
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

        // Attestation enables the commit actions; only then is a forward Tab order through the
        // review meaningful (a disabled action is correctly not a Tab stop).
        await listenAndAttest(page, copy);
        await page.getByRole('button', { name: copy.listen, exact: true }).focus();
        // The native `<audio controls>` exposes several internal shadow-DOM tab stops before
        // focus leaves it, so allow the traversal enough steps to reach the commit actions.
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

        // The committed track appears as the Voice panel's own section, with mode,
        // level and both fades, and the settings block is a keyboard-reachable sequence.
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

        // Walk the last step of the path: audition the applied narration against the picture.
        // A finished sample render swaps the monitor to the rendered preview, which is the same
        // completion signal the editor's own render tests use.
        await page.getByRole('button', { name: copy.audition, exact: true }).click();
        await page.locator('video[data-monitor-video="preview"]').waitFor({ timeout: 90000 });

        // Screenshot the applied panel at both sizes — document state, so the layout switch is
        // safe where the transient review draft is not.
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

        // A stale track keeps its reason in front of the user and stays removable. Editing the
        // spoken text is what makes it stale, exactly as the feature documents.
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

        // Keeping the reviewed audio is the other documented way out of stale the banner promises:
        // the control clears the flag without regenerating and unlocks the settings again.
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

        // Removing the track restores the no-narration state in both layouts.
        await page.getByRole('button', { name: copy.remove, exact: true }).click();
        await page.getByText(copy.voiceNone, { exact: true }).waitFor();
        for (const [width, height] of SIZES) {
          await showVoicePanel(page, copy, width, height);
          await scrollToTopOf(page, page.getByText(copy.voiceNone, { exact: true }));
          await page.screenshot({
            path: artifactPath(`voice-track-${locale}-removed-${width}x${height}.png`),
          });
        }

        // --- Narrow pass: generate the review again at 1050×700 so the grid is captured in the
        // overlay drawer the narrow layout actually uses. ---
        await showVoicePanel(page, copy, 1050, 700);
        await generateReview(page, copy);
        // The defect this guards: in the ≈290px tool panel every header clipped. Check the narrow
        // layout's own grid, not just the wide one.
        const narrowTable = page.getByRole('table', { name: copy.comparison, exact: true });
        await assertHeadersFit(narrowTable, copy.gridHeaders);
        assert.ok(
          await narrowTable.evaluate((element) => {
            const scroller = element.parentElement;
            return scroller != null && scroller.scrollWidth > scroller.clientWidth + 1;
          }),
          'the narrow review grid must scroll horizontally so its right-hand columns stay reachable',
        );
        // The overlay drawer's fixed header bar overlaps the scroll region's top, so anchor on the
        // review heading; the grid (and its own header row) then sits clear of the bar.
        await scrollToTopOf(
          page,
          page.getByRole('heading', { name: copy.draftHeading, exact: true }),
        );
        await page.screenshot({
          path: artifactPath(`voice-track-${locale}-review-1050x700.png`),
        });
        // The compression column starts off-screen behind the horizontal scroll region; scroll to
        // its end so the number the user acts on is captured readable, at the narrow size.
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

        // No bundle is registered: the panel names the missing model and offers the one way to
        // fix it, rather than a generic failure or a build-state disclaimer.
        await page.getByText(copy.missing, { exact: true }).waitFor({ timeout: 30000 });
        await page.getByRole('button', { name: copy.setUp, exact: true }).waitFor();
        // The voice panel's own empty state reads correctly in the same session.
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
