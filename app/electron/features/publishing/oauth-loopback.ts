import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { publishError } from './publishing-error.js';

export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

const CLOSE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Reupmatic</title></head>
<body>Authorized. You can close this window and return to Reupmatic.</body></html>`;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function createState(): string {
  return randomBytes(24).toString('base64url');
}

export function buildAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  authorizationEndpoint?: string;
  scope?: string;
}): string {
  const url = new URL(options.authorizationEndpoint ?? GOOGLE_AUTHORIZATION_ENDPOINT);
  const params: Record<string, string> = {
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scope ?? YOUTUBE_UPLOAD_SCOPE,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
    state: options.state,
    access_type: 'offline',
    prompt: 'consent',
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

export interface LoopbackServer {
  redirectUri: string;
  waitForCode(): Promise<string>;
  close(): void;
}

/**
 * One-shot loopback redirect: binds 127.0.0.1 on an ephemeral port, validates `state`, answers the
 * browser, and closes after the single OAuth callback.
 */
export async function startLoopbackServer(expectedState: string): Promise<LoopbackServer> {
  let resolveCode: (code: string) => void = () => undefined;
  let rejectCode: (error: Error) => void = () => undefined;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const receivedState = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const authorizationCode = url.searchParams.get('code');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(CLOSE_HTML);
    if (receivedState === null && error === null && authorizationCode === null) return;
    server.close();
    server.closeAllConnections?.();
    if (receivedState !== expectedState || error !== null || authorizationCode === null) {
      rejectCode(publishError('CHANNEL_AUTHORIZE_FAILED'));
      return;
    }
    resolveCode(authorizationCode);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => reject(publishError('CHANNEL_AUTHORIZE_FAILED')));
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw publishError('CHANNEL_AUTHORIZE_FAILED');
  }
  return {
    redirectUri: `http://127.0.0.1:${address.port}`,
    waitForCode: () => code,
    close: () => {
      server.close();
      server.closeAllConnections?.();
    },
  };
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
}

interface TokenErrorPayload {
  error?: unknown;
}

function tokenFailure(status: number, body: string): Error {
  let reason: unknown;
  try {
    reason = (JSON.parse(body) as TokenErrorPayload).error;
  } catch {
    reason = undefined;
  }
  if (reason === 'invalid_grant') return publishError('CHANNEL_REAUTHORIZE');
  if (status === 401) return publishError('CHANNEL_REAUTHORIZE');
  return publishError('CHANNEL_AUTHORIZE_FAILED');
}

async function postToken(
  body: URLSearchParams,
  options: {
    tokenEndpoint?: string;
    fetchImpl?: typeof fetch;
    now?: number;
  },
): Promise<OAuthTokens> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(options.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw publishError('CHANNEL_AUTHORIZE_FAILED');
  }
  const text = await response.text();
  if (!response.ok) throw tokenFailure(response.status, text);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw publishError('CHANNEL_AUTHORIZE_FAILED');
  }
  if (typeof payload.access_token !== 'string' || !payload.access_token)
    throw publishError('CHANNEL_AUTHORIZE_FAILED');
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  return {
    access_token: payload.access_token,
    refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
    expires_at: (options.now ?? Date.now()) + expiresIn * 1000,
  };
}

export function exchangeAuthorizationCode(options: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
  tokenEndpoint?: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<OAuthTokens> {
  return postToken(
    new URLSearchParams({
      client_id: options.clientId,
      code: options.code,
      code_verifier: options.verifier,
      grant_type: 'authorization_code',
      redirect_uri: options.redirectUri,
    }),
    options,
  );
}

export function refreshAccessToken(options: {
  clientId: string;
  refreshToken: string;
  tokenEndpoint?: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<OAuthTokens> {
  return postToken(
    new URLSearchParams({
      client_id: options.clientId,
      refresh_token: options.refreshToken,
      grant_type: 'refresh_token',
    }),
    options,
  );
}
