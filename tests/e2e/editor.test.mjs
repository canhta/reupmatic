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

// Synthetic clicks hide window-drag swallowing; requires a no-drag ancestor.
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
        await page.locator('.viewers video').waitFor();
        await openSourcePanel(page, 'media');
        await page.getByRole('button', { name: 'Add…', exact: true }).click();
        await openSourcePanel(page, 'cues');
        const text = page.getByRole('textbox', { name: 'Text 1', exact: true });
        await text.waitFor();
        await text.fill('Cà phê Việt Nam — changed');
        await page.getByRole('spinbutton', { name: 'Start (seconds) 1', exact: true }).fill('0.5');
        await text.focus();
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
        await chooseLocale(application, page, locale);
        await page.getByRole('button', { name: 'Editor', exact: true }).click();
        const labels =
          locale === 'vi'
            ? {
                text: 'Nội dung 1',
                render: 'Đoạn mẫu',
                preview: 'Bản render',
                discard: 'Huỷ',
                fileMenu: 'Tệp',
                saveProject: 'Lưu dự án',
                openProject: 'Mở dự án…',
              }
            : {
                text: 'Text 1',
                render: 'Sample',
                preview: 'Rendered',
                discard: 'Discard',
                fileMenu: 'File',
                saveProject: 'Save Project',
                openProject: 'Open Project…',
              };
        assert.equal(
          await page.getByRole('textbox', { name: labels.text, exact: true }).inputValue(),
          'Cà phê Việt Nam — changed',
        );
        await clickMenuItem(application, labels.fileMenu, labels.saveProject);
        await page
          .getByText(locale === 'vi' ? 'Không có thay đổi chưa lưu' : 'No unsaved changes', {
            exact: true,
          })
          .waitFor();
        const saved = JSON.parse(await readFile(project, 'utf8'));
        assert.equal(saved.cues[0].text, 'Cà phê Việt Nam — changed');
        assert.equal(saved.cues[0].start_ms, 500);
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
        await clickMenuItem(application, labels.fileMenu, labels.openProject);
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: labels.discard, exact: true })
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
    const tablist = page.locator('.editor-tool-rail[role="tablist"]');
    assert.equal(await tablist.count(), 1);
    assert.equal(await tablist.getAttribute('aria-orientation'), 'vertical');
    assert.equal(await page.getByRole('tablist').count(), 2);

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

    await audio.focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(
        () => document.getElementById('panel-audio')?.contains(document.activeElement) ?? false,
      ),
      true,
    );

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

      const wideViewport = page.viewportSize();
      const wideContentBox = await content.boundingBox();
      assert.ok(
        wideContentBox &&
          wideContentBox.x >= 0 &&
          wideContentBox.x + wideContentBox.width <= wideViewport.width + 1,
        'the cue Content column must not be clipped at 1420x900',
      );
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
      const monitorRenderSample = page.getByRole('button', { name: 'Sample', exact: true });
      await monitorRenderSample.waitFor();
      assert.equal(await page.locator('video[data-monitor-video="preview"]').count(), 0);
      assert.equal(
        await page.getByRole('spinbutton', { name: 'Start (s)' }).count(),
        0,
        'the pre-sample empty state shows only the Render sample action, not the range inputs too',
      );
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

      const cleanUpTab = page.getByRole('tab', { name: 'Clean up', exact: true });
      await cleanUpTab.click();
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

      const cuePanel = page.locator('.cue-panel');
      await content.waitFor();
      assert.equal(await cuePanel.getByText('Layer', { exact: true }).isVisible(), true);
      assert.equal(await cuePanel.getByText('Copy from another layer').first().isVisible(), false);
      assert.equal(
        await cuePanel.getByText('Export subtitles', { exact: true }).first().isVisible(),
        false,
      );
      await cuePanel.getByPlaceholder('Search cues').waitFor();

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

      await page.setViewportSize({ width: 1050, height: 700 });
      await page.locator('#panel-style').waitFor({ state: 'visible' });
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
      const openRow = page.getByRole('menuitem', { name: /^video tự quay/ });
      await openRow.waitFor();
      await page.getByRole('menuitem', { name: /^bản demo cũ/ }).waitFor();
      await openRow.click();
      await page.locator('.viewers video').waitFor();
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
      const alert = page.getByRole('alert').last();
      await alert.waitFor();
      const message = (await alert.innerText()).trim();
      assert.ok(
        message.length > 0 && message.length < 120,
        `error text was not concise: ${message}`,
      );
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

    assert.equal(await page.getByRole('button', { name: 'Get subtitles', exact: true }).count(), 0);
    await page.locator('.cue-panel').waitFor();
    assert.equal(await page.getByRole('menuitem', { name: 'Recognise speech…' }).count(), 0);

    await page.getByRole('tab', { name: 'Transcribe', exact: true }).click();
    const panel = page.locator('#panel-transcribe');
    await panel.waitFor({ state: 'visible' });

    const speechSection = panel.getByLabel('Recognise speech', { exact: true });
    await speechSection
      .getByRole('combobox', { name: 'Set the Transcript layer language' })
      .waitFor();
    await speechSection.getByRole('combobox', { name: 'Recognition range' }).waitFor();
    const ocrSection = panel.getByLabel('Extract on-screen text', { exact: true });
    await ocrSection.getByRole('heading', { name: 'Extract on-screen text' }).waitFor();

    await speechSection.getByRole('button', { name: 'Set up…', exact: true }).waitFor();
    assert.equal(
      await speechSection
        .getByRole('button', { name: 'Recognize speech', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(await page.getByRole('dialog').count(), 0);

    await page.getByRole('tab', { name: 'Transcribe', exact: true }).click();
    await panel.waitFor({ state: 'detached' });
    await page.locator('.cue-panel').waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
});

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
      await confirmation.getByRole('button', { name: 'Discard', exact: true }).click();
      await page.waitForFunction(async () => {
        const reply = await window.reupmatic.recoveryList();
        return reply.ok === true && reply.data.length === 0;
      });
    },
  );
});
