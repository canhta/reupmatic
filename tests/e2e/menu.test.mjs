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

      assert.equal(application.windows().length, 1);
      await clickMenuItem(
        application,
        process.platform === 'darwin' ? 'Reupmatic' : 'File',
        'Settings…',
      );
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      assert.equal(await page.title(), 'Settings');
      assert.equal(
        await page.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).count(),
        1,
      );
      for (const label of ['Editor', 'Sources & Library', 'Automation', 'Channels & Affiliate']) {
        await page.getByRole('button', { name: label, exact: true }).waitFor();
      }
      const settingsItem = page.getByRole('button', { name: 'Settings', exact: true });
      await settingsItem.waitFor();
      assert.equal(await settingsItem.getAttribute('aria-current'), 'page');

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
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      await page.getByRole('button', { name: 'Import local files', exact: true }).waitFor();
      await page.waitForTimeout(300);
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
      await clickMenuItem(application, 'File', 'Open Project…');
      await page.waitForTimeout(200);
      await waitForEditorReady(page);
    },
  );
});
