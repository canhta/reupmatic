import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { RecentEntry } from '../core/projects/recent.js';
import { menuMessages } from './runtime/messages.js';
import type { Language } from './runtime/workspace-lifecycle.js';

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
      // Custom undo/redo: the native roles would drive focused text fields, not the document history.
      {
        label: m.editUndo,
        accelerator: 'CmdOrCtrl+Z',
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
