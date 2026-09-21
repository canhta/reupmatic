import { DOUYIN_IDENTITY_COOKIES } from './douyin-contracts.js';

/**
 * One cookie to inject into the `persist:douyin` partition. Values are carried here and nowhere
 * else: nothing in this module logs, throws or returns a value, and the failure type below
 * deliberately names only *which cookies were missing*, never what was pasted.
 */
export interface DouyinCookie {
  name: string;
  value: string;
}

export type DouyinCookieImportFailure =
  /** Nothing that parsed as `name=value`, in either accepted format. */
  | { reason: 'unreadable' }
  /**
   * Parsed, but carries none of the cookies that distinguish a signed-in session from an
   * anonymous one. Names the ones we looked for so the message can be specific rather than a
   * generic failure.
   */
  | { reason: 'missing_identity'; expected: readonly string[] };

export type DouyinCookieImport =
  | { ok: true; cookies: DouyinCookie[] }
  | ({ ok: false } & DouyinCookieImportFailure);

/** Cookie names are tokens; values must not smuggle a delimiter or a control character. */
const NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
const FORBIDDEN_VALUE = /[\x00-\x1f\x7f;,\s]/;

const MAX_COOKIES = 60;
const MAX_VALUE = 4096;

function acceptable(name: string, value: string): boolean {
  return (
    NAME.test(name) && value.length > 0 && value.length <= MAX_VALUE && !FORBIDDEN_VALUE.test(value)
  );
}

/** The `name=value; name2=value2` form, as `document.cookie` and a request header both give it. */
function parseHeaderForm(text: string): DouyinCookie[] {
  const cookies: DouyinCookie[] = [];
  for (const part of text.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (acceptable(name, value)) cookies.push({ name, value });
  }
  return cookies;
}

/** The array form a browser devtools or cookie-export extension copies out. */
function parseJsonForm(text: string): DouyinCookie[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const cookies: DouyinCookie[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { name, value } = entry as { name?: unknown; value?: unknown };
    if (typeof name === 'string' && typeof value === 'string' && acceptable(name, value)) {
      cookies.push({ name, value });
    }
  }
  return cookies;
}

/**
 * Reads pasted cookies into the set we will inject.
 *
 * This is the advanced path into exactly the same session the Connect button builds, so it
 * succeeds only when the paste actually carries a signed-in identity — otherwise the app would
 * report "connected" from an anonymous cookie jar and every later request would fail confusingly.
 */
export function parseDouyinCookies(text: string): DouyinCookieImport {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'unreadable' };

  const cookies = parseJsonForm(trimmed) ?? parseHeaderForm(trimmed);
  if (cookies.length === 0) return { ok: false, reason: 'unreadable' };

  const names = new Set(cookies.map((cookie) => cookie.name));
  if (!DOUYIN_IDENTITY_COOKIES.some((name) => names.has(name))) {
    return { ok: false, reason: 'missing_identity', expected: DOUYIN_IDENTITY_COOKIES };
  }
  // Last occurrence wins, matching how a browser would resolve a repeated name in one header.
  const unique = new Map(cookies.map((cookie) => [cookie.name, cookie]));
  return { ok: true, cookies: [...unique.values()].slice(0, MAX_COOKIES) };
}
