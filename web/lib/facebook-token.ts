// Stateless Facebook token broker. It stores nothing and never logs a token; it exists only so the
// app secret stays off the desktop. Two exchanges: code -> short-lived, then short -> long-lived.
export const FACEBOOK_REDIRECT_URI = 'https://www.facebook.com/connect/login_success.html';
export const GRAPH_VERSION = 'v25.0';
export const DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com';

export interface BrokerConfig {
  appId: string;
  appSecret: string;
  graphBaseUrl: string;
}

export type BrokerResponse =
  | { ok: true; access_token: string }
  | { ok: false; status: number; error: string };

export type BrokerEnv = Record<string, string | undefined>;

export function brokerConfigFromEnv(env: BrokerEnv): BrokerConfig | null {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    graphBaseUrl: env.META_GRAPH_BASE_URL?.trim() || DEFAULT_GRAPH_BASE_URL,
  };
}

async function requestToken(
  fetchImpl: typeof fetch,
  url: string,
  params: Record<string, string>,
): Promise<string | null> {
  const query = new URLSearchParams(params).toString();
  const response = await fetchImpl(`${url}?${query}`, { method: 'GET' });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  return typeof payload?.access_token === 'string' && payload.access_token.length > 0
    ? payload.access_token
    : null;
}

export async function exchangeFacebookCode(
  input: unknown,
  config: BrokerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BrokerResponse> {
  const record =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const { code, redirect_uri: redirectUri } = record;
  if (typeof code !== 'string' || !code || code.length > 4096)
    return { ok: false, status: 400, error: 'INVALID_CODE' };
  if (redirectUri !== FACEBOOK_REDIRECT_URI)
    return { ok: false, status: 400, error: 'INVALID_REDIRECT' };

  const shortLived = await requestToken(
    fetchImpl,
    `${config.graphBaseUrl}/${GRAPH_VERSION}/oauth/access_token`,
    {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: FACEBOOK_REDIRECT_URI,
      code,
    },
  );
  if (!shortLived) return { ok: false, status: 502, error: 'GRAPH_EXCHANGE_FAILED' };

  const longLived = await requestToken(fetchImpl, `${config.graphBaseUrl}/oauth/access_token`, {
    grant_type: 'fb_exchange_token',
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLived,
  });
  if (!longLived) return { ok: false, status: 502, error: 'GRAPH_EXCHANGE_FAILED' };

  return { ok: true, access_token: longLived };
}
