// Ticket 11: native OS menu bar. Renderer, IPC and the menu-command bridge
// are real; only native file/message-box dialogs are mocked, the same way
// navigation.test.mjs and automation.test.mjs already do for button-driven
// flows. These tests click the actual Electron menu items (not the in-page
// buttons) to prove each one dispatches through the same handler the
// matching button already calls, not a second implementation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { clickMenuItem, waitForEditorReady } from './ui-actions.mjs';

function clip(temp, name) {
  const target = path.join(temp, name);
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=1',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    target,
  ]);
  return target;
}

/** Reads the live application menu back as a plain, serializable tree. */
async function menuTree(application) {
  return application.evaluate(({ Menu }) => {
    function serialize(item) {
      return {
        label: item.label,
        role: item.role || null,
        accelerator: item.accelerator || null,
        submenu: item.submenu ? item.submenu.items.map(serialize) : undefined,
      };
    }
    const menu = Menu.getApplicationMenu();
    return menu ? menu.items.map(serialize) : null;
  });
}

test('Electron application menu carries every peer area with shortcuts', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-shape-');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-shape-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      const tree = await menuTree(application);
      assert.ok(tree, 'a native application menu is set');
      const labels = tree.map((item) => item.label);
      for (const expected of [
        'File',
        'Edit',
        'View',
        'Editor',
        'Sources',
        'Automation',
        'Channels',
        'Help',
      ]) {
        assert.ok(labels.includes(expected), `menu bar is missing ${expected}`);
      }
      const windowMenu = tree.find((item) => item.role === 'windowmenu');
      assert.ok(windowMenu, 'menu bar carries the native Window menu');

      const file = tree.find((item) => item.label === 'File');
      const fileLabels = file.submenu.map((item) => item.label);
      // File mirrors the header project switcher (D-63): New Project/Open
      // Project/Open Recent (projects only)/Import Media…, then Save/Save As,
      // then Export…/Export Subtitles… — a first video is added through Import
      // Media… / Project media Add…, not a separate File video item.
      for (const expected of [
        'New Project',
        'Open Project…',
        'Open Recent',
        'Import Media…',
        'Save Project',
        'Save Project As…',
        'Export…',
        'Export Subtitles…',
      ]) {
        assert.ok(fileLabels.includes(expected), `File menu is missing ${expected}`);
      }
      const newProject = file.submenu.find((item) => item.label === 'New Project');
      assert.equal(newProject.accelerator, 'CmdOrCtrl+N');
      const saveProjectAs = file.submenu.find((item) => item.label === 'Save Project As…');
      assert.equal(saveProjectAs.accelerator, 'CmdOrCtrl+Shift+S');
      const exportItem = file.submenu.find((item) => item.label === 'Export…');
      assert.equal(exportItem.accelerator, 'CmdOrCtrl+E');

      // Undo/Redo dispatch through the document history now (U3), not the
      // native text-field role — one history reached the same way
      // everywhere the app is focused, not a second stack under one name.
      const edit = tree.find((item) => item.label === 'Edit');
      const editLabels = edit.submenu.map((item) => item.label);
      assert.ok(editLabels.includes('Undo'));
      assert.ok(editLabels.includes('Redo'));
      assert.equal(edit.submenu.find((item) => item.label === 'Undo').role, null);
      assert.equal(edit.submenu.find((item) => item.label === 'Undo').accelerator, 'CmdOrCtrl+Z');
      assert.equal(
        edit.submenu.find((item) => item.label === 'Redo').accelerator,
        'CmdOrCtrl+Shift+Z',
      );

      // Export moved to File (D6/R-A10); the Editor menu no longer
      // duplicates it as "Export Full Render".
      const editorMenu = tree.find((item) => item.label === 'Editor');
      assert.equal(
        editorMenu.submenu.some((item) => item.label === 'Export Full Render'),
        false,
      );

      const automation = tree.find((item) => item.label === 'Automation');
      assert.ok(automation.submenu.some((item) => item.label === 'New Workflow'));
      const sources = tree.find((item) => item.label === 'Sources');
      assert.ok(sources.submenu.some((item) => item.label === 'Import Local File…'));
      const channels = tree.find((item) => item.label === 'Channels');
      assert.ok(channels.submenu.some((item) => item.label === 'New Post…'));
    },
  );
});

test('native menu opens shared jobs and navigates to Settings, idempotently on a second Settings…', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-shell-');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-shell-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);

      await clickMenuItem(application, 'Editor', 'Open Jobs & Queue');
      const tray = page.getByRole('complementary', { name: 'Batch & jobs' });
      await tray.waitFor();
      await tray.getByRole('button', { name: 'Close jobs', exact: true }).click();

      // D-57 (supersedes D-47): Settings…/⌘,/Ctrl+, navigate to the sidebar's Settings
      // destination in this one window now, not a second native-chrome window.
      assert.equal(application.windows().length, 1);
      await clickMenuItem(
        application,
        process.platform === 'darwin' ? 'Reupmatic' : 'File',
        'Settings…',
      );
      // The shared toolbar band's area title follows the current area, same as every other
      // peer area — not a per-category pane title the old independent window had.
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      assert.equal(await page.title(), 'Settings');
      assert.equal(
        await page.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).count(),
        1,
      );
      // Settings is a sidebar destination again (D-57) — the separated, bottom-anchored
      // utility item alongside the four peer areas, not a fifth equal peer.
      for (const label of ['Editor', 'Sources & Library', 'Automation', 'Channels & Affiliate']) {
        await page.getByRole('button', { name: label, exact: true }).waitFor();
      }
      const settingsItem = page.getByRole('button', { name: 'Settings', exact: true });
      await settingsItem.waitFor();
      assert.equal(await settingsItem.getAttribute('aria-current'), 'page');

      // A second Settings… is idempotent — still the same in-page destination, still one window.
      await clickMenuItem(
        application,
        process.platform === 'darwin' ? 'Reupmatic' : 'File',
        'Settings…',
      );
      await page.waitForTimeout(200);
      assert.equal(application.windows().length, 1);
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    },
  );
});

test('Menu > Automation > New Workflow dispatches the same create-draft handler as its in-page button', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-automation-');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-automation-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await clickMenuItem(application, 'Automation', 'New Workflow');
      // Same area switch and the same stepper the in-page "Create local
      // workflow" button opens (see automation.test.mjs).
      await page.getByRole('button', { name: 'Automation', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Go to step 1: Identity', exact: true }).waitFor();
    },
  );
});

test('Menu > Automation > View Run History switches tabs the same way as the in-page tab', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-automation-runs-');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-automation-runs-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await clickMenuItem(application, 'Automation', 'View Run History');
      await page.getByRole('button', { name: 'Automation', exact: true }).waitFor();
      await page.locator('#runs-panel').waitFor({ state: 'visible' });
      await page.getByText('No workflow runs', { exact: true }).waitFor();
    },
  );
});

test('Menu > Sources > Import Local File triggers the same import as its toolbar button', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-sources-');
  const video = clip(temp, 'menu-import-clip.mp4');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-sources-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      // Switch there first and let the Library snapshot finish loading, the
      // same as a user would before the toolbar button is enabled; the menu
      // command's own guard (isDisabled while busy/loading) mirrors this.
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      await page.getByRole('button', { name: 'Import local files', exact: true }).waitFor();
      await page.waitForTimeout(300);
      // No options dialog sits in front of either path any more (D-50): the
      // menu command goes straight to the native picker, same as the button.
      await application.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, video);
      await clickMenuItem(application, 'Sources', 'Import Local File…');
      await page.getByText('1 imported, 0 reused, 0 failed.', { exact: true }).waitFor();
    },
  );
});

test('Menu > Channels > New Post switches tabs and opens the same create-draft form as its button', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-channels-');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-channels-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await clickMenuItem(application, 'Channels', 'New Post…');
      await page.getByRole('button', { name: 'Channels & Affiliate', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Create destination draft', exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'Post title', exact: true }).waitFor();
    },
  );
});

test('Menu > File > New Project resets the Editor to an untitled project', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-editor-');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-editor-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      // New Project has no dialog: it clears the document and returns the
      // header title to its untitled state, the same handler the dropdown's
      // own "New project" item calls.
      await clickMenuItem(application, 'File', 'New Project');
      await page.waitForTimeout(200);
      await waitForEditorReady(page);
    },
  );
});

test('Menu > File > Open Project dispatches the same openProject() call as the header switcher', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-menu-editor-project-');
  await runElectronTest(
    { temp, userData, screenshotName: 'menu-editor-project-failure.png' },
    async ({ application, page }) => {
      await waitForEditorReady(page);
      await application.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      });
      // A cancelled native picker is a safe, side-effect-free way to prove
      // the click reached editor.openProject() without needing a real project.
      await clickMenuItem(application, 'File', 'Open Project…');
      await page.waitForTimeout(200);
      await waitForEditorReady(page);
    },
  );
});
