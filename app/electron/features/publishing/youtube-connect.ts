import type { BrowserWindow } from 'electron';
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  exchangeAuthorizationCode,
  type OAuthTokens,
  startLoopbackServer,
} from './oauth-loopback.js';
import { openConsentWindow } from './oauth-window.js';
import { publishError } from './publishing-error.js';

const AUTHORIZE_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, error: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(error), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

/** Installed-app flow: one-shot loopback redirect + PKCE, consent shown in a sandboxed window. */
export async function connectYouTubeChannel(options: {
  window?: BrowserWindow;
  clientId: string;
  tokenEndpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<OAuthTokens> {
  const pkce = createPkcePair();
  const state = createState();
  const loopback = await startLoopbackServer(state);
  const closeWindow = openConsentWindow(
    buildAuthorizeUrl({
      clientId: options.clientId,
      redirectUri: loopback.redirectUri,
      challenge: pkce.challenge,
      state,
    }),
    options.window,
  );
  try {
    const code = await withTimeout(
      loopback.waitForCode(),
      AUTHORIZE_TIMEOUT_MS,
      publishError('CHANNEL_AUTHORIZE_TIMEOUT'),
    );
    return await exchangeAuthorizationCode({
      clientId: options.clientId,
      code,
      verifier: pkce.verifier,
      redirectUri: loopback.redirectUri,
      tokenEndpoint: options.tokenEndpoint,
      fetchImpl: options.fetchImpl,
    });
  } finally {
    closeWindow();
    loopback.close();
  }
}
