import { BrowserWindow, screen } from 'electron';
import { type SourcesDiagnostics, sourcesDiagnostics } from './diagnostics.js';

const LOGIN_URL = 'https://www.douyin.com/';

function loginWindowSize(): { width: number; height: number } {
  const area = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(1100, Math.max(560, area.width - 80)),
    height: Math.min(860, Math.max(560, area.height - 80)),
  };
}

let current: { window: BrowserWindow; closed: Promise<void> } | undefined;

export interface DouyinLoginWindowOptions {
  /** Page to open; defaults to Douyin's home page. */
  url?: string;
  /** Close once a risk-control challenge is passed; for an already-connected re-check. */
  closeAfterChallenge?: boolean;
  isChallengePath?: (pathname: string) => boolean;
  diagnostics?: SourcesDiagnostics;
}

/** Opens the headed login window; no preload, and never logs URLs or console output. */
export function openDouyinLoginWindow(
  partition: string,
  options: DouyinLoginWindowOptions = {},
): Promise<void> {
  const diagnostics = options.diagnostics ?? sourcesDiagnostics(undefined);
  if (current && !current.window.isDestroyed()) {
    diagnostics.event('login-window.focus-existing');
    current.window.focus();
    return current.closed;
  }
  diagnostics.event('login-window.open', {
    closeAfterChallenge: options.closeAfterChallenge === true,
    path: (() => {
      try {
        return new URL(options.url ?? LOGIN_URL).pathname;
      } catch {
        return 'douyin.com';
      }
    })(),
  });
  const window = new BrowserWindow({
    title: 'Douyin',
    ...loginWindowSize(),
    minWidth: 560,
    minHeight: 560,
    center: true,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  // Keep challenge popups on the same sandboxed partition, not an unrestricted default window.
  window.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
    },
  }));
  if (options.closeAfterChallenge && options.isChallengePath) {
    const isChallengePath = options.isChallengePath;
    let sawChallenge = false;
    const onNavigated = (_event: unknown, url: string) => {
      let pathname: string;
      try {
        pathname = new URL(url).pathname;
      } catch {
        return;
      }
      if (isChallengePath(pathname)) {
        sawChallenge = true;
        diagnostics.event('login-window.challenge', { path: pathname }, { level: 'warn' });
        return;
      }
      if (sawChallenge && !window.isDestroyed()) {
        diagnostics.event('login-window.challenge-cleared');
        window.close();
      }
    };
    window.webContents.on('did-navigate', onNavigated);
    window.webContents.on('did-navigate-in-page', onNavigated);
  }
  void window.loadURL(options.url ?? LOGIN_URL);
  const closed = new Promise<void>((resolve) => {
    window.once('closed', () => {
      diagnostics.event('login-window.closed');
      if (current?.window === window) current = undefined;
      resolve();
    });
  });
  current = { window, closed };
  return closed;
}

export function closeDouyinLoginWindow(
  diagnostics: SourcesDiagnostics = sourcesDiagnostics(undefined),
): void {
  if (current && !current.window.isDestroyed()) {
    diagnostics.event('login-window.close-requested');
    current.window.destroy();
  }
}
