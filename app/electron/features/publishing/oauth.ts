import { GRAPH_VERSION } from './facebook-adapter.js';

export const FACEBOOK_REDIRECT_URI = 'https://www.facebook.com/connect/login_success.html';
export const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;
export const DEFAULT_OAUTH_BASE_URL = 'https://www.facebook.com';
export const DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com';

export interface ConnectedPage {
  id: string;
  name: string;
  access_token: string;
}

export function buildAuthorizationUrl(input: {
  appId: string;
  state: string;
  oauthBaseUrl?: string;
}): string {
  const base = input.oauthBaseUrl ?? DEFAULT_OAUTH_BASE_URL;
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    state: input.state,
    scope: FACEBOOK_SCOPES.join(','),
    response_type: 'code',
  });
  return `${base}/${GRAPH_VERSION}/dialog/oauth?${params}`;
}

// The login window intercepts the registered redirect; a mismatched state is a hard stop.
export function readAuthorizationCode(url: string, expectedState: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('CHANNEL_AUTHORIZE_FAILED');
  }
  if (`${parsed.origin}${parsed.pathname}` !== FACEBOOK_REDIRECT_URI)
    throw new Error('CHANNEL_AUTHORIZE_FAILED');
  if (parsed.searchParams.has('error')) throw new Error('CHANNEL_AUTHORIZE_DENIED');
  if (!expectedState || parsed.searchParams.get('state') !== expectedState)
    throw new Error('CHANNEL_AUTHORIZE_STATE');
  const code = parsed.searchParams.get('code');
  if (!code || code.length > 4096) throw new Error('CHANNEL_AUTHORIZE_FAILED');
  return code;
}

// The broker is the only place the app secret exists; it returns the long-lived user token once.
export async function exchangeCodeForUserToken(
  code: string,
  brokerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(brokerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: FACEBOOK_REDIRECT_URI }),
  });
  if (!response.ok) throw new Error('CHANNEL_AUTHORIZE_FAILED');
  const payload = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  if (typeof payload?.access_token !== 'string' || !payload.access_token)
    throw new Error('CHANNEL_AUTHORIZE_FAILED');
  return payload.access_token;
}

export async function listPages(
  userToken: string,
  graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectedPage[]> {
  const query = new URLSearchParams({
    fields: 'id,name,access_token',
    access_token: userToken,
  });
  const response = await fetchImpl(`${graphBaseUrl}/${GRAPH_VERSION}/me/accounts?${query}`);
  if (!response.ok) throw new Error('CHANNEL_AUTHORIZE_FAILED');
  const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
  if (!Array.isArray(payload?.data)) throw new Error('CHANNEL_AUTHORIZE_FAILED');
  return payload.data.map((page) => {
    const value = page as { id?: unknown; name?: unknown; access_token?: unknown };
    if (typeof value.id !== 'string' || typeof value.access_token !== 'string')
      throw new Error('CHANNEL_AUTHORIZE_FAILED');
    return {
      id: value.id,
      name: typeof value.name === 'string' ? value.name : value.id,
      access_token: value.access_token,
    };
  });
}
