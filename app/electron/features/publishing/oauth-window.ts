import { randomBytes } from 'node:crypto';
import { type BrowserWindow, BrowserWindow as ElectronBrowserWindow } from 'electron';
import { buildAuthorizationUrl, FACEBOOK_REDIRECT_URI, readAuthorizationCode } from './oauth.js';
import {
  buildAuthorizationUrl as buildTikTokAuthorizationUrl,
  createPkcePair,
  readAuthorizationCode as readTikTokAuthorizationCode,
} from './tiktok-oauth.js';

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

export interface AuthorizationWindowInput {
  startUrl: string;
  redirectUri: string;
  /** Validates the redirect URL and returns the authorization code; throws a named error. */
  parse(url: string): string;
}

// A throwaway session partition (never persist:douyin) so a platform login cannot touch the app's
// Douyin cookies, and the window is destroyed as soon as the registered redirect is seen.
export async function openAuthorizationWindow(
  parent: BrowserWindow | undefined,
  input: AuthorizationWindowInput,
): Promise<string> {
  const partition = `publish-oauth-${randomBytes(8).toString('hex')}`;
  const window = new ElectronBrowserWindow({
    ...(parent ? { parent } : {}),
    modal: true,
    width: 520,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
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
      if (!target.startsWith(input.redirectUri)) return false;
      try {
        const code = input.parse(target);
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
    window.loadURL(input.startUrl).catch((error) => settle(() => reject(error)));
  });
}

// Facebook's login dialog; a mismatched state or denied login is a hard stop.
export function openFacebookLogin(
  parent: BrowserWindow | undefined,
  input: { appId: string; oauthBaseUrl?: string },
): Promise<string> {
  const state = randomBytes(16).toString('hex');
  return openAuthorizationWindow(parent, {
    startUrl: buildAuthorizationUrl({
      appId: input.appId,
      state,
      oauthBaseUrl: input.oauthBaseUrl,
    }),
    redirectUri: FACEBOOK_REDIRECT_URI,
    parse: (url) => readAuthorizationCode(url, state),
  });
}

// TikTok's Login Kit uses PKCE; the verifier must travel to the broker with the code.
export async function openTikTokLogin(
  parent: BrowserWindow | undefined,
  input: { clientKey: string; redirectUri: string; authorizeBaseUrl?: string },
): Promise<{ code: string; codeVerifier: string }> {
  const state = randomBytes(16).toString('hex');
  const pkce = createPkcePair();
  const code = await openAuthorizationWindow(parent, {
    startUrl: buildTikTokAuthorizationUrl({
      clientKey: input.clientKey,
      state,
      redirectUri: input.redirectUri,
      codeChallenge: pkce.code_challenge,
      authorizeBaseUrl: input.authorizeBaseUrl,
    }),
    redirectUri: input.redirectUri,
    parse: (url) => readTikTokAuthorizationCode(url, state, input.redirectUri),
  });
  return { code, codeVerifier: pkce.code_verifier };
}
