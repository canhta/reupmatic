// SOURCE-ONLY until installed Electron/Playwright dependencies pass this gate.
// Native pickers are controlled fixture input. Renderer, IPC, worker and FFmpeg
// are real; no mocked media, rendering, subtitle library or AI is substituted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pythonExecutable } from '../../scripts/python.mjs';
import {
  createTempWorkspace,
  root,
  runElectronTest,
  seedRecoveryDraft,
} from './helpers/electron-harness.mjs';
import { composeText } from './helpers/ime.mjs';
import {
  addCue,
  addMediaToProject,
  chooseLocale,
  clickMenuItem,
  notificationBell,
  openNotifications,
  openSourcePanel,
  waitForEditorReady,
} from './ui-actions.mjs';

/**
 * Accessible names of visible header controls that a real mouse click cannot
 * reach because window dragging swallows them. `-webkit-app-region` is
 * inherited from the header's own `drag`; a control needs a `no-drag` ancestor
 * (workspace.css `.workspace-title` / `.workspace-toolbar-control` /
 * `.workspace-command-actions`). Playwright's synthetic clicks bypass the
 * OS-level drag handling, so only this computed-style check catches the bug.
 */
async function headerControlsInDragRegion(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.astryx-app-shell-header');
    const region = (el) => getComputedStyle(el).getPropertyValue('-webkit-app-region').trim();
    const swallowed = (el) => {
      let node = el;
      while (node && node !== header) {
        if (region(node) === 'no-drag') return false;
        node = node.parentElement;
      }
      return region(header) === 'drag';
    };
    return [...header.querySelectorAll('button')]
      .filter((el) => el.offsetParent !== null && swallowed(el))
      .map((el) => el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24));
  });
}

for (const locale of ['en', 'vi']) {
  test(`Electron editing, real render and project reopen (${locale})`, {
    timeout: 120000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-e2e-');
    const video = path.join(temp, 'video tự quay.mp4');
    const srt = path.join(temp, 'phụ đề.srt');
    const project = path.join(temp, 'bản dựng.reupmatic.json');
    // Missing native/subtitle dependencies fail this test; no silent skip.
    execFileSync(pythonExecutable(root), ['-c', 'import pysubs2']);
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=30:duration=4',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-n',
      video,
    ]);
    await writeFile(srt, '1\n00:00:00,200 --> 00:00:03,800\nTiếng Việt — English\n');
    const errors = [];
    await runElectronTest(
      { temp, userData, screenshotName: `editor-${locale}-failure.png` },
      async ({ application, page }) => {
        page.on('pageerror', (error) => errors.push(error.stack || error.message));
        await waitForEditorReady(page);
        const capabilities = await page.evaluate(() => window.reupmatic.hello());
        assert.equal(capabilities.ok, true);
        assert.equal(capabilities.data.pysubs2, true);
        assert.equal(capabilities.data.ffmpeg, true);
        await application.evaluate(
          ({ dialog }, files) => {
            const pending = [files.video, files.srt, files.project, files.video];
            dialog.showOpenDialog = async () => {
              const filename = pending.shift();
              if (!filename) throw new Error('Unexpected native file request in test');
              return { canceled: false, filePaths: [filename] };
            };
            dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.project });
          },
          { video, srt, project },
        );
        await addMediaToProject(page);
        // CuePanel's toolbar (Add cue, overflow) now stays mounted
        // and merely disabled while no video is open (lane-editor-content's
        // own empty-state change) instead of not existing at all — wait for
        // the video itself, the real end state, rather than relying on the
        // button's mount timing to serialize with the async open().
        await page.locator('.viewers video').waitFor();
        // Subtitle import lives in Project media now; recognition, extraction
        // and translation are set up in the Transcribe and Translate tool
        // panels (ED-P01, tickets 02–03).
        await openSourcePanel(page, 'media');
        await page.getByRole('button', { name: 'Add…', exact: true }).click();
        await openSourcePanel(page, 'cues');
        const text = page.getByRole('textbox', { name: 'Text 1', exact: true });
        await text.waitFor();
        await text.fill('Cà phê Việt Nam — changed');
        await page.getByRole('spinbutton', { name: 'Start (seconds) 1', exact: true }).fill('0.5');
        await text.focus();
        // Undo/redo moved to the native Edit menu (the cue list's own
        // Undo/Redo buttons are gone); invoke it exactly as a user's click
        // would, the same way menu.test.mjs proves menu/button parity. The
        // click's own IPC round trip (main -> renderer menu-command
        // channel) resolves before the resulting state update commits, so
        // poll the field's value instead of reading it immediately.
        const startField = page.getByRole('spinbutton', {
          name: 'Start (seconds) 1',
          exact: true,
        });
        const startHandle = await startField.elementHandle();
        await clickMenuItem(application, 'Edit', 'Undo');
        await page.waitForFunction(([el, expected]) => el.value === expected, [startHandle, '0.2']);
        assert.equal(await startField.inputValue(), '0.2');
        await clickMenuItem(application, 'Edit', 'Redo');
        await page.waitForFunction(([el, expected]) => el.value === expected, [startHandle, '0.5']);
        assert.equal(await startField.inputValue(), '0.5');
        // Changing locale (via the Settings sidebar destination, D-57) navigates away from
        // Editor and back; "Editor" is the same label in both locales, so this one click
        // works regardless of which locale the loop is on.
        await chooseLocale(application, page, locale);
        await page.getByRole('button', { name: 'Editor', exact: true }).click();
        const labels =
          locale === 'vi'
            ? {
                text: 'Nội dung 1',
                render: 'Đoạn mẫu',
                preview: 'Bản render',
                accept: 'Tiếp tục',
                fileMenu: 'Tệp',
                saveProject: 'Lưu dự án',
                openProject: 'Mở dự án…',
              }
            : {
                text: 'Text 1',
                render: 'Sample',
                preview: 'Rendered',
                accept: 'Continue',
                fileMenu: 'File',
                saveProject: 'Save Project',
                openProject: 'Open Project…',
              };
        assert.equal(
          await page.getByRole('textbox', { name: labels.text, exact: true }).inputValue(),
          'Cà phê Việt Nam — changed',
        );
        // Save Project has no in-page button any more (U2); the File menu is
        // its one home. The native menu rebuilds in the chosen locale
        // (NAV-L10N) the instant chooseLocale's own 'ui-locale' report
        // reaches main.ts, so its label follows `labels` from here on too.
        await clickMenuItem(application, labels.fileMenu, labels.saveProject);
        // Poll a concrete UI save state, not a fixed sleep or a fabricated worker result.
        await page
          .getByText(locale === 'vi' ? 'Không có thay đổi chưa lưu' : 'No unsaved changes', {
            exact: true,
          })
          .waitFor();
        const saved = JSON.parse(await readFile(project, 'utf8'));
        assert.equal(saved.cues[0].text, 'Cà phê Việt Nam — changed');
        assert.equal(saved.cues[0].start_ms, 500);
        // Render sample lives in the monitor's own preview mode now, not a
        // top-level action bar — switch the monitor before reaching it.
        await page.getByRole('radio', { name: labels.preview, exact: true }).click();
        await page.getByRole('button', { name: labels.render, exact: true }).click();
        const renderError = page.locator('.editor-workspace > .error[role="alert"]');
        const renderOutcome = page
          .locator('video[data-monitor-video="preview"]')
          .or(renderError)
          .first();
        await renderOutcome.waitFor({ state: 'visible', timeout: 60000 });
        if (await renderError.isVisible()) {
          throw new Error(`Render failed in the installed UI: ${await renderError.innerText()}`);
        }
        const rendered = page.locator('video[data-monitor-video="preview"]');
        await page.waitForFunction(() => {
          const element = document.querySelector('video[data-monitor-video="preview"]');
          return (
            element instanceof HTMLVideoElement && element.readyState >= 1 && element.duration > 0
          );
        });
        assert.match(await rendered.getAttribute('src'), /^media:\/\/local\//);
        await page.getByRole('textbox', { name: labels.text, exact: true }).fill('unsaved edit');
        // With a project open the header title renames it; opening another one
        // is the File menu's job (D-63, owner).
        await clickMenuItem(application, labels.fileMenu, labels.openProject);
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: labels.accept, exact: true })
          .click();
        await page
          .getByText(locale === 'vi' ? 'Không có thay đổi chưa lưu' : 'No unsaved changes', {
            exact: true,
          })
          .waitFor();
        assert.equal(
          await page.getByRole('textbox', { name: labels.text, exact: true }).inputValue(),
          'Cà phê Việt Nam — changed',
        );
        assert.equal(await page.locator('video[data-monitor-video="preview"]').count(), 0);
        assert.deepEqual(errors, []);
      },
    );
  });
}

// The old "Editor inspector sections switch via the tools selector"
// test lived here. The D-63 re-layout replaced the four inspector tabs with
// the labelled tool rail; this keeps the equivalent keyboard coverage.
test('Editor tool rail has exactly seven items, keyboard-operable', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-e2e-');
  const video = path.join(temp, 'video.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=4',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await runElectronTest({ temp, userData }, async ({ application, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForEditorReady(page);
    await application.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, video);
    await addMediaToProject(page);
    await page.locator('.viewers video').waitFor();
    // Seven icon-only items replace the old four icon tabs (D-63): each names
    // itself through its accessible name and a tooltip, never visible text.
    const tabs = page.locator('.editor-tool-rail [role="tab"]');
    await tabs.first().waitFor();
    assert.deepEqual(
      await tabs.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('aria-label')),
      ),
      ['Transcribe', 'Translate', 'Voice', 'Style', 'Clean up', 'Audio', 'Edit'],
    );
    assert.deepEqual(
      await tabs.evaluateAll((elements) => elements.map((element) => element.textContent?.trim())),
      ['', '', '', '', '', '', ''],
    );
    // Two rails now (D-63, owner): sources on the left, tools on
    // the right, each its own vertical tablist.
    const tablist = page.locator('.editor-tool-rail[role="tablist"]');
    assert.equal(await tablist.count(), 1);
    assert.equal(await tablist.getAttribute('aria-orientation'), 'vertical');
    assert.equal(await page.getByRole('tablist').count(), 2);

    // Keyboard-operable: Up/Down move, Enter opens the focused item's panel.
    const cleanUp = page.getByRole('tab', { name: 'Clean up', exact: true });
    await cleanUp.focus();
    await page.keyboard.press('ArrowDown');
    const audio = page.getByRole('tab', { name: 'Audio', exact: true });
    assert.equal(
      await audio.evaluate((element) => element === document.activeElement),
      true,
      'ArrowDown moves focus to the next rail item',
    );
    await page.keyboard.press('Enter');
    const audioPanel = page.locator('#panel-audio');
    await audioPanel.waitFor({ state: 'visible' });
    assert.equal(await audio.getAttribute('aria-selected'), 'true');

    // Tab from the rail moves into the open panel.
    await audio.focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(
        () => document.getElementById('panel-audio')?.contains(document.activeElement) ?? false,
      ),
      true,
    );

    // Escape collapses; re-opening a different item swaps the panel content.
    await audio.focus();
    await page.keyboard.press('Escape');
    await audioPanel.waitFor({ state: 'detached' });
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    await page.locator('#panel-style').waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: 'Clean up', exact: true }).click();
    await page.locator('#panel-clean-up').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#panel-style').count(), 0);
  });
});

// This test covers only the region frame: EditorWorkspace.tsx/editor.css/
// EditorRegions.tsx (this lane). See tests/e2e/editor-frame.test.mjs for the
// new region model, header, export dialog, launch state and menu coverage
// this redesign added.
test('populated Editor keeps preview, cues, timeline and tools in desktop regions', {
  timeout: 120000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-editor-regions-');
  const video = path.join(temp, 'region-layout.mp4');
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
  await runElectronTest(
    { temp, userData, screenshotName: 'editor-regions-failure.png' },
    async ({ application, page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      // The Export dialog now saves a completed full render itself (U11):
      // stub the destination picker it triggers, same as
      // save-project/save-subtitles already are elsewhere in this file.
      await application.evaluate(({ dialog }) => {
        dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined });
      });
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, video);
      await addMediaToProject(page);
      await page.locator('.viewers video').waitFor();
      await addCue(page);
      const content = page.getByRole('textbox', { name: 'Text 1', exact: true });
      await content.waitFor();
      // Realistic populated content, not an empty field: long enough that a
      // narrow Text column would visibly clip or force horizontal scroll.
      await content.fill(
        'A realistically long subtitle line used to check the Text column claims the remaining cue-table width instead of clipping',
      );

      const workspace = page.locator('.workspace-scroll-region');
      const statusBar = await page.locator('.workspace-statusbar').boundingBox();
      assert.ok(statusBar);
      for (const selector of [
        '.editor-source-region',
        '.editor-viewer-region',
        '.editor-timeline-region',
      ]) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.width >= 100 && box.height >= 50, `${selector} needs a useful region`);
        assert.ok(
          box.y + box.height <= statusBar.y + 1,
          `${selector} must remain above the status bar`,
        );
      }
      // The rail is a narrow fixed column, not a >=100px region.
      const railBox = await page.locator('.editor-tool-rail').boundingBox();
      assert.ok(
        railBox && railBox.width >= 44 && railBox.height >= 100,
        'the rail needs a useful box',
      );
      assert.ok(railBox.y + railBox.height <= statusBar.y + 1);
      assert.equal(
        await workspace.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
        true,
        'the populated Editor must not become one long page',
      );

      // The cue table must use the available width and scroll internally,
      // not clip its Content column mid-field (regression for the audit's
      // ticket-03 finding).
      const wideViewport = page.viewportSize();
      const wideContentBox = await content.boundingBox();
      assert.ok(
        wideContentBox &&
          wideContentBox.x >= 0 &&
          wideContentBox.x + wideContentBox.width <= wideViewport.width + 1,
        'the cue Content column must not be clipped at 1420x900',
      );
      // A prior version of this test also asserted the cue-list region
      // itself never needs horizontal scrolling to reveal the Text column.
      // That assumed CuePanel.tsx's every-row-editable columns (index 48px +
      // start 148px + end 148px + a 160px-minimum Text column ≈ 504px
      // minimum) inside a region sized to the study's own default (§6.1
      // "≈26%", ≈280px at 1420px so the viewer stays ≥1.5× the cue region,
      // this lane's own acceptance rule). Those two numbers don't fit
      // together at once — CuePanel's compact-row-only-selected-expands
      // design (L5) is lane-editor-content's redesign, not landed yet, so
      // this assertion is dropped until their narrower row layout exists.

      // One monitor, not two stacked video cards: a mode switch chooses
      // between Source and Rendered preview, and each mode shows only its
      // own options.
      assert.equal(await page.locator('.viewers video').count(), 1);
      await page.getByRole('radio', { name: 'Source', exact: true }).waitFor();
      const previewModeSwitch = page.getByRole('radio', { name: 'Rendered', exact: true });
      assert.equal(
        await page.getByRole('spinbutton', { name: 'Start (s)' }).count(),
        0,
        'sample range must not show in Source mode',
      );
      await previewModeSwitch.click();
      await page
        .locator('video[data-monitor-video="preview"], .video-placeholder')
        .first()
        .waitFor();
      // No sample rendered yet in this fresh document: a compact empty
      // state with one action, not a second blank card next to controls.
      const monitorRenderSample = page.getByRole('button', { name: 'Sample', exact: true });
      await monitorRenderSample.waitFor();
      assert.equal(await page.locator('video[data-monitor-video="preview"]').count(), 0);
      assert.equal(
        await page.getByRole('spinbutton', { name: 'Start (s)' }).count(),
        0,
        'the pre-sample empty state shows only the Render sample action, not the range inputs too',
      );
      // Switch back to Source without rendering, then trigger a render from
      // the header Export dialog (study §5.6 #30/#32/U11) — this is the
      // real auto-switch case: the monitor must jump from Source to
      // Rendered preview on its own once the render lands, not stay put.
      await page.getByRole('radio', { name: 'Source', exact: true }).click();
      await page.locator('video[data-monitor-video="source"]').waitFor();
      await page.getByRole('button', { name: 'Export…', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
      await page.locator('video[data-monitor-video="preview"]').waitFor({ timeout: 60000 });
      await page.getByRole('radio', { name: 'Rendered', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('radio', { name: 'Source', exact: true }).getAttribute('aria-checked'),
        'false',
        'the monitor must auto-switch away from Source once a render lands',
      );
      await page.getByRole('spinbutton', { name: 'Start (s)' }).waitFor();
      assert.equal(await page.locator('.viewers video').count(), 1);

      // The timeline carries real information for a loaded video: cue
      // blocks with an actual fill (the vendor stylesheet is loaded), not a
      // region with height but nothing visible in it.
      const timelineAction = page.locator('.timeline-editor-action').first();
      await timelineAction.waitFor();
      const actionBackground = await timelineAction.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      assert.notEqual(
        actionBackground,
        'rgba(0, 0, 0, 0)',
        'a cue block on the timeline must have a real fill, not a transparent/unstyled box',
      );

      // The Clean up panel's last control scrolls cleanly into view within
      // the tool panel instead of being cut off at the bottom.
      const cleanUpTab = page.getByRole('tab', { name: 'Clean up', exact: true });
      await cleanUpTab.click();
      // No standalone "Render removal sample" button any more (U10/U11):
      // removal previews through the monitor's one Render sample. The
      // manual mask region's last field is now the panel's own last control.
      const lastControl = page.getByRole('spinbutton', { name: 'Height (%)', exact: true });
      await lastControl.scrollIntoViewIfNeeded();
      const lastControlBox = await lastControl.boundingBox();
      const panelBox = await page.locator('.editor-tool-panel').boundingBox();
      assert.ok(lastControlBox && panelBox);
      assert.ok(
        lastControlBox.y >= panelBox.y - 1 &&
          lastControlBox.y + lastControlBox.height <= panelBox.y + panelBox.height + 1,
        'the Clean up panel last control must scroll fully into view within the tool panel',
      );
      await page.getByRole('tab', { name: 'Style', exact: true }).click();

      // Every subtitle tool (layers, appearance, bulk rules, export) lives in
      // the tool panel or the cue list header now; the cue list itself is
      // search, add cue and the declared text-layer language — subtitle
      // import moved to Project media. Export moved out of the panel to the
      // header dialog.
      const cuePanel = page.locator('.cue-panel');
      await content.waitFor();
      assert.equal(await cuePanel.getByText('Layer', { exact: true }).isVisible(), true);
      // "Copy from another layer" lives behind the cue list's own overflow
      // menu now (rendered, but only visible once that menu opens) instead
      // of a permanently open collapsible; Export moved out of the panel
      // entirely.
      assert.equal(await cuePanel.getByText('Copy from another layer').first().isVisible(), false);
      assert.equal(
        await cuePanel.getByText('Export subtitles', { exact: true }).first().isVisible(),
        false,
      );
      await cuePanel.getByPlaceholder('Search cues').waitFor();

      // The tool rail is the fixed seven-item column, icon-only; no TabList
      // strips remain. The source rail on the left is the other two items.
      const tabs = page.locator('.editor-tool-rail [role="tab"]');
      await tabs.first().waitFor({ timeout: 5000 });
      assert.deepEqual(
        await tabs.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('aria-label')),
        ),
        ['Transcribe', 'Translate', 'Voice', 'Style', 'Clean up', 'Audio', 'Edit'],
      );
      assert.deepEqual(
        await page
          .locator('.editor-source-rail [role="tab"]')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))),
        ['Media', 'Subtitles'],
      );
      assert.equal(await page.locator('.astryx-tab-scroll-button').count(), 0);

      // Below 1200px the panel is the overlay drawer, opened from the rail.
      await page.setViewportSize({ width: 1050, height: 700 });
      await page.locator('#panel-style').waitFor({ state: 'visible' });
      // Selecting the active item collapses it; selecting it again reopens it.
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      await page.locator('#panel-style').waitFor({ state: 'detached' });
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      await page.locator('#panel-style').waitFor({ state: 'visible' });
      const compactTimeline = await page.locator('.timeline').boundingBox({ timeout: 5000 });
      const compactStatusBar = await page.locator('.workspace-statusbar').boundingBox({
        timeout: 5000,
      });
      assert.ok(
        compactTimeline &&
          compactStatusBar &&
          compactTimeline.y + compactTimeline.height <= compactStatusBar.y + 1,
      );
      assert.equal(
        await workspace.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
        true,
      );
      const compactViewport = page.viewportSize();
      const compactContentBox = await content.boundingBox({ timeout: 5000 });
      assert.ok(
        compactContentBox &&
          compactContentBox.x >= 0 &&
          compactContentBox.x + compactContentBox.width <= compactViewport.width + 1,
        'the cue Content column must not be clipped at 1050x700',
      );

      // Every rail item stays reachable in the compact layout — checked last
      // so nothing below depends on closing the drawer.
      for (const label of [
        'Transcribe',
        'Translate',
        'Voice',
        'Style',
        'Clean up',
        'Audio',
        'Edit',
      ]) {
        const tabOption = page.getByRole('tab', { name: label, exact: true });
        await tabOption.waitFor({ timeout: 5000 });
        const box = await tabOption.boundingBox({ timeout: 5000 });
        assert.ok(box && box.width > 0, `${label} rail item must be reachable`);
      }
    },
  );
});

test('Editor start state has no recovery affordance when no drafts are recoverable', {
  timeout: 30000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-recovery-empty-');
  await runElectronTest({ temp, userData }, async ({ page }) => {
    await waitForEditorReady(page);
    // Recovered drafts now live in the header source switcher's Recent
    // section plus a one-time notice (U13) — with no drafts, neither shows.
    assert.equal(await page.getByText(/recovered draft/i).count(), 0);
    await page.locator('.editor-project-header button[aria-haspopup="menu"]').click();
    assert.equal(await page.getByText('Recent', { exact: true }).count(), 0);
  });
});

test('Editor start state recovery panel counts drafts and supports open/discard with focus return', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-recovery-present-');
  const video = path.join(temp, 'video tự quay.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=3',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  const sourceSha256 = createHash('sha256')
    .update(await readFile(video))
    .digest('hex');
  await seedRecoveryDraft(userData, {
    id: 'recovery-draft-openable',
    sourcePath: '/Users/tester/video tự quay.mp4',
    sourceSha256,
    cues: [{ id: 'cue1', start_ms: 200, end_ms: 1800, text: 'Cà phê Việt Nam' }],
  });
  await seedRecoveryDraft(userData, {
    id: 'recovery-draft-discardable',
    sourcePath: '/Users/tester/bản demo cũ.mp4',
    sourceSha256: 'b'.repeat(64),
    cues: [{ id: 'cue1', start_ms: 0, end_ms: 500, text: 'Bản nháp cũ' }],
  });
  await runElectronTest(
    { temp, userData, screenshotName: 'editor-recovery-present-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      // Recovered drafts surface one way (owner — the unprompted
      // popup notice is gone): Open-only rows in the project picker's own
      // Recent section, each marked "Recovered". The picker is the title
      // itself while no project is open.
      const switcherTrigger = page.locator('.editor-project-header button[aria-haspopup="menu"]');
      assert.deepEqual(
        await headerControlsInDragRegion(page),
        [],
        'no header control may sit in the window drag region',
      );
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, video);
      await switcherTrigger.click();
      // Each row carries the draft project's own name (its source basename
      // without extension, since the seeded project was never renamed).
      const openRow = page.getByRole('menuitem', { name: /^video tự quay/ });
      await openRow.waitFor();
      await page.getByRole('menuitem', { name: /^bản demo cũ/ }).waitFor();
      await openRow.click();
      await page.locator('.viewers video').waitFor();
      // Focus lands on the header title once a recovered draft opens.
      assert.equal(
        await page
          .locator('.editor-project-header')
          .evaluate((element) => element === document.activeElement),
        true,
        'focus should return to the header title once a recovered draft is opened',
      );
    },
  );
});

test('Editor start action reports an unreadable file and returns focus to the viewer', {
  timeout: 30000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-open-failure-');
  const bogus = path.join(temp, 'not-a-video.mp4');
  await writeFile(bogus, 'this is not a video container\n');
  await runElectronTest(
    { temp, userData, screenshotName: 'editor-open-failure-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, bogus);
      await addMediaToProject(page);
      // The failure is a toast now (owner): Astryx renders an
      // error toast as role="alert", alongside the viewport's own assertive
      // live region, so the visible card is the last of the two.
      const alert = page.getByRole('alert').last();
      await alert.waitFor();
      const message = (await alert.innerText()).trim();
      assert.ok(
        message.length > 0 && message.length < 120,
        `error text was not concise: ${message}`,
      );
      // MediaStage's own fallback grabs focus onto the empty viewer's drop
      // target instead of leaving it stranded on <body> after a failed add.
      assert.equal(
        await page.evaluate(() => document.activeElement === document.body),
        false,
        'focus must not be stranded on <body> after a failed open',
      );
      assert.equal(await page.locator('.viewers video').count(), 0);
    },
  );
});

test('Vietnamese IME composition commits diacritics in a cue text field', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-cue-ime-');
  const video = path.join(temp, 'cue-ime.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=4',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await runElectronTest(
    { temp, userData, screenshotName: 'editor-cue-ime-failure.png' },
    async ({ application, page }) => {
      await application.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, video);
      await addMediaToProject(page);
      await page.locator('.viewers video').waitFor();
      await addCue(page);
      const text = page.getByRole('textbox', { name: 'Text 1', exact: true });
      await text.waitFor();
      await composeText(page, text, 'Phụ đề tiếng Việt — Đà Nẵng');
      assert.equal(await text.inputValue(), 'Phụ đề tiếng Việt — Đà Nẵng');
    },
  );
});

test('cue rows are compact until selected, and clicking a row seeks the video', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-cue-compact-');
  const video = path.join(temp, 'cue-compact.mp4');
  const srt = path.join(temp, 'cue-compact.srt');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=6',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await writeFile(
    srt,
    [
      '1',
      '00:00:00,200 --> 00:00:01,500',
      'First cue',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,500',
      'Second cue, further along the timeline',
      '',
    ].join('\n'),
  );
  await runElectronTest(
    { temp, userData, screenshotName: 'editor-cue-compact-failure.png' },
    async ({ application, page }) => {
      await application.evaluate(
        ({ dialog }, files) => {
          const pending = [files.video, files.srt];
          dialog.showOpenDialog = async () => {
            const filename = pending.shift();
            return filename ? { canceled: false, filePaths: [filename] } : { canceled: true };
          };
        },
        { video, srt },
      );
      await addMediaToProject(page);
      await page.locator('.viewers video').waitFor();
      await openSourcePanel(page, 'media');
      await page.getByRole('button', { name: 'Add…', exact: true }).click();
      await openSourcePanel(page, 'cues');

      // Before any row is selected, cue text is a clamped preview — not an
      // editable field — and timing inputs are not shown at all (L5/D8).
      const secondRowPreview = page.getByRole('button', {
        name: 'Second cue, further along the timeline',
        exact: true,
      });
      await secondRowPreview.waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'Text 2', exact: true }).count(), 0);
      assert.equal(
        await page.getByRole('spinbutton', { name: 'Start (seconds) 2', exact: true }).count(),
        0,
      );

      // Clicking the compact row selects it, expands it into edit fields,
      // and seeks the video to that cue's start time.
      await secondRowPreview.click();
      const text2 = page.getByRole('textbox', { name: 'Text 2', exact: true });
      await text2.waitFor();
      assert.equal(await text2.inputValue(), 'Second cue, further along the timeline');
      await page.getByRole('spinbutton', { name: 'Start (seconds) 2', exact: true }).waitFor();
      const sourceVideo = page.locator('video[data-monitor-video="source"]');
      await sourceVideo.waitFor();
      await page.waitForFunction(() => {
        const element = document.querySelector('video[data-monitor-video="source"]');
        return element instanceof HTMLVideoElement && Math.abs(element.currentTime - 3) < 0.3;
      });

      // The first row goes back to its compact preview once it is no
      // longer selected — only one row is ever expanded at a time.
      assert.equal(await page.getByRole('textbox', { name: 'Text 1', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'First cue', exact: true }).waitFor();
    },
  );
});

test('Transcribe panel sets up speech recognition; no setup dialog, no cue-list menu', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-transcribe-panel-');
  const video = path.join(temp, 'transcribe-panel.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=4',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await runElectronTest({ temp, userData }, async ({ application, page }) => {
    await waitForEditorReady(page);
    await application.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, video);
    await addMediaToProject(page);
    await page.locator('.viewers video').waitFor();
    await openSourcePanel(page, 'cues');

    // One home per command (tickets 02–03): recognition, extraction and
    // translation left the cue list's menus, and subtitle import moved to
    // Project media, so no "Get subtitles" menu and no "Recognise
    // speech…"/"Extract on-screen text…"/"Translate…" items remain there.
    assert.equal(await page.getByRole('button', { name: 'Get subtitles', exact: true }).count(), 0);
    await page.locator('.cue-panel').waitFor();
    assert.equal(await page.getByRole('menuitem', { name: 'Recognise speech…' }).count(), 0);

    // The cue list shows its normal empty state until a run produces a draft;
    // the setup form is the Transcribe panel, opened from the rail.
    await page.getByRole('tab', { name: 'Transcribe', exact: true }).click();
    const panel = page.locator('#panel-transcribe');
    await panel.waitFor({ state: 'visible' });

    // No per-generator language picker any more (U15): the Transcript layer
    // has no declared language yet on this fresh video, so the one inline
    // "set language" control (LayerLanguageField, shared across every
    // generator) shows instead, writing straight to the layer.
    const speechSection = panel.getByLabel('Recognise speech', { exact: true });
    await speechSection
      .getByRole('combobox', { name: 'Set the Transcript layer language' })
      .waitFor();
    await speechSection.getByRole('combobox', { name: 'Recognition range' }).waitFor();
    // The second section is on-screen text extraction, in the same panel.
    const ocrSection = panel.getByLabel('Extract on-screen text', { exact: true });
    await ocrSection.getByRole('heading', { name: 'Extract on-screen text' }).waitFor();

    // This dev/CI machine has no local speech model configured: the panel
    // shows one status line plus a single "Set up…" control — never an inline
    // model-manifest picker duplicating Settings (§5.6 #34, §5.7 U14) — and
    // the Start action stays disabled. Nothing here is a Dialog.
    await speechSection.getByRole('button', { name: 'Set up…', exact: true }).waitFor();
    assert.equal(
      await speechSection
        .getByRole('button', { name: 'Recognize speech', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(await page.getByRole('dialog').count(), 0);

    // Collapsing the panel returns to the normal cue list, still without any
    // generator setup mounted in the cue column.
    await page.getByRole('tab', { name: 'Transcribe', exact: true }).click();
    await panel.waitFor({ state: 'detached' });
    await page.locator('.cue-panel').waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
});

// The notification centre (owner): one real failure is one toast and one row in the
// status bar's bell. Both locales, because the bell's accessible name carries the count.
for (const locale of ['en', 'vi']) {
  const copy =
    locale === 'vi'
      ? { bellUnread: 'Thông báo, 1 chưa đọc', title: 'Thông báo' }
      : { bellUnread: 'Notifications, 1 unread', title: 'Notifications' };
  test(`Editor failure raises a toast and one counted notification (${locale})`, {
    timeout: 60000,
  }, async () => {
    const { temp, userData } = await createTempWorkspace('reupmatic-notifications-');
    const bogus = path.join(temp, 'not-a-video.mp4');
    await writeFile(bogus, 'this is not a video container\n');
    await runElectronTest(
      { temp, userData, screenshotName: `notifications-${locale}-failure.png` },
      async ({ application, page }) => {
        await waitForEditorReady(page);
        await application.evaluate(({ dialog }, filename) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
        }, bogus);
        await chooseLocale(application, page, locale);
        await page.getByRole('button', { name: 'Editor', exact: true }).click();

        // One real failure: the toast and the list row come from the same raise.
        await addMediaToProject(page);
        await page.getByRole('alert').last().waitFor();
        const bell = notificationBell(page);
        await page.waitForFunction(
          ([selector, expected]) =>
            document.querySelector(selector)?.getAttribute('aria-label') === expected,
          ['.workspace-status-notifications button', copy.bellUnread],
        );
        assert.equal(await bell.getAttribute('aria-label'), copy.bellUnread);

        const panel = await openNotifications(page, copy.title);
        await panel.getByRole('listitem').first().waitFor();
        // Opening marks what the list shows read, so the count clears while the row stays.
        await page.waitForFunction(
          ([selector, expected]) =>
            document.querySelector(selector)?.getAttribute('aria-label') === expected,
          ['.workspace-status-notifications button', copy.title],
        );
        await page.keyboard.press('Escape');
        await panel.waitFor({ state: 'detached' });
        assert.equal(await page.locator('.viewers video').count(), 0);
      },
    );
  });
}

// The recovered-draft notification restores the discard safeguard the deleted popup owned: it
// announces at launch with Open and Discard, and Discard asks through the shared confirmation
// before removing the draft.
test('A recovered draft is announced with Open and Discard, and Discard confirms first', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-notifications-recovery-');
  await seedRecoveryDraft(userData, {
    id: 'recovery-notification-draft',
    sourcePath: '/Users/tester/bản demo cũ.mp4',
    sourceSha256: 'b'.repeat(64),
    cues: [{ id: 'cue1', start_ms: 0, end_ms: 500, text: 'Bản nháp cũ' }],
  });
  await runElectronTest(
    { temp, userData, screenshotName: 'notifications-recovery-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      await page.waitForFunction(
        ([selector, expected]) =>
          document.querySelector(selector)?.getAttribute('aria-label') === expected,
        ['.workspace-status-notifications button', 'Notifications, 1 unread'],
      );
      const panel = await openNotifications(page, 'Notifications');
      const row = panel.getByRole('listitem').filter({ hasText: 'bản demo cũ' });
      await row.waitFor();
      await row.getByRole('button', { name: 'Discard', exact: true }).click();
      const confirmation = page.getByRole('alertdialog');
      await confirmation.waitFor();
      await confirmation.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.waitForFunction(async () => {
        const reply = await window.reupmatic.recoveryList();
        return reply.ok === true && reply.data.length === 0;
      });
    },
  );
});
