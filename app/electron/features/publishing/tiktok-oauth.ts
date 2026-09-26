import { createHash, randomBytes } from 'node:crypto';

export const TIKTOK_AUTHORIZE_BASE_URL = 'https://www.tiktok.com';
export const TIKTOK_AUTHORIZE_PATH = '/v2/auth/authorize/';
export const TIKTOK_API_BASE_URL = 'https://open.tiktokapis.com';
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish'] as const;

export interface TikTokTokenPayload {
  access_token: string;
  refresh_token: string;
  open_id: string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface PkcePair {
  code_verifier: string;
  code_challenge: string;
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 7636 S256; the verifier is 43–128 unreserved characters.
export function createPkcePair(): PkcePair {
  const code_verifier = base64url(randomBytes(48));
  const code_challenge = base64url(createHash('sha256').update(code_verifier).digest());
  return { code_verifier, code_challenge };
}

export function buildAuthorizationUrl(input: {
  clientKey: string;
  state: string;
  redirectUri: string;
  codeChallenge: string;
  authorizeBaseUrl?: string;
}): string {
  const base = input.authorizeBaseUrl ?? TIKTOK_AUTHORIZE_BASE_URL;
  const params = new URLSearchParams({
    client_key: input.clientKey,
    response_type: 'code',
    scope: TIKTOK_SCOPES.join(','),
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${base}${TIKTOK_AUTHORIZE_PATH}?${params}`;
}

// The login window intercepts the registered redirect; a mismatched state is a hard stop.
export function readAuthorizationCode(
  url: string,
  expectedState: string,
  redirectUri: string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('CHANNEL_AUTHORIZE_FAILED');
  }
  const expected = new URL(redirectUri);
  if (parsed.origin !== expected.origin || parsed.pathname !== expected.pathname)
    throw new Error('CHANNEL_AUTHORIZE_FAILED');
  if (parsed.searchParams.has('error')) throw new Error('CHANNEL_AUTHORIZE_DENIED');
  if (!expectedState || parsed.searchParams.get('state') !== expectedState)
    throw new Error('CHANNEL_AUTHORIZE_STATE');
  const code = parsed.searchParams.get('code');
  if (!code || code.length > 4096) throw new Error('CHANNEL_AUTHORIZE_FAILED');
  return code;
}

function validPayload(value: unknown): value is TikTokTokenPayload {
  if (!value || typeof value !== 'object') return false;
  const token = value as Record<string, unknown>;
  return (
    typeof token.access_token === 'string' &&
    token.access_token.length > 0 &&
    typeof token.refresh_token === 'string' &&
    token.refresh_token.length > 0 &&
    typeof token.open_id === 'string' &&
    typeof token.expires_in === 'number' &&
    typeof token.refresh_expires_in === 'number'
  );
}

async function callBroker(
  body: Record<string, string>,
  brokerUrl: string,
  fetchImpl: typeof fetch,
): Promise<TikTokTokenPayload> {
  const response = await fetchImpl(brokerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('CHANNEL_AUTHORIZE_FAILED');
  const payload = (await response.json().catch(() => null)) as { tokens?: unknown } | null;
  if (!validPayload(payload?.tokens)) throw new Error('CHANNEL_AUTHORIZE_FAILED');
  return payload.tokens;
}

// The broker is the only place the client secret exists; it returns the token set once.
export function exchangeCodeForTokens(
  input: { code: string; codeVerifier: string; redirectUri: string },
  brokerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TikTokTokenPayload> {
  return callBroker(
    {
      action: 'exchange',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    },
    brokerUrl,
    fetchImpl,
  );
}

export async function refreshTokens(
  refreshToken: string,
  brokerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TikTokTokenPayload> {
  return callBroker({ action: 'refresh', refresh_token: refreshToken }, brokerUrl, fetchImpl);
}
