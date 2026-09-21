// Real Electron/Playwright against the installed application: ticket 04's exclusion
// surfaces on the timeline — clip Disable (menu and V), lane mute for the original,
// voice and music lanes, and per-layer show/hide on the subtitles lane — in both
// locales, with real screenshots at 1420×900 and 1050×700. The voice lane is
// produced by the same controlled synthesis SDK double the voice-track spec uses
// (never real model weights), so every lane in the screenshot is real document state.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  waitForEditorReady,
} from './ui-actions.mjs';

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

async function makeVideo(filePath, duration, withAudio = false) {
  const args = [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=320x180:rate=30:duration=${duration}`,
  ];
  if (withAudio) args.push('-f', 'lavfi', '-i', `sine=frequency=220:duration=${duration}`);
  args.push('-c:v', 'libx264', '-threads', '2');
  if (withAudio) args.push('-c:a', 'aac', '-shortest');
  args.push('-n', filePath);
  await run(process.env.FFMPEG_PATH || 'ffmpeg', args);
}

async function makeMusic(filePath) {
  await run(process.env.FFMPEG_PATH || 'ffmpeg', [
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

const COPY = {
  en: {
    editorArea: 'Editor',
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
    controlled: 'Controlled voice',
    scope: 'Cues to generate',
    allCues: 'All spoken cues',
    generate: 'Generate audio draft',
    draftHeading: 'Generated voice — not aligned or added to video',
    listen: 'Listen and check',
    reviewed: 'I checked the captured text and listened',
    apply: 'Use as the project voice track',
    applied: 'Voice track added to the project.',
    addToTimeline: 'Add to timeline',
    addMedia: 'Add…',
    projectMedia: 'Media',
    laneOriginal: 'Original',
    laneVoice: 'Voice',
    laneMusic: 'Music',
    laneClips: 'Clips',
    muteMusic: 'Mute music',
    unmuteMusic: 'Unmute music',
    showLayer: (layer) => `Show ${layer}`,
    hideLayer: (layer) => `Hide ${layer}`,
    layerDisplayed: 'Displayed subtitles',
    layerTranscript: 'Transcript',
    layerSpoken: 'Spoken text',
    displayedLayer: /^Displayed subtitles/,
    burnedIn: 'Burned in',
    clipDisable: 'Disable clip',
    clipEnable: 'Enable clip',
    clipDelete: 'Delete clip',
    clipSplit: 'Split selected clip at playhead',
  },
  vi: {
    editorArea: 'Editor',
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
    controlled: 'Controlled voice',
    scope: 'Các câu cần tạo giọng',
    allCues: 'Toàn bộ lớp nội dung đọc',
    generate: 'Tạo bản nháp âm thanh',
    draftHeading: 'Giọng đã tạo — chưa căn thời gian hay thêm vào video',
    listen: 'Nghe và kiểm tra',
    reviewed: 'Tôi đã đối chiếu nội dung',
    apply: 'Dùng làm bản giọng đọc của dự án',
    applied: 'Đã thêm bản giọng đọc vào dự án.',
    addToTimeline: 'Thêm vào timeline',
    addMedia: 'Thêm…',
    projectMedia: 'Phương tiện',
    laneOriginal: 'Âm gốc',
    laneVoice: 'Giọng đọc',
    laneMusic: 'Nhạc nền',
    laneClips: 'Đoạn phim',
    muteMusic: 'Tắt tiếng nhạc nền',
    unmuteMusic: 'Bật tiếng nhạc nền',
    showLayer: (layer) => `Hiện ${layer}`,
    hideLayer: (layer) => `Ẩn ${layer}`,
    layerDisplayed: 'Phụ đề hiển thị',
    layerTranscript: 'Bản chép lời',
    layerSpoken: 'Nội dung đọc',
    displayedLayer: /^Phụ đề hiển thị/,
    burnedIn: 'Gắn cứng',
    clipDisable: 'Tắt đoạn',
    clipEnable: 'Bật đoạn',
    clipDelete: 'Xóa đoạn',
    clipSplit: 'Tách đoạn đã chọn tại vị trí phát',
  },
};

const CUE = {
  text: 'Xin chào, đây là bản tin buổi sáng.',
  start: 0,
  end: 3,
  text2: 'Cảm ơn bạn đã theo dõi chương trình.',
  start2: 4.5,
  end2: 8,
};
const SIZES = [
  [1420, 900],
  [1050, 700],
];

async function commitNumber(page, name, value) {
  const field = page.getByRole('spinbutton', { name, exact: true });
  await field.fill(String(value));
  await field.press('Enter');
  await field.blur();
}

for (const locale of ['en', 'vi']) {
  const copy = COPY[locale];

  test(`Timeline lanes: disable, mute and hide (${locale})`, { timeout: 180000 }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-timeline-lanes-');
    const video = path.join(temp, 'studio-interview.mp4');
    const second = path.join(temp, 'b-roll-cutaway.mp4');
    const music = path.join(temp, 'background-music.wav');
    await makeVideo(video, 12, true);
    await makeVideo(second, 4);
    await makeMusic(music);
    const sdk = await seedSynthesisBundle(userData, temp);
    const artifacts = path.join(root, '.test-artifacts');
    await mkdir(artifacts, { recursive: true });
    const shot = async (page, subject, width, height) => {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: path.join(artifacts, `timeline-lanes-${locale}-${subject}-${width}x${height}.png`),
      });
    };

    await runElectronTest(
      {
        temp,
        userData,
        env: { PYTHONPATH: sdk },
        screenshotName: `timeline-lanes-${locale}-failure.png`,
      },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: copy.editorArea, exact: true }).click();
        }
        await application.evaluate(
          ({ dialog }, files) => {
            const pending = [files.video, files.second, files.music];
            dialog.showOpenDialog = async () => {
              const filename = pending.shift();
              if (!filename) throw new Error('Unexpected native file request in test');
              return { canceled: false, filePaths: [filename] };
            };
          },
          { video, second, music },
        );
        await page.setViewportSize({ width: 1420, height: 900 });
        await addMediaToProject(page);
        await page.locator('.viewers video').waitFor();

        // A spoken cue and a generated voice track, so the voice lane is real document state.
        await page.getByRole('combobox', { name: copy.editingLayer, exact: true }).click();
        await page.getByRole('option', { name: copy.spokenLayer }).click();
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const field = page.getByRole('textbox', { name: copy.text(1), exact: true });
        await composeText(page, field, CUE.text);
        await commitNumber(page, copy.end(1), CUE.end);
        await commitNumber(page, copy.start(1), CUE.start);

        // A second text layer with a cue, so two subtitle rows exist.
        await page.getByRole('combobox', { name: copy.editingLayer, exact: true }).click();
        await page.getByRole('option', { name: copy.displayedLayer }).click();
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const displayedField = page.getByRole('textbox', { name: copy.text(1), exact: true });
        await composeText(page, displayedField, CUE.text2);
        await commitNumber(page, copy.end(1), CUE.end2);
        await commitNumber(page, copy.start(1), CUE.start2);

        await page.getByRole('tab', { name: copy.voiceTab, exact: true }).click();
        await page.locator('#panel-voice').waitFor({ state: 'visible' });
        await page.getByRole('combobox', { name: copy.setSpokenLanguage, exact: true }).click();
        await page.getByRole('option', { name: copy.vietnamese, exact: true }).click();
        // Models are loaded when the voice picker offers the controlled voice.
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
        await page.getByRole('button', { name: copy.apply, exact: true }).click();
        await page.getByText(copy.applied, { exact: true }).waitFor();

        // A composition of two clips, so the clips lane holds a disable target:
        // the second video is added to Project media, then placed from its row
        // (ticket 05 replaced the old "Start composition"/"Append" buttons).
        await openSourcePanel(page, 'media');
        const media = page.getByRole('tabpanel', { name: copy.projectMedia });
        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        const secondRow = media.locator('li').filter({ hasText: 'b-roll-cutaway.mp4' });
        await secondRow.waitFor();
        await secondRow.getByRole('button', { name: copy.addToTimeline, exact: true }).click();
        // The placement is async (host round trip); wait for the second clip to
        // be committed before the next document change, or the two overlap and
        // the later one is refused stale.
        await page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'b-roll-cutaway.mp4' })
          .first()
          .waitFor();

        // Music, so the music lane exists too.
        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        await page.getByText('background-music.wav', { exact: true }).first().waitFor();

        const headers = page.locator('.timeline-lane-headers');
        await headers.getByText(copy.laneClips, { exact: true }).waitFor();
        await headers.getByText(copy.laneOriginal, { exact: true }).waitFor();
        await headers.getByText(copy.laneVoice, { exact: true }).waitFor();
        await headers.getByText(copy.laneMusic, { exact: true }).waitFor();
        // Item 1: one row per text layer that holds cues, each named on its own header.
        await headers
          .locator('.timeline-lane-name')
          .filter({ hasText: copy.layerDisplayed })
          .waitFor();
        await headers
          .locator('.timeline-lane-name')
          .filter({ hasText: copy.layerSpoken })
          .waitFor();
        await headers
          .getByRole('button', { name: copy.hideLayer(copy.layerDisplayed), exact: true })
          .waitFor();
        await headers.getByRole('img', { name: copy.burnedIn, exact: true }).waitFor();

        // Item 3: the original-audio lane draws the one existing waveform.
        await page.locator('.timeline-waveform canvas').first().waitFor({ timeout: 20000 });

        // Item 2: no lane label truncates in either locale.
        const labels = page.locator('.timeline-lane-name');
        const labelCount = await labels.count();
        assert.ok(labelCount >= 6, 'clips, original, voice, music and two text layers');
        for (let index = 0; index < labelCount; index += 1) {
          const overflow = await labels
            .nth(index)
            .evaluate((element) => element.scrollWidth - element.clientWidth);
          assert.ok(overflow <= 0, `lane label ${index} truncates by ${overflow}px`);
        }

        const clipLabels = page.locator('.timeline-editor-action .timeline-action-label');
        assert.ok(
          (await clipLabels.count()) >= 2,
          'the clips, voice, music and subtitle lanes each draw at least one action',
        );

        // Item 4: at the default height every lane header is fully visible, no scroll.
        await page.setViewportSize({ width: 1420, height: 900 });
        const regionBox = await page.locator('.editor-timeline-region').boundingBox();
        assert.ok(regionBox, 'the timeline region is laid out');
        const headerCells = page.locator('.timeline-lane-header');
        const headerCount = await headerCells.count();
        for (let index = 0; index < headerCount; index += 1) {
          const box = await headerCells.nth(index).boundingBox();
          assert.ok(
            box &&
              box.y >= regionBox.y - 1 &&
              box.y + box.height <= regionBox.y + regionBox.height + 1,
            `lane header ${index} is fully visible at 1420x900`,
          );
        }

        // V toggles the selected clip: one undo step, dimmed while disabled.
        const firstClip = page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'studio-interview.mp4' })
          .first();
        await firstClip.click();
        await page.keyboard.press('v');
        const disabled = page.locator('.timeline-action-disabled');
        await disabled.first().waitFor();
        assert.equal(await disabled.count(), 1, 'V disables exactly the selected clip');
        await page.keyboard.press('v');
        assert.equal(await disabled.count(), 0, 'V re-enables the clip exactly');

        // Item 3: Delete is always enabled; Split tracks the playhead.
        const openClipMenu = async () => {
          await firstClip.scrollIntoViewIfNeeded();
          await firstClip.click({ button: 'right' });
          await page.getByRole('menu').waitFor();
        };
        const splitItem = page.getByRole('menuitem', { name: copy.clipSplit });
        const deleteItem = page.getByRole('menuitem', { name: copy.clipDelete });
        // The playhead is at 0, outside the first clip's interior.
        await openClipMenu();
        assert.equal(await deleteItem.isDisabled(), false, 'Delete is always enabled');
        assert.equal(
          await splitItem.isDisabled(),
          true,
          'Split is disabled with the playhead outside the clip',
        );
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'hidden' });
        // Seek inside the first clip: Split enabled, Delete still enabled.
        await page.locator('.timeline-editor-time-area').click({ position: { x: 300, y: 16 } });
        await openClipMenu();
        assert.equal(await deleteItem.isDisabled(), false, 'Delete stays enabled');
        assert.equal(
          await splitItem.isDisabled(),
          false,
          'Split is enabled with the playhead inside the clip',
        );
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'hidden' });

        // Item 5: a real menu with the shortcut badge and the existing clip commands.
        const contextMenuAt = async (width, height) => {
          await page.setViewportSize({ width, height });
          await firstClip.scrollIntoViewIfNeeded();
          await firstClip.click({ button: 'right' });
          await page.getByRole('menu').waitFor();
          const disable = page.getByRole('menuitem', { name: copy.clipDisable });
          const enable = page.getByRole('menuitem', { name: copy.clipEnable });
          await Promise.race([disable.waitFor(), enable.waitFor()]);
          await page.getByRole('menuitem', { name: copy.clipSplit }).waitFor();
          await page.getByRole('menuitem', { name: copy.clipDelete }).waitFor();
          const item = (await disable.isVisible()) ? disable : enable;
          await page.screenshot({
            path: path.join(
              artifacts,
              `timeline-lanes-${locale}-context-menu-${width}x${height}.png`,
            ),
          });
          await item.click();
        };
        await contextMenuAt(1420, 900);
        await page.locator('.timeline-action-disabled').first().waitFor();
        await contextMenuAt(1050, 700);
        await page.setViewportSize({ width: 1420, height: 900 });
        // Leave the clip disabled for the lane screenshot.
        if ((await page.locator('.timeline-action-disabled').count()) === 0) {
          await firstClip.click();
          await page.keyboard.press('v');
          await page.locator('.timeline-action-disabled').first().waitFor();
        }

        // Mute the music lane from its own header.
        await headers.getByRole('button', { name: copy.muteMusic, exact: true }).click();
        await headers.getByRole('button', { name: copy.unmuteMusic, exact: true }).waitFor();

        // Show the spoken layer, then hide it: one burned layer at a time, marked on its header.
        const layerHeader = (layer) =>
          headers.locator('.timeline-lane-header').filter({ hasText: layer });
        await headers
          .getByRole('button', { name: copy.showLayer(copy.layerSpoken), exact: true })
          .click();
        const burnedDots = () => headers.getByRole('img', { name: copy.burnedIn, exact: true });
        assert.equal(
          await layerHeader(copy.layerSpoken)
            .getByRole('img', { name: copy.burnedIn, exact: true })
            .count(),
          1,
          'the shown layer is marked burned on its own header',
        );
        assert.equal(
          await layerHeader(copy.layerDisplayed)
            .getByRole('img', { name: copy.burnedIn, exact: true })
            .count(),
          0,
          'only one layer is burned',
        );
        await headers
          .getByRole('button', { name: copy.hideLayer(copy.layerSpoken), exact: true })
          .click();
        assert.equal(await burnedDots().count(), 0, 'hiding the burned layer leaves none burned');
        // Restore the displayed layer so the lane screenshot shows the burned marker.
        await headers
          .getByRole('button', { name: copy.showLayer(copy.layerDisplayed), exact: true })
          .click();
        await burnedDots().waitFor();

        for (const [width, height] of SIZES) await shot(page, 'lanes', width, height);
        // A scrolled timeline at the small size: headers stay with their rows.
        await page.setViewportSize({ width: 1050, height: 700 });
        await page.locator('.timeline').evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.screenshot({
          path: path.join(artifacts, `timeline-lanes-${locale}-scrolled-1050x700.png`),
        });
        await page.setViewportSize({ width: 1420, height: 900 });
      },
    );
  });
}
