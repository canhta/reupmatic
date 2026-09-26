// Stateless TikTok token broker. It stores nothing and never logs a token; it exists only so the
// client secret stays off the desktop. Login Kit needs the secret for both the code exchange and
// the refresh, and the exchange requires the PKCE code_verifier.
//
// OPEN ITEM (ADR 0001): the desktop redirect URI form (loopback vs a registered https URL) is not
// verified in the TikTok developer portal. It is not guessed here: the deployed redirect URI comes
// from TIKTOK_REDIRECT_URI and every request must match it.
export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_TOKEN_PATH = '/v2/oauth/token/';
export const DEFAULT_TIKTOK_BASE_URL = 'https://open.tiktokapis.com';

export interface BrokerConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
}

export interface TikTokTokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
}

export type BrokerResponse =
  | { ok: true; tokens: TikTokTokenSet }
  | { ok: false; status: number; error: string };

export type BrokerEnv = Record<string, string | undefined>;

export function brokerConfigFromEnv(env: BrokerEnv): BrokerConfig | null {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim();
  const redirectUri = env.TIKTOK_REDIRECT_URI?.trim();
  if (!clientKey || !clientSecret || !redirectUri) return null;
  return {
    clientKey,
    clientSecret,
    redirectUri,
    baseUrl: env.TIKTOK_API_BASE_URL?.trim() || DEFAULT_TIKTOK_BASE_URL,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requiredNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

async function requestTokens(
  fetchImpl: typeof fetch,
  url: string,
  params: Record<string, string>,
): Promise<{ tokens: TikTokTokenSet | null; error: string | null }> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    // Surface TikTok's own error code (notably invalid_grant) so the desktop can tell a dead
    // refresh token from a transient failure.
    const error = isRecord(payload) && typeof payload.error === 'string' ? payload.error : null;
    return { tokens: null, error };
  }
  if (!isRecord(payload)) return { tokens: null, error: null };
  const access_token = requiredString(payload, 'access_token');
  const refresh_token = requiredString(payload, 'refresh_token');
  const open_id = requiredString(payload, 'open_id');
  const expires_in = requiredNumber(payload, 'expires_in');
  const refresh_expires_in = requiredNumber(payload, 'refresh_expires_in');
  if (
    !access_token ||
    !refresh_token ||
    !open_id ||
    expires_in === null ||
    refresh_expires_in === null
  )
    return { tokens: null, error: null };
  return {
    tokens: { access_token, refresh_token, expires_in, refresh_expires_in, open_id },
    error: null,
  };
}

// PKCE code verifier: 43–128 unreserved characters (RFC 7636).
function validVerifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(value);
}

export async function exchangeTikTokCode(
  input: unknown,
  config: BrokerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BrokerResponse> {
  const record = isRecord(input) ? input : {};
  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = record;
  if (typeof code !== 'string' || !code || code.length > 4096)
    return { ok: false, status: 400, error: 'INVALID_CODE' };
  if (redirectUri !== config.redirectUri)
    return { ok: false, status: 400, error: 'INVALID_REDIRECT' };
  if (!validVerifier(codeVerifier))
    return { ok: false, status: 400, error: 'INVALID_CODE_VERIFIER' };

  const result = await requestTokens(fetchImpl, `${config.baseUrl}${TIKTOK_TOKEN_PATH}`, {
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });
  if (!result.tokens) return { ok: false, status: 502, error: 'TIKTOK_EXCHANGE_FAILED' };
  return { ok: true, tokens: result.tokens };
}

export async function refreshTikTokToken(
  input: unknown,
  config: BrokerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BrokerResponse> {
  const record = isRecord(input) ? input : {};
  const { refresh_token: refreshToken } = record;
  if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 4096)
    return { ok: false, status: 400, error: 'INVALID_REFRESH_TOKEN' };

  const result = await requestTokens(fetchImpl, `${config.baseUrl}${TIKTOK_TOKEN_PATH}`, {
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  if (!result.tokens) {
    // A dead refresh token is a definite refusal the desktop must map to CHANNEL_REAUTHORIZE.
    if (result.error === 'invalid_grant') return { ok: false, status: 401, error: 'invalid_grant' };
    return { ok: false, status: 502, error: 'TIKTOK_REFRESH_FAILED' };
  }
  return { ok: true, tokens: result.tokens };
}
