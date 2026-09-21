// SOURCE-ONLY until installed Electron/Playwright dependencies pass this gate.
// Renderer and IPC are real; verifies ticket 09's cross-workspace acceptance:
// switching areas and locale never starts, stops or resets in-progress work.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import {
  addMediaToProject,
  chooseLocale,
  openSettingsArea,
  waitForEditorReady,
} from './ui-actions.mjs';

// main.ts opens the window with titleBarStyle 'hiddenInset' and
// trafficLightPosition {x: 14, y: 17}: the traffic-light cluster is native
// chrome, not DOM, so tests check the reserved region instead of the dots
// themselves. .astryx-app-shell-header (workspace.css) reserves a 48px-tall
// band (the shell's ONE unified toolbar: brand, toggle, area title and
// contextual actions) and 80px of left padding for it.
const TRAFFIC_LIGHT_BAND_HEIGHT = 48;
const TRAFFIC_LIGHT_SAFE_LEFT = 80;

/** True when a boundingBox neither sits under nor beside the traffic lights. */
function clearsTrafficLights(box) {
  return box.y >= TRAFFIC_LIGHT_BAND_HEIGHT || box.x >= TRAFFIC_LIGHT_SAFE_LEFT;
}

/** True when two boundingBoxes vertically overlap, i.e. they sit in one row. */
function shareOneRow(a, b) {
  return a.y < b.y + b.height && b.y < a.y + a.height;
}

test('Editor start state has no start screen: one hint, a drop target, no buttons', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-editor-start-');
  await runElectronTest(
    { temp, userData, screenshotName: 'editor-start-failure.png' },
    async ({ page }) => {
      // Study §5.9: the app opens straight into the full layout, empty
      // regions, no popup. The header project dropdown + File menu are the one
      // home for opening a project; media enters through Project media Add… /
      // File > Import Media… / dropping a file (D-63) — never a second pair of
      // buttons in the empty viewer.
      await waitForEditorReady(page);

      // Owner requirement: the full region frame renders even
      // when empty — no separate centered start card any more. The viewer
      // region's own empty state is a hint plus a drop target.
      const start = page.locator('.editor-start-frame');
      await start.getByText('Drop a video here', { exact: true }).waitFor();
      assert.equal(await start.getByRole('button').count(), 0, 'the empty viewer has no buttons');
      for (const selector of [
        '.editor-source-region',
        '.editor-viewer-region',
        '.editor-tool-rail',
        '.editor-timeline-region',
      ]) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, `${selector} must render at launch`);
      }

      // The header title is the project (D-63): its dropdown opens or creates
      // a project and never opens a video or file.
      await page.locator('.editor-project-header button[aria-haspopup="menu"]').click();
      await page.getByRole('menuitem', { name: 'New project', exact: true }).waitFor();
      await page.getByRole('menuitem', { name: 'Open project…', exact: true }).waitFor();
      assert.deepEqual(
        (await page.getByRole('menuitem').allTextContents()).map((text) => text.trim()).sort(),
        ['New project', 'Open project…'].sort(),
        'the project dropdown lists project commands only',
      );
      await page.keyboard.press('Escape');

      // The monitor header itself ("Preview", Source/Rendered) is part of
      // the always-present frame now (owner requirement), disabled rather
      // than absent — only the recovery/profile empty-state chrome is gone.
      assert.equal(await page.getByText(/recovered draft/i).count(), 0);
      // ProfileManager (behind the header's "Manage profiles…") lives in an
      // Astryx Dialog, which stays mounted-but-closed rather than
      // unmounting — check for an open dialog, not text presence.
      assert.equal(await page.getByRole('dialog').count(), 0);
    },
  );
});

test('desktop shell keeps navigation legible, collapsible and globally status-aware', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-shell-');
  await runElectronTest(
    { temp, userData, screenshotName: 'desktop-shell-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);

      const navigation = page.getByRole('navigation', { name: 'Application areas' });
      const expanded = await navigation.boundingBox();
      assert.ok(expanded && expanded.width >= 180, 'primary area labels need an expanded sidebar');
      assert.equal(
        await navigation.evaluate((element) => element.scrollWidth === element.clientWidth),
        true,
        'expanded navigation must not create its own horizontal scrollbar',
      );
      for (const label of ['Editor', 'Sources & Library', 'Automation', 'Channels & Affiliate']) {
        await page.getByRole('button', { name: label, exact: true }).waitFor();
      }

      // Header band, expanded: traffic lights, then the brand, then the toggle
      // — left to right, all above the sidebar/content split (workspace.css).
      const brandBox = await page.getByText('Reupmatic', { exact: true }).boundingBox();
      assert.ok(brandBox, 'the brand renders in the shared title band');
      assert.ok(
        brandBox.y < TRAFFIC_LIGHT_BAND_HEIGHT,
        'the brand sits in the top window band, not stacked below the traffic lights',
      );
      assert.ok(brandBox.x >= TRAFFIC_LIGHT_SAFE_LEFT, 'the brand must clear the traffic lights');

      let toggleBox = await page
        .getByRole('button', { name: 'Collapse navigation', exact: true })
        .boundingBox();
      assert.ok(toggleBox, 'the collapse toggle renders in the header, not the sidebar footer');
      assert.ok(
        toggleBox.y < TRAFFIC_LIGHT_BAND_HEIGHT,
        'the toggle lives in the same top band as the brand and traffic lights',
      );
      assert.ok(
        toggleBox.x > brandBox.x + brandBox.width,
        'the toggle sits after the app name, reading left to right',
      );

      // The current area's title lives in this SAME band, not a second
      // .workspace-commandbar row stacked underneath it: exactly one
      // toolbar band above the content, per the shell recomposition. In the
      // Editor area that title slot is the document-title source switcher
      // (study §5.8), not a plain "Editor" heading.
      const editorTitleBox = await page.locator('.editor-project-header').boundingBox();
      assert.ok(editorTitleBox, 'the area title renders in the shared toolbar band');
      assert.ok(
        editorTitleBox.y < TRAFFIC_LIGHT_BAND_HEIGHT,
        'the area title lives in the top toolbar band, not a second row below it',
      );
      assert.ok(
        shareOneRow(editorTitleBox, toggleBox),
        'the area title and the collapse toggle share one toolbar row',
      );

      const editorItemBox = await page
        .getByRole('button', { name: 'Editor', exact: true })
        .boundingBox();
      assert.ok(
        clearsTrafficLights(editorItemBox),
        'the first nav item must start below the shared header band, clear of the traffic lights',
      );

      assert.equal(
        await page.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).count(),
        0,
        'UI locale belongs in Settings, not every workspace toolbar',
      );
      await page.getByText('Local processing', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Batch & jobs', exact: true }).waitFor();

      await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
      const collapsed = await navigation.boundingBox();
      assert.ok(
        collapsed && collapsed.width <= 64,
        'collapsed navigation should reclaim workspace',
      );

      // Collapsed: the brand hides, but the toggle stays in the header band,
      // reachable and correctly labelled, and the rail's own content still
      // starts clear of the traffic lights.
      assert.equal(await page.getByText('Reupmatic', { exact: true }).count(), 0);
      toggleBox = await page
        .getByRole('button', { name: 'Expand navigation', exact: true })
        .boundingBox();
      assert.ok(toggleBox, 'the toggle stays visible and reachable once the rail collapses');
      assert.ok(
        toggleBox.y < TRAFFIC_LIGHT_BAND_HEIGHT,
        'the collapsed toggle still lives in the top header band',
      );

      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      const collapsedHeading = page.getByRole('heading', {
        name: 'Sources & Library',
        exact: true,
      });
      await collapsedHeading.waitFor();
      const collapsedHeadingBox = await collapsedHeading.boundingBox();
      assert.ok(
        clearsTrafficLights(collapsedHeadingBox),
        'the area title must not render under or beside the traffic lights while collapsed',
      );
      assert.ok(
        shareOneRow(collapsedHeadingBox, toggleBox),
        'the area title and the collapse toggle still share one toolbar row while collapsed',
      );
      assert.ok(
        clearsTrafficLights(
          await page.getByRole('button', { name: 'Editor', exact: true }).boundingBox(),
        ),
        'the collapsed rail must not start so far left that the traffic lights sit over it',
      );

      // D-57 (supersedes D-47): Settings is the sidebar's own bottom-anchored footer item now
      // (D-46) — reachable collapsed, same as the rest of the rail — not a separate window, so
      // opening it must still not scroll the main nav rail's own item list out of view.
      const settings = await openSettingsArea(page);
      assert.equal(
        await page.locator('.astryx-app-shell-sidenav').evaluate((element) => element.scrollTop),
        0,
        'opening Settings from the collapsed rail must not scroll the nav item list out of view',
      );
      assert.equal(
        await settings.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).count(),
        1,
      );
      await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
      const restored = await navigation.boundingBox();
      assert.ok(restored && restored.width >= 180);

      // Re-check the safe area at the app's minimum supported width, where
      // the traffic-light clearance has the least room to spare.
      await application.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1050, 700);
      });
      await page.waitForFunction(() => window.innerWidth === 1050);
      assert.ok(
        clearsTrafficLights(await page.getByText('Reupmatic', { exact: true }).boundingBox()),
        'the brand must clear the traffic lights at the minimum window width too',
      );
      assert.ok(
        clearsTrafficLights(
          await page.getByRole('button', { name: 'Editor', exact: true }).boundingBox(),
        ),
        'nav items must clear the traffic lights at the minimum window width too',
      );
    },
  );
});

test('Electron navigation and locale changes preserve Editor content and selection', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-nav-');
  const video = path.join(temp, 'nav-clip.mp4');
  const srt = path.join(temp, 'nav.srt');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await writeFile(srt, '1\n00:00:00,200 --> 00:00:01,800\nGiữ nguyên khi chuyển màn hình\n');
  await runElectronTest(
    { temp, userData, screenshotName: 'navigation-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await application.evaluate(
        ({ dialog }, files) => {
          const pending = [files.video, files.srt];
          dialog.showOpenDialog = async () => {
            const filename = pending.shift();
            return { canceled: false, filePaths: [filename] };
          };
        },
        { video, srt },
      );
      await addMediaToProject(page);
      await page.locator('.viewers video').waitFor();
      // Subtitle import lives in the Media panel now; recognition, extraction
      // and translation live in the tool panels.
      await addMediaToProject(page);
      const text = page.getByRole('textbox', { name: 'Text 1', exact: true });
      await text.waitFor();
      await text.fill('Edited before navigating away');
      await page.getByRole('spinbutton', { name: 'Start (seconds) 1', exact: true }).fill('0.5');
      // The header's Save button is the saved state now (owner);
      // the dirty state itself is the editor's own live-region status.
      await page
        .locator('.editor-feedback')
        .getByText('Unsaved changes', { exact: true })
        .waitFor();

      // Switch through every other area, then come back. UI language is an application
      // preference and lives in the Settings sidebar destination (D-57) — chooseLocale below
      // navigates there and back.
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      await page.getByRole('button', { name: 'Automation', exact: true }).click();

      // Switching locale while away from the Editor must not touch its state either.
      await chooseLocale(application, page, 'vi');
      await page.getByRole('button', { name: 'Kênh & Affiliate', exact: true }).click();

      await page.getByRole('button', { name: 'Editor', exact: true }).click();
      await page.getByRole('textbox', { name: 'Nội dung 1', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('textbox', { name: 'Nội dung 1', exact: true }).inputValue(),
        'Edited before navigating away',
      );
      assert.equal(
        await page.getByRole('spinbutton', { name: 'Bắt đầu (giây) 1', exact: true }).inputValue(),
        '0.5',
      );
      await page
        .locator('.editor-feedback')
        .getByText('Có thay đổi chưa lưu', { exact: true })
        .waitFor();
    },
  );
});
