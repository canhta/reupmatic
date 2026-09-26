import { randomBytes } from 'node:crypto';
import { type BrowserWindow, BrowserWindow as ElectronBrowserWindow } from 'electron';
import { buildAuthorizationUrl, FACEBOOK_REDIRECT_URI, readAuthorizationCode } from './oauth.js';

/** Opens a provider consent page in a throwaway sandboxed session; returns a close function. */
export function openConsentWindow(url: string, parent?: BrowserWindow): () => void {
  const partition = `publish-consent-${randomBytes(8).toString('hex')}`;
  const window = new ElectronBrowserWindow({
    ...(parent ? { parent } : {}),
    modal: true,
    width: 520,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  void window.loadURL(url);
  return () => {
    if (!window.isDestroyed()) window.destroy();
  };
}

// A throwaway session partition (never persist:douyin) so a Facebook login cannot touch the
// app's Douyin cookies, and the window is destroyed as soon as the redirect is seen.
export async function openFacebookLogin(
  parent: BrowserWindow | undefined,
  input: { appId: string; oauthBaseUrl?: string },
): Promise<string> {
  const state = randomBytes(16).toString('hex');
  const partition = `publish-facebook-${randomBytes(8).toString('hex')}`;
  const window = new ElectronBrowserWindow({
    ...(parent ? { parent } : {}),
    modal: true,
    width: 520,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const startUrl = buildAuthorizationUrl({
    appId: input.appId,
    state,
    oauthBaseUrl: input.oauthBaseUrl,
  });
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (!window.isDestroyed()) window.destroy();
      action();
    };
    const inspect = (target: string): boolean => {
      if (!target.startsWith(FACEBOOK_REDIRECT_URI)) return false;
      try {
        const code = readAuthorizationCode(target, state);
        settle(() => resolve(code));
      } catch (error) {
        settle(() => reject(error));
      }
      return true;
    };
    window.webContents.on('will-redirect', (event, target) => {
      if (inspect(target)) event.preventDefault();
    });
    window.webContents.on('did-navigate', (_event, target) => {
      inspect(target);
    });
    window.on('closed', () => settle(() => reject(new Error('CHANNEL_AUTHORIZE_CANCELLED'))));
    window.loadURL(startUrl).catch((error) => settle(() => reject(error)));
  });
}
