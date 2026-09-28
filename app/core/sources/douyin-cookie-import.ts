import { DOUYIN_IDENTITY_COOKIES } from './douyin-contracts.js';

// Values are carried here and nowhere else.
export interface DouyinCookie {
  name: string;
  value: string;
}

export type DouyinCookieImportFailure =
  | { reason: 'unreadable' }
  | { reason: 'missing_identity'; expected: readonly string[] };

export type DouyinCookieImport =
  | { ok: true; cookies: DouyinCookie[] }
  | ({ ok: false } & DouyinCookieImportFailure);

// Values must not smuggle a delimiter or control character.
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

export function parseDouyinCookies(text: string): DouyinCookieImport {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'unreadable' };

  const cookies = parseJsonForm(trimmed) ?? parseHeaderForm(trimmed);
  if (cookies.length === 0) return { ok: false, reason: 'unreadable' };

  const names = new Set(cookies.map((cookie) => cookie.name));
  if (!DOUYIN_IDENTITY_COOKIES.some((name) => names.has(name))) {
    return { ok: false, reason: 'missing_identity', expected: DOUYIN_IDENTITY_COOKIES };
  }
  // Last occurrence wins, matching how a browser resolves a repeated name in one header.
  const unique = new Map(cookies.map((cookie) => [cookie.name, cookie]));
  return { ok: true, cookies: [...unique.values()].slice(0, MAX_COOKIES) };
}
