// Region model, header, export dialog, launch state and menu coverage added
// by the layout study redesign (D-49).
// editor.test.mjs keeps the real editing/render/reopen lifecycle coverage;
// this file is the region-frame-specific acceptance suite this lane's brief
// asked for. Real Electron/IPC; only native file/message-box dialogs are
// mocked, the same way every other e2e spec in this directory does.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  createTempWorkspace,
  firstAppWindow,
  launchElectronApp,
  root,
  runElectronTest,
  stubQuitConfirm,
} from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  chooseLocale,
  openSourcePanel,
  waitForEditorReady,
} from './ui-actions.mjs';

async function openRealVideo(application, page, video) {
  await application.evaluate(({ dialog }, filename) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
  }, video);
  await addMediaToProject(page);
  await page.locator('.viewers video').waitFor();
}

function makeTestVideo(temp, name = 'frame.mp4') {
  const video = path.join(temp, name);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30:duration=4',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  return video;
}

test('no start screen: the full region frame is present at launch, empty', {
  timeout: 30000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-empty-');
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-empty-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      // All four regions exist and have a real box — not a centered start
      // card standing in for the frame (owner requirement).
      for (const selector of [
        '.editor-source-region',
        '.editor-viewer-region',
        '.editor-tool-rail',
        '.editor-timeline-region',
      ]) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, `${selector} must render empty`);
      }
      // The tool rail is static with no media open: seven items, all disabled,
      // and no tool panel (ED-R13). The source rail beside the left column is
      // never disabled — adding media is where an empty project starts.
      const tabs = page.locator('.editor-tool-rail [role="tab"]');
      assert.equal(await tabs.count(), 7, 'the rail always shows its seven items');
      for (const tab of await tabs.all()) {
        assert.equal(await tab.isDisabled(), true, 'every rail item is disabled with no media');
      }
      assert.equal(await page.locator('.editor-source-rail [role="tab"]').count(), 2);
      assert.equal(await page.locator('.editor-tool-panel-region').count(), 0);
      assert.equal(await page.locator('.editor-start-state').count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Start editing' }).count(), 0);
      await page.getByText('Drop a video here', { exact: true }).waitFor();
    },
  );
});

test('region order and proportions at 1420x900 and 1050x700 defaults', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-proportions-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-proportions-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);

      for (const size of [
        { width: 1420, height: 900 },
        { width: 1050, height: 700 },
      ]) {
        await page.setViewportSize(size);
        const cueBox = await page.locator('.editor-source-region').boundingBox();
        const viewerBox = await page.locator('.editor-viewer-region').boundingBox();
        assert.ok(cueBox && viewerBox, `${size.width}x${size.height}: both regions must exist`);
        assert.ok(
          viewerBox.x >= cueBox.x + cueBox.width - 1,
          `${size.width}x${size.height}: the monitor must sit at or past the cue panel's right edge`,
        );
        assert.ok(
          viewerBox.width >= cueBox.width,
          `${size.width}x${size.height}: the monitor (${viewerBox.width}) must be at least as wide as the cue panel (${cueBox.width})`,
        );
        // The tool rail is the fixed rightmost column at every width; with no
        // tool selected the video sits flush against it.
        const railBox = await page.locator('.editor-tool-rail').boundingBox();
        assert.ok(railBox, `${size.width}x${size.height}: the tool rail must exist`);
        assert.ok(
          railBox.x >= viewerBox.x + viewerBox.width - 1,
          `${size.width}x${size.height}: the rail must sit at or right of the viewer`,
        );
        assert.ok(
          railBox.width >= 40 && railBox.width <= 72,
          `${size.width}x${size.height}: the rail keeps its fixed width (${railBox.width})`,
        );
        assert.equal(
          await page.locator('.editor-tool-panel-region').count(),
          0,
          `${size.width}x${size.height}: no panel is open until a rail item is selected`,
        );
      }
    },
  );
});

const RAIL_LABELS = {
  en: ['Transcribe', 'Translate', 'Voice', 'Style', 'Clean up', 'Audio', 'Edit'],
  vi: ['Nhận dạng', 'Dịch', 'Giọng đọc', 'Kiểu chữ', 'Xoá chữ', 'Âm thanh', 'Chỉnh sửa'],
};

test('tool rail items and labels fit unclipped at 1420x900 and 1050x700 in English and Vietnamese', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-fit-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-fit-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);

      for (const locale of ['en', 'vi']) {
        // Changing locale (via the Settings sidebar destination, D-57) navigates away from
        // Editor and back — "Editor" is the same label in both locales.
        await chooseLocale(application, page, locale);
        await page.getByRole('button', { name: 'Editor', exact: true }).click();

        for (const size of [
          { width: 1420, height: 900 },
          { width: 1050, height: 700 },
        ]) {
          await page.setViewportSize(size);
          const label = `${locale} ${size.width}x${size.height}`;

          // One vertical tablist, seven labelled items, none clipped and none
          // needing a scroll button — the rail has a fixed column width and
          // each label wraps to at most two lines inside it.
          const tablist = page.locator('.editor-tool-rail[role="tablist"]');
          assert.equal(await tablist.count(), 1, `${label}: exactly one tool tablist`);
          assert.equal(
            await page.getByRole('tablist').count(),
            2,
            `${label}: one tablist per rail`,
          );
          assert.equal(
            await tablist.getAttribute('aria-orientation'),
            'vertical',
            `${label}: the tablist is vertical`,
          );
          const railBox = await page.locator('.editor-tool-rail').boundingBox();
          assert.ok(railBox, `${label}: the rail region must exist`);
          assert.equal(
            await page.locator('.astryx-tab-scroll-button').count(),
            0,
            `${label}: no rail item should need a scroll button`,
          );
          // A tablist may own only tabs: the divider between the two groups is
          // presentational (no role, aria-hidden), never a separator inside it.
          assert.deepEqual(
            await tablist.evaluate((element) =>
              [...element.children]
                .map((child) => child.getAttribute('role'))
                .filter((role) => role !== null),
            ),
            Array(7).fill('tab'),
            `${label}: the tablist owns only tab roles`,
          );
          assert.equal(
            await page.locator('.editor-tool-rail .editor-rail-rule').getAttribute('aria-hidden'),
            'true',
            `${label}: the rail rule is presentational`,
          );
          // No dangling IDREFs: with no panel open, no tab points at a panel.
          assert.equal(
            await page
              .locator('.editor-tool-rail [role="tab"]')
              .evaluateAll(
                (elements) =>
                  elements.filter((element) => element.hasAttribute('aria-controls')).length,
              ),
            0,
            `${label}: a closed rail exposes no aria-controls`,
          );
          const tabs = page.locator('.editor-tool-rail [role="tab"]');
          assert.equal(await tabs.count(), 7, `${label}: exactly seven rail items`);
          assert.deepEqual(
            await tabs.evaluateAll((elements) =>
              elements.map((element) => element.getAttribute('aria-label')),
            ),
            RAIL_LABELS[locale],
            `${label}: rail item names and order`,
          );
          for (const tabBox of await tabs.evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect()),
          )) {
            assert.ok(
              tabBox.width > 0 &&
                tabBox.x >= railBox.x - 1 &&
                tabBox.x + tabBox.width <= railBox.x + railBox.width + 1 &&
                tabBox.y >= railBox.y - 1 &&
                tabBox.y + tabBox.height <= railBox.y + railBox.height + 1,
              `${label}: every rail item must render fully inside the rail region`,
            );
          }
          // The rail is icon-only (D-63, owner): every item names
          // itself for assistive tech and shows that name in a tooltip.
          const names = await tabs.evaluateAll((elements) =>
            elements.map((element) => ({
              name: element.getAttribute('aria-label'),
              text: element.textContent.trim(),
            })),
          );
          for (const item of names) {
            assert.ok(
              item.name && item.name.length > 0,
              `${label}: every rail item needs an accessible name`,
            );
            assert.equal(item.text, '', `${label}: the rail renders no visible label text`);
          }
          await tabs.first().hover({ force: true });
          const railTip = page.locator('.astryx-tooltip', { hasText: names[0].name });
          await railTip.first().waitFor({ state: 'visible', timeout: 4000 });
          assert.equal(
            (await railTip.first().innerText()).trim(),
            names[0].name,
            `${label}: hovering a rail item shows its name`,
          );
          await page.mouse.move(0, 0);

          // The cue search field must show its full placeholder, not a
          // fixed-width clip ("Tìm"/"Sea" — coordinator review).
          await openSourcePanel(page, 'cues');
          const search = page.locator('.cue-panel').getByRole('textbox', {
            name: locale === 'vi' ? 'Tìm câu phụ đề' : 'Search cues',
          });
          await search.waitFor();
          const fit = await search.evaluate((element) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const style = getComputedStyle(element);
            ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            return {
              rendered: element.getBoundingClientRect().width,
              needed: ctx.measureText(element.placeholder).width,
            };
          });
          assert.ok(
            fit.rendered >= fit.needed,
            `${label}: the search field (${fit.rendered}px) must be at least as wide as its placeholder text (${fit.needed}px)`,
          );
        }
      }
    },
  );
});

for (const locale of ['en', 'vi']) {
  test(`stale status token is not truncated at 1420x900 and 1050x700 (${locale})`, {
    timeout: 60000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-frame-stale-');
    const video = makeTestVideo(temp);
    await runElectronTest(
      { temp, userData, screenshotName: `frame-stale-${locale}-failure.png` },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        if (locale === 'vi') {
          await chooseLocale(application, page, 'vi');
          await page.getByRole('button', { name: 'Editor', exact: true }).click();
        }
        await openRealVideo(application, page, video);

        // A revision change after the preview makes the monitor stale
        // deterministically (the state also appears on its own after some
        // edits; this only removes the timing guess).
        await page
          .getByRole('combobox', {
            name: locale === 'vi' ? 'Ngôn ngữ' : 'Language',
            exact: true,
          })
          .click();
        await page
          .getByRole('option', { name: locale === 'vi' ? 'Tiếng Anh' : 'English', exact: true })
          .click();

        for (const [width, height] of RAIL_SHOT_SIZES) {
          await page.setViewportSize({ width, height });
          const label = `${locale} ${width}x${height}`;
          const staleText = locale === 'vi' ? 'Chưa cập nhật' : 'Out of date';
          const badge = page.locator('.monitor-header-badge .astryx-badge');
          await badge.waitFor();
          assert.equal(
            (await badge.innerText()).trim(),
            staleText,
            `${label}: the stale token shows its full short copy`,
          );
          assert.equal(
            await badge.evaluate((element) => element.scrollWidth > element.clientWidth + 1),
            false,
            `${label}: the stale token must not be truncated`,
          );
        }
      },
    );
  });
}

test('the Style panel scrolls its last control into view', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-style-scroll-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-style-scroll-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);
      await page.setViewportSize({ width: 1420, height: 900 });

      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      const applyButton = page.getByRole('button', { name: 'Apply appearance', exact: true });
      await applyButton.waitFor();
      await applyButton.scrollIntoViewIfNeeded();
      const applyBox = await applyButton.boundingBox();
      const panelBox = await page.locator('.editor-tool-panel').boundingBox();
      assert.ok(applyBox && panelBox);
      assert.ok(
        applyBox.y >= panelBox.y - 1 &&
          applyBox.y + applyBox.height <= panelBox.y + panelBox.height + 1,
        "the Style panel's Apply button must scroll fully into view within the tool panel",
      );
    },
  );
});

test('region layout holds across window widths 1050-1920 and heights 700-900', {
  timeout: 120000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-responsive-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-responsive-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);

      const widths = [1050, 1200, 1280, 1420, 1680, 1920];
      const heights = [700, 800, 900];
      for (const height of heights) {
        for (const width of widths) {
          await page.setViewportSize({ width, height });
          const label = `${width}x${height}`;

          const cueBox = await page.locator('.editor-source-region').boundingBox();
          const viewerBox = await page.locator('.editor-viewer-region').boundingBox();
          assert.ok(cueBox && viewerBox, `${label}: cue and viewer regions must exist`);

          // Region order: cue, then viewer, then the fixed tool rail at the
          // right edge — left to right, at every width. (The tool panel is a
          // side column at wide widths and an overlay drawer below 1200px.)
          assert.ok(
            viewerBox.x >= cueBox.x + cueBox.width - 1,
            `${label}: the viewer must sit at or right of the cue region`,
          );
          // The video stays the largest region at every width (study §6.1
          // — it is the flex remainder, the side regions are fixed pixel
          // defaults the user must deliberately drag wider).
          assert.ok(
            viewerBox.width >= cueBox.width,
            `${label}: the video (${viewerBox.width}) must be at least as wide as the cue list (${cueBox.width})`,
          );

          const railBox = await page.locator('.editor-tool-rail').boundingBox();
          assert.ok(railBox, `${label}: the tool rail must exist at every width`);
          assert.ok(
            railBox.x >= viewerBox.x + viewerBox.width - 1,
            `${label}: the rail must sit at or right of the viewer`,
          );
          assert.ok(
            railBox.width >= 40 && railBox.width <= 72,
            `${label}: the rail keeps its fixed width (${railBox.width})`,
          );

          // editor.css's own drawer breakpoint is `max-width: 1199.98px`,
          // matching useIsWide(1200)'s `min-width: 1200px` exactly — so
          // 1200px itself is the side-column layout, not the drawer.
          const isWide = width >= 1200;
          if (isWide) {
            // Extra width at 1680/1920 goes to the video, not the cue list:
            // it stays at its fixed pixel default regardless of window width
            // (only a deliberate seam drag changes it).
            assert.ok(
              cueBox.width <= 480,
              `${label}: the cue list must stay capped, not stretch with the window (${cueBox.width})`,
            );

            // The two remaining region headers (the monitor's and the open
            // side panel's) start at the same y (±1px) — one shared inset in
            // editor.css, see the comment above `.viewers`. The tool panel is
            // closed here, so only these two are compared.
            const headerTops = await Promise.all(
              ['.monitor-header', '.editor-side-panel-header'].map(async (selector) => {
                const box = await page.locator(selector).boundingBox();
                return box?.y ?? null;
              }),
            );
            assert.ok(
              headerTops.every((top) => top !== null),
              `${label}: every region header must exist`,
            );
            const [first, ...rest] = headerTops;
            for (const top of rest) {
              assert.ok(
                Math.abs(top - first) <= 1,
                `${label}: region header rows must align within 1px (${headerTops.join(', ')})`,
              );
            }
          }

          // The timeline keeps a usable minimum height at every combination,
          // and the top row (studio body) never gets squashed below a
          // usable video height even at the shortest tested window.
          const timelineBox = await page.locator('.editor-timeline-region').boundingBox();
          assert.ok(timelineBox && timelineBox.height >= 100, `${label}: timeline too short`);
          assert.ok(viewerBox.height >= 120, `${label}: video region too short`);

          // No horizontal scrollbar anywhere in the workspace — checked as
          // `scrollWidth` vs `clientWidth` on each region's own scroll
          // container (the same technique the existing vertical check in
          // editor.test.mjs uses), not by walking every descendant's
          // bounding box: a region that legitimately scrolls its own
          // content (the timeline's third-party react-timeline-editor
          // ruler, whose last scale label can render a couple of px past
          // its own tick) must not be confused with real overflow just
          // because a naive geometry walk sees its content poke past the
          // workspace edge — it never reaches there, `.timeline`'s own
          // `overflow: auto` absorbs it first.
          const overflowingSelectors = await page.evaluate(() => {
            const candidates = ['.editor-workspace', '.viewers', '.cue-panel', '.timeline'];
            return candidates.filter((selector) => {
              const element = document.querySelector(selector);
              return element != null && element.scrollWidth > element.clientWidth + 1;
            });
          });
          assert.deepEqual(
            overflowingSelectors,
            [],
            `${label}: these containers need a horizontal scrollbar: ${overflowingSelectors.join(', ')}`,
          );
        }
      }
    },
  );
});

test('seams resize by drag and by keyboard, and the width persists across a relaunch', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-resize-');
  const video = makeTestVideo(temp);
  let application;
  try {
    application = await launchElectronApp({ userData });
    let page = await firstAppWindow(application);
    await stubQuitConfirm(application);
    await waitForEditorReady(page);
    await openRealVideo(application, page, video);
    await page.setViewportSize({ width: 1420, height: 900 });

    const cueRegion = page.locator('.editor-source-region');
    const before = await cueRegion.boundingBox();
    const handle = page.getByRole('separator', { name: 'Resize cue list', exact: true });
    await handle.waitFor();

    // Keyboard resize: a WAI-ARIA separator responds to arrow keys. Only a
    // couple of presses — the cue region's live maxSize (a percentage of
    // the studio body, EditorWorkspace.tsx) leaves less headroom above the
    // default than the old flat 480px cap did, and the next step still
    // needs room to grow the region further.
    await handle.focus();
    for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowRight');
    const afterKeyboard = await cueRegion.boundingBox();
    assert.notEqual(
      Math.round(afterKeyboard.width),
      Math.round(before.width),
      'ArrowRight on the cue seam must resize the cue region',
    );

    // Drag resize: move the handle further right.
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 80, handleBox.y + handleBox.height / 2, { steps: 8 });
    await page.mouse.up();
    const afterDrag = await cueRegion.boundingBox();
    assert.ok(
      afterDrag.width > afterKeyboard.width,
      'dragging the cue seam right must widen the cue region further',
    );

    // Double-click resets to the study's own default width.
    await handle.dblclick();
    const afterReset = await cueRegion.boundingBox();
    assert.notEqual(
      Math.round(afterReset.width),
      Math.round(afterDrag.width),
      'double-clicking the seam must reset its size',
    );

    // Resize away from the default again, then relaunch against the same
    // profile: the chosen width must survive (useResizable's own
    // localStorage persistence, editor.regions.width).
    await handle.focus();
    for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight');
    const beforeRelaunch = await cueRegion.boundingBox();
    await application.close();
    application = await launchElectronApp({ userData });
    page = await firstAppWindow(application);
    await page.setViewportSize({ width: 1420, height: 900 });
    await waitForEditorReady(page);
    const afterRelaunch = await page.locator('.editor-source-region').boundingBox();
    assert.ok(
      Math.abs(afterRelaunch.width - beforeRelaunch.width) <= 2,
      `cue region width must persist across a relaunch (${beforeRelaunch.width} vs ${afterRelaunch.width})`,
    );
  } finally {
    if (application) await application.close().catch(() => undefined);
    await import('node:fs/promises').then(({ rm }) => rm(temp, { recursive: true, force: true }));
  }
});

test('collapse the cue list to a rail and expand it again', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-collapse-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-collapse-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);
      await page.setViewportSize({ width: 1420, height: 900 });

      const collapseHandle = page.getByRole('separator', { name: 'Resize cue list', exact: true });
      await collapseHandle.focus();
      // The resize handle's own Enter key is a collapse/expand toggle
      // (Astryx ResizeHandle, WAI-ARIA window-splitter pattern) — the
      // keyboard-accessible way to close the left column to its rail. The
      // rail itself stays and is what opens it again (D-63, owner).
      await page.keyboard.press('Enter');
      await page.locator('.editor-source-region').waitFor({ state: 'detached' });
      const cues = page.locator('.editor-source-rail [role="tab"][data-rail-item="cues"]');
      assert.equal(await page.locator('.editor-source-rail [role="tab"]').count(), 2);
      assert.equal(await cues.getAttribute('aria-selected'), 'false');

      await cues.click();
      await page.locator('.editor-source-region').waitFor();
      assert.equal(await cues.getAttribute('aria-selected'), 'true');
    },
  );
});

test('the Export dialog offers kind/size/steps and there is exactly one profile picker', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-export-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-export-failure.png' },
    async ({ application, page }) => {
      await application.evaluate(({ dialog }) => {
        dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined });
      });
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);

      // Exactly one profile picker in the whole window.
      assert.equal(
        await page.getByRole('button', { name: /^Profile/ }).count(),
        1,
        'exactly one profile picker must exist in the DOM',
      );
      await page.getByRole('button', { name: /^Profile/ }).click();
      await page.getByRole('menuitem', { name: 'Manage profiles…', exact: true }).waitFor();
      await page.keyboard.press('Escape');

      // The Export dialog: kind, then size, then steps summary.
      await page.getByRole('button', { name: 'Export…', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Output', { exact: true }).waitFor();
      await dialog
        .getByRole('radio', { name: 'Video with burned-in subtitles', exact: true })
        .waitFor();
      await dialog.getByRole('radio', { name: 'Subtitle file', exact: true }).waitFor();
      await dialog.getByRole('radio', { name: 'Video and subtitle file', exact: true }).waitFor();
      await dialog.getByRole('combobox', { name: 'Aspect', exact: true }).waitFor();
      await dialog.getByRole('combobox', { name: 'Height', exact: true }).waitFor();
      // Kind = subtitle file only: no output-size controls, no encoding
      // disclosure — those apply to the video path only.
      await dialog.getByRole('radio', { name: 'Subtitle file', exact: true }).click();
      assert.equal(await dialog.getByRole('combobox', { name: 'Aspect', exact: true }).count(), 0);
    },
  );
});

test('the viewer stays the largest region even with both side seams dragged to their max', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-maxwidth-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-maxwidth-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);
      await page.setViewportSize({ width: 1420, height: 900 });

      // The tool panel must be open for its seam to exist; open it from the rail.
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      const cueHandle = page.getByRole('separator', { name: 'Resize cue list', exact: true });
      const panelHandle = page.getByRole('separator', {
        name: 'Resize tool panel',
        exact: true,
      });
      await cueHandle.waitFor();
      await panelHandle.waitFor();

      // Drag each seam far past its live percentage ceiling (28% of the
      // studio body, EditorWorkspace.tsx) — useResizable clamps the drop
      // at the live max regardless of how far the pointer travels.
      const cueBox = await cueHandle.boundingBox();
      await page.mouse.move(cueBox.x + cueBox.width / 2, cueBox.y + cueBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(cueBox.x + 900, cueBox.y + cueBox.height / 2, { steps: 10 });
      await page.mouse.up();

      const panelBox = await panelHandle.boundingBox();
      await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(panelBox.x - 900, panelBox.y + panelBox.height / 2, {
        steps: 10,
      });
      await page.mouse.up();

      const cueRegion = await page.locator('.editor-source-region').boundingBox();
      const panelRegion = await page.locator('.editor-tool-panel-region').boundingBox();
      const viewerRegion = await page.locator('.editor-viewer-region').boundingBox();

      assert.ok(
        viewerRegion.width >= cueRegion.width,
        `viewer (${viewerRegion.width}) must stay at least as wide as the cue list maxed out (${cueRegion.width})`,
      );
      assert.ok(
        viewerRegion.width >= panelRegion.width,
        `viewer (${viewerRegion.width}) must stay at least as wide as the tool panel maxed out (${panelRegion.width})`,
      );
      // Each side region is capped near 28% of the studio body, not the old
      // flat 480px — confirms the drag actually hit a percentage ceiling
      // well under 480 at this width, not just an unrelated smaller number.
      assert.ok(
        cueRegion.width < 460,
        `cue region must not reach the old flat 480px cap (${cueRegion.width})`,
      );
      assert.ok(
        panelRegion.width < 460,
        `tool panel must not reach the old flat 480px cap (${panelRegion.width})`,
      );
    },
  );
});

test('tool rail is static, starts disabled with no media, and the active item collapses the panel', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-rail-collapse-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-rail-collapse-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await page.setViewportSize({ width: 1420, height: 900 });
      const tabs = page.locator('.editor-tool-rail [role="tab"]');
      assert.equal(await tabs.count(), 7);
      for (const tab of await tabs.all()) {
        assert.equal(await tab.isDisabled(), true, 'no media: every item is disabled');
      }
      assert.equal(await page.locator('.editor-tool-panel-region').count(), 0);

      await openRealVideo(application, page, video);
      for (const tab of await tabs.all()) {
        assert.equal(await tab.isDisabled(), false, 'with media every item is enabled');
      }

      // Opening Style places the panel between the video and the rail.
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      const panel = page.locator('.editor-tool-panel-region');
      await panel.waitFor();
      const panelBox = await panel.boundingBox();
      const railBox = await page.locator('.editor-tool-rail').boundingBox();
      assert.ok(panelBox && railBox);
      assert.ok(
        panelBox.x + panelBox.width <= railBox.x + 1,
        'the tool panel must sit immediately left of the rail',
      );
      assert.equal(
        await page.getByRole('tab', { name: 'Style', exact: true }).getAttribute('aria-selected'),
        'true',
      );

      // Selecting the active item again collapses the panel; the rail stays.
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      await panel.waitFor({ state: 'detached' });
      const viewerBox = await page.locator('.editor-viewer-region').boundingBox();
      const railBox2 = await page.locator('.editor-tool-rail').boundingBox();
      assert.ok(viewerBox && railBox2);
      assert.ok(
        viewerBox.x + viewerBox.width >= railBox2.x - 1,
        'collapsed: the video sits against the rail',
      );
      assert.equal(await tabs.count(), 7, 'the rail never collapses');
    },
  );
});

test('tool rail keyboard: arrows move, Enter opens, Tab enters the panel, Escape collapses', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-rail-keyboard-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-rail-keyboard-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);
      await page.setViewportSize({ width: 1420, height: 900 });

      const cleanUp = page.getByRole('tab', { name: 'Clean up', exact: true });
      await cleanUp.focus();
      await page.keyboard.press('ArrowDown');
      const audio = page.getByRole('tab', { name: 'Audio', exact: true });
      assert.equal(
        await audio.evaluate((element) => element === document.activeElement),
        true,
        'ArrowDown moves focus across the divider to the next rail item',
      );
      await page.keyboard.press('ArrowUp');
      assert.equal(
        await cleanUp.evaluate((element) => element === document.activeElement),
        true,
        'ArrowUp moves focus back',
      );
      await audio.focus();
      await page.keyboard.press('Enter');
      await page.locator('#panel-audio').waitFor({ state: 'visible' });
      // Only the selected tab advertises the panel that actually exists.
      assert.equal(await audio.getAttribute('aria-controls'), 'panel-audio');
      assert.equal(
        await page
          .locator('.editor-tool-rail [role="tab"]')
          .evaluateAll(
            (elements) =>
              elements.filter((element) => element.hasAttribute('aria-controls')).length,
          ),
        1,
        'exactly the selected tab owns the panel IDREF',
      );

      // Tab moves into the open panel rather than out of the workspace.
      await audio.focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(
          () => document.getElementById('panel-audio')?.contains(document.activeElement) ?? false,
        ),
        true,
        'Tab from the rail lands inside the tool panel',
      );

      // Escape collapses the panel and leaves the rail in place.
      await audio.focus();
      await page.keyboard.press('Escape');
      await page.locator('#panel-audio').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.editor-tool-rail [role="tab"]').count(), 7);
    },
  );
});

test('crossing the 1200px breakpoint keeps the open tool and its panel state', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-rail-breakpoint-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-rail-breakpoint-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);
      await page.setViewportSize({ width: 1420, height: 900 });

      await page.getByRole('tab', { name: 'Voice', exact: true }).click();
      const scope = page.getByRole('combobox', { name: 'Cues to generate', exact: true });
      await scope.waitFor();
      await scope.click();
      await page.getByRole('option', { name: 'All spoken cues', exact: true }).click();
      assert.equal(
        (await scope.textContent())?.includes('All spoken cues'),
        true,
        'the Voice panel scope selection sticks',
      );

      // Wide -> narrow -> wide: the same Voice panel stays open and keeps the
      // chosen scope (the old inspector remounted and lost this state).
      await page.setViewportSize({ width: 1050, height: 700 });
      await page.locator('#panel-voice').waitFor({ state: 'visible' });
      assert.equal(
        (await scope.textContent())?.includes('All spoken cues'),
        true,
        'panel state survives the narrow crossing',
      );
      assert.equal(
        await page.getByRole('tab', { name: 'Voice', exact: true }).getAttribute('aria-selected'),
        'true',
      );

      await page.setViewportSize({ width: 1420, height: 900 });
      await page.locator('.editor-tool-panel-region').waitFor();
      assert.equal(
        (await scope.textContent())?.includes('All spoken cues'),
        true,
        'panel state survives the wide crossing back',
      );
    },
  );
});

test('tool panel width drags and resets on double-click', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-panel-width-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-panel-width-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);
      await page.setViewportSize({ width: 1420, height: 900 });

      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      const region = page.locator('.editor-tool-panel-region');
      await region.waitFor();
      const before = await region.boundingBox();
      const handle = page.getByRole('separator', { name: 'Resize tool panel', exact: true });
      await handle.waitFor();
      const handleBox = await handle.boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 70, handleBox.y + handleBox.height / 2, { steps: 8 });
      await page.mouse.up();
      const afterDrag = await region.boundingBox();
      assert.ok(
        afterDrag.width > before.width + 10,
        `dragging the seam left must widen the tool panel (${before.width} -> ${afterDrag.width})`,
      );

      await handle.dblclick();
      const afterReset = await region.boundingBox();
      assert.ok(
        Math.abs(afterReset.width - before.width) <= 2,
        `double-click must reset the tool panel width (${afterReset.width} vs ${before.width})`,
      );
    },
  );
});

const RAIL_TOOL_IDS = ['transcribe', 'translate', 'voice', 'style', 'clean-up', 'audio', 'edit'];
const RAIL_SCREENSHOT_LABELS = {
  en: ['Transcribe', 'Translate', 'Voice', 'Style', 'Clean up', 'Audio', 'Edit'],
  vi: ['Nhận dạng', 'Dịch', 'Giọng đọc', 'Kiểu chữ', 'Xoá chữ', 'Âm thanh', 'Chỉnh sửa'],
};
const RAIL_SHOT_SIZES = [
  [1420, 900],
  [1050, 700],
];
const SHOTS_DIR = path.join(root, '.test-artifacts');

/** One locale per launch: chooseLocale looks up the Settings nav by its English name, so a
 * second switch after a Vietnamese session would look for a label the app no longer shows. */
async function captureRailScreenshots(locale) {
  const { temp, userData } = await createTempWorkspace(`reupmatic-frame-rail-shots-${locale}-`);
  const video = makeTestVideo(temp);
  await mkdir(SHOTS_DIR, { recursive: true });
  await runElectronTest({ temp, userData }, async ({ application, page }) => {
    await waitForEditorReady(page);
    if (locale === 'vi') {
      await chooseLocale(application, page, 'vi');
      await page.getByRole('button', { name: 'Editor', exact: true }).click();
    }
    await page.locator('.editor-tool-rail').waitFor();
    for (const [width, height] of RAIL_SHOT_SIZES) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: path.join(SHOTS_DIR, `rail-${locale}-empty-${width}x${height}.png`),
      });
    }

    await openRealVideo(application, page, video);
    for (const [width, height] of RAIL_SHOT_SIZES) {
      await page.setViewportSize({ width, height });
      for (const [index, tool] of RAIL_TOOL_IDS.entries()) {
        await page
          .getByRole('tab', { name: RAIL_SCREENSHOT_LABELS[locale][index], exact: true })
          .click();
        await page.locator(`#panel-${tool}`).waitFor({ state: 'visible' });
        await page.screenshot({
          path: path.join(SHOTS_DIR, `rail-${locale}-${tool}-${width}x${height}.png`),
        });
      }
    }
  });
}

for (const locale of ['en', 'vi']) {
  test(`tool rail and tool panel screenshots (${locale}, 1420x900 and 1050x700)`, {
    timeout: 150000,
  }, async () => {
    await captureRailScreenshots(locale);
  });
}

test('Audio source mute persists to the document and across tool switches', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-frame-audio-mute-');
  const video = makeTestVideo(temp);
  await runElectronTest(
    { temp, userData, screenshotName: 'frame-audio-mute-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await openRealVideo(application, page, video);
      await page.setViewportSize({ width: 1420, height: 900 });

      await page.getByRole('tab', { name: 'Audio', exact: true }).click();
      const mute = page.getByRole('checkbox', { name: 'Remove source audio', exact: true });
      await mute.waitFor();
      await mute.check();
      assert.equal(await mute.isChecked(), true, 'checking mute must persist to the document');

      // Leave the panel and come back: the choice lives in the project, not
      // in the unmounted panel.
      await page.getByRole('tab', { name: 'Voice', exact: true }).click();
      await page.getByRole('tab', { name: 'Audio', exact: true }).click();
      await page.locator('#panel-audio').waitFor({ state: 'visible' });
      assert.equal(await mute.isChecked(), true, 'the muted source survives a panel switch');
    },
  );
});
