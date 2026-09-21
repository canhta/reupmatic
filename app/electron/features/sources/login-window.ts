import { BrowserWindow, screen } from 'electron';
import { type SourcesDiagnostics, sourcesDiagnostics } from './diagnostics.js';

const LOGIN_URL = 'https://www.douyin.com/';

/**
 * A comfortable desktop frame for Douyin's own site, capped to the primary display's work area so
 * the window never opens taller or wider than the screen it lands on (subtracting a gutter for the
 * menu bar/dock). The previous fixed 480px frame rendered the desktop page as a cramped phone
 * column. The window stays resizable, so this is a starting size, not a constraint.
 */
function loginWindowSize(): { width: number; height: number } {
  const area = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(1100, Math.max(560, area.width - 80)),
    height: Math.min(860, Math.max(560, area.height - 80)),
  };
}

let current: { window: BrowserWindow; closed: Promise<void> } | undefined;

export interface DouyinLoginWindowOptions {
  /**
   * The page to open. Defaults to Douyin's home page; a verification re-check passes the exact
   * page that was challenged, so the user solves the challenge where the interrupted request
   * will run rather than on an unrelated page.
   */
  url?: string;
  /**
   * Close the window once it has passed through a risk-control challenge and navigated away from
   * it — the signal that the user solved it. Used for a verification re-check of an already
   * connected session, which the cookie watcher cannot signal (it is already connected), so
   * without this the window would only ever close by hand. The caller supplies the matcher so
   * this module carries no core vocabulary of its own.
   */
  closeAfterChallenge?: boolean;
  isChallengePath?: (pathname: string) => boolean;
  /** D-61: the Diagnostic log sink; the headed window's lifecycle events become records. */
  diagnostics?: SourcesDiagnostics;
}

/**
 * Opens the one headed Douyin login window on `partition`, or focuses it if already open, and
 * resolves once the user closes it. This window never receives
 * our preload/contextBridge — it renders a real, untrusted third-party page the user logs into
 * personally; nothing here reads, fills or submits credentials, and nothing here logs the page's
 * console output or navigated URLs (a login/verification redirect can carry a token in its query
 * string).
 *
 * A concurrent call while one is already open shares the same window and the same resolution
 * rather than opening a second one — Reconnect calls this identically to Connect; the same
 * headed flow against the same partition "replaces the stored state cleanly" simply because it
 * is the same page checking (and, if needed, refreshing) the same cookies.
 */
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
  // A verification challenge sometimes opens a second window (e.g. a QR/phone confirmation
  // popup); keep it on the same trusted, sandboxed partition instead of letting `window.open`
  // spawn an unrestricted default window.
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
      // Back on the app after the challenge: the user solved it, hand control back.
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

/** Closes the login window without waiting for the user — called on app quit. */
export function closeDouyinLoginWindow(
  diagnostics: SourcesDiagnostics = sourcesDiagnostics(undefined),
): void {
  if (current && !current.window.isDestroyed()) {
    diagnostics.event('login-window.close-requested');
    current.window.destroy();
  }
}
