import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { RecentEntry } from '../core/projects/recent.js';
import { menuMessages } from './runtime/messages.js';
import type { Language } from './runtime/workspace-lifecycle.js';

// Native OS menu bar: a second, native path to commands that already exist as
// in-page buttons. Each item sends a
// command id (and, where the target lives in a specific peer area, that
// area) to the renderer over the existing typed IPC wire; the renderer's
// menuCommands registry (app/ui/shell/menuCommands.ts) dispatches it to the
// exact same handler the matching in-page button already calls. This module
// owns only menu construction, never business logic or IPC business
// handlers — those stay in app/electron/features/*.
export function buildApplicationMenu(
  win: BrowserWindow,
  language: Language,
  recent: readonly RecentEntry[] = [],
) {
  const isMac = process.platform === 'darwin';
  const m = menuMessages(language);

  function send(command: string, area?: string, data?: unknown) {
    if (win.isDestroyed()) return;
    win.webContents.send('reupmatic:menu-command', { command, area, data });
  }

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about', label: m.appAbout },
            { type: 'separator' },
            {
              label: m.appSettings,
              accelerator: 'Cmd+,',
              // D-57: Settings is a sidebar destination in the main window now, not a second
              // window — send() like every other peer-area menu item instead of an out-of-band
              // openSettings() call.
              click: () => send('app.openSettings', 'settings'),
            },
            { type: 'separator' },
            { role: 'services', label: app.name, submenu: [] },
            { type: 'separator' },
            { role: 'hide', label: m.appHide },
            { role: 'hideOthers', label: m.appHideOthers },
            { role: 'unhide', label: m.appUnhide },
            { type: 'separator' },
            { role: 'quit', label: m.appQuit },
          ],
        },
      ]
    : [];

  const fileMenu: MenuItemConstructorOptions = {
    label: m.file,
    submenu: [
      {
        label: m.fileNewProject,
        accelerator: 'CmdOrCtrl+N',
        click: () => send('editor.newProject', 'editor'),
      },
      {
        label: m.fileOpenProject,
        accelerator: 'CmdOrCtrl+Shift+O',
        click: () => send('editor.openProject', 'editor'),
      },
      {
        label: m.fileOpenRecent,
        // Projects only, matching the header switcher (D-63): a plain video is
        // never opened here. Recovered drafts stay switcher-only
        // (EditorProjectHeader.tsx) — the recovery store isn't reachable from
        // here without a second cross-module fetch this menu doesn't otherwise
        // need.
        submenu: (() => {
          const projects = recent.filter((entry) => entry.kind === 'project');
          return projects.length === 0
            ? [{ label: m.fileOpenRecentEmpty, enabled: false }]
            : projects.map((entry) => ({
                label: entry.name,
                click: () => send('editor.openRecentItem', 'editor', entry),
              }));
        })(),
      },
      {
        label: m.fileImportMedia,
        click: () => send('editor.importMedia', 'editor'),
      },
      { type: 'separator' },
      {
        label: m.fileSaveProject,
        accelerator: 'CmdOrCtrl+S',
        click: () => send('editor.saveProject', 'editor'),
      },
      {
        label: m.fileSaveProjectAs,
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => send('editor.saveProjectAs', 'editor'),
      },
      { type: 'separator' },
      {
        label: m.fileExport,
        accelerator: 'CmdOrCtrl+E',
        click: () => send('editor.export', 'editor'),
      },
      {
        label: m.fileExportSubtitles,
        click: () => send('editor.exportSubtitles', 'editor'),
      },
      ...(isMac
        ? []
        : ([
            { type: 'separator' },
            {
              label: m.fileSettings,
              accelerator: 'Ctrl+,',
              click: () => send('app.openSettings', 'settings'),
            },
            { type: 'separator' },
            { role: 'quit', label: m.fileQuit },
          ] satisfies MenuItemConstructorOptions[])),
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: m.edit,
    submenu: [
      // Custom items, not `role: 'undo'/'redo'`: the native role drives
      // whatever text field has OS focus, a second undo stack under the
      // same name as the Editor's own document history. One history —
      // cues, style and clips together — reached the same way everywhere
      // the app is focused.
      {
        label: m.editUndo,
        accelerator: 'CmdOrCtrl+Z',
        // No `area`: the document history is registered for the app's whole
        // lifetime (EditorContext.tsx), not gated behind switching area.
        click: () => send('editor.undo'),
      },
      {
        label: m.editRedo,
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => send('editor.redo'),
      },
      { type: 'separator' },
      { role: 'cut', label: m.editCut },
      { role: 'copy', label: m.editCopy },
      { role: 'paste', label: m.editPaste },
      { role: 'selectAll', label: m.editSelectAll },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: m.view,
    submenu: [
      { role: 'reload', label: m.viewReload },
      { type: 'separator' },
      { role: 'resetZoom', label: m.viewResetZoom },
      { role: 'zoomIn', label: m.viewZoomIn },
      { role: 'zoomOut', label: m.viewZoomOut },
      { type: 'separator' },
      { role: 'togglefullscreen', label: m.viewToggleFullScreen },
    ],
  };

  const editorMenu: MenuItemConstructorOptions = {
    label: m.editorMenu,
    submenu: [
      // Export… moved to File (HIG groups document output there) — ⌘E now
      // lives on File > Export… instead of duplicating it here.
      {
        label: m.editorOpenJobs,
        accelerator: 'CmdOrCtrl+J',
        click: () => send('app.openJobs'),
      },
    ],
  };

  const sourcesMenu: MenuItemConstructorOptions = {
    label: m.sources,
    submenu: [
      {
        label: m.sourcesImportLocalFile,
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => send('sources.importLocalFile', 'sources'),
      },
    ],
  };

  const automationMenu: MenuItemConstructorOptions = {
    label: m.automation,
    submenu: [
      {
        label: m.automationNewWorkflow,
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => send('automation.newWorkflow', 'automation'),
      },
      {
        label: m.automationViewRunHistory,
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => send('automation.viewRunHistory', 'automation'),
      },
    ],
  };

  const channelsMenu: MenuItemConstructorOptions = {
    label: m.channels,
    submenu: [
      {
        label: m.channelsNewPost,
        accelerator: 'CmdOrCtrl+Shift+P',
        click: () => {
          send('channels.gotoPosts', 'channels');
          send('channels.newPost');
        },
      },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = { role: 'windowMenu', label: m.windowMenu };

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    label: m.help,
    submenu: isMac ? [] : [{ role: 'about', label: m.helpAbout }],
  };

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    fileMenu,
    editMenu,
    viewMenu,
    editorMenu,
    sourcesMenu,
    automationMenu,
    channelsMenu,
    windowMenu,
    helpMenu,
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
