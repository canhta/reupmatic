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
    start: (n) => `Start (s) ${n}`,
    end: (n) => `End (s) ${n}`,
    voiceTab: 'Voice',
    setSpokenLanguage: 'Spoken text language',
    vietnamese: 'Vietnamese',
    voice: 'Preset voice',
    controlled: 'Controlled voice',
    scope: 'Cues to generate',
    allCues: 'All spoken cues',
    generate: 'Generate voice',
    draftHeading: 'Generated voice — not applied',
    listen: 'Listen',
    reviewed: 'I checked the text and listened for problems.',
    apply: 'Apply voice',
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
    clipSplit: 'Split',
  },
  vi: {
    editorArea: 'Editor',
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
    controlled: 'Controlled voice',
    scope: 'Các câu cần tạo giọng',
    allCues: 'Toàn bộ lớp nội dung đọc',
    generate: 'Tạo giọng',
    draftHeading: 'Giọng đã tạo — chưa áp dụng',
    listen: 'Nghe',
    reviewed: 'Tôi đã đối chiếu nội dung và nghe kiểm tra.',
    apply: 'Áp dụng giọng',
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
    clipSplit: 'Tách',
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

        await page.getByRole('combobox', { name: copy.editingLayer, exact: true }).click();
        await page.getByRole('option', { name: copy.spokenLayer }).click();
        await page.getByRole('button', { name: copy.addCue, exact: true }).click();
        const field = page.getByRole('textbox', { name: copy.text(1), exact: true });
        await composeText(page, field, CUE.text);
        await commitNumber(page, copy.end(1), CUE.end);
        await commitNumber(page, copy.start(1), CUE.start);

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

        await openSourcePanel(page, 'media');
        const media = page.getByRole('tabpanel', { name: copy.projectMedia });
        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        const secondRow = media.locator('li').filter({ hasText: 'b-roll-cutaway.mp4' });
        await secondRow.waitFor();
        await secondRow.getByRole('button', { name: copy.addToTimeline, exact: true }).click();
        // The second clip placement is async; wait for it or the next change is refused stale.
        await page
          .locator('.timeline-editor-action')
          .filter({ hasText: 'b-roll-cutaway.mp4' })
          .first()
          .waitFor();

        await media.getByRole('button', { name: copy.addMedia, exact: true }).click();
        await page.getByText('background-music.wav', { exact: true }).first().waitFor();

        const headers = page.locator('.timeline-lane-headers');
        await headers.getByText(copy.laneClips, { exact: true }).waitFor();
        await headers.getByText(copy.laneOriginal, { exact: true }).waitFor();
        await headers.getByText(copy.laneVoice, { exact: true }).waitFor();
        await headers.getByText(copy.laneMusic, { exact: true }).waitFor();
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

        await page.locator('.timeline-waveform canvas').first().waitFor({ timeout: 20000 });

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

        const openClipMenu = async () => {
          await firstClip.scrollIntoViewIfNeeded();
          await firstClip.click({ button: 'right' });
          await page.getByRole('menu').waitFor();
        };
        const splitItem = page.getByRole('menuitem', { name: copy.clipSplit });
        const deleteItem = page.getByRole('menuitem', { name: copy.clipDelete });
        await openClipMenu();
        assert.equal(await deleteItem.isDisabled(), false, 'Delete is always enabled');
        assert.equal(
          await splitItem.isDisabled(),
          true,
          'Split is disabled with the playhead outside the clip',
        );
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'hidden' });
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
        if ((await page.locator('.timeline-action-disabled').count()) === 0) {
          await firstClip.click();
          await page.keyboard.press('v');
          await page.locator('.timeline-action-disabled').first().waitFor();
        }

        await headers.getByRole('button', { name: copy.muteMusic, exact: true }).click();
        await headers.getByRole('button', { name: copy.unmuteMusic, exact: true }).waitFor();

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
        await headers
          .getByRole('button', { name: copy.showLayer(copy.layerDisplayed), exact: true })
          .click();
        await burnedDots().waitFor();

        for (const [width, height] of SIZES) await shot(page, 'lanes', width, height);
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
