import { DOUYIN_IDENTITY_COOKIES } from '../../../core/sources/douyin-contracts.js';
import type { DouyinCookieJar } from '../../../core/sources/douyin-session.js';

const DOMAIN = '.douyin.com';
const URL_ = 'https://www.douyin.com/';
/**
 * Browsers cap cookie lifetime at ~400 days. A pasted cookie with no expiry written as a session
 * cookie would drop the whole session the moment the app quits, so give pasted cookies the same
 * durable lifetime a real login's persistent cookies carry; reconnecting or Disconnect still
 * replaces or clears them.
 */
const IMPORT_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** The narrow slice of Electron's `Session` this adapter needs. Declared locally rather than
 * imported from `electron` so this file carries no runtime Electron dependency at all (the real
 * `session.fromPartition(...)` object satisfies it structurally) — tests exercise it with a plain
 * fake, no Electron process required. */
export interface CookieSource {
  cookies: {
    get(filter: { domain?: string; name?: string; url?: string }): Promise<{ value: string }[]>;
    set(details: {
      url: string;
      name: string;
      value: string;
      domain?: string;
      path?: string;
      secure?: boolean;
      /** Unix seconds. Omitted, Electron writes a session cookie that dies with the process. */
      expirationDate?: number;
    }): Promise<void>;
  };
  clearStorageData(): Promise<void>;
}

/**
 * Wraps a `persist:douyin` `Session` as the `DouyinCookieJar` interface `DouyinSession`
 * (app/core, no Electron import) depends on. Only cookie *names* ever cross this boundary —
 * `identityCookies()` reduces each cookie to a present/absent boolean and discards its value
 * immediately, so no cookie, token or session value can reach a log, an error message or any
 * caller beyond this function. `clear()` wipes the whole partition (cookies, cache, storage),
 * not a partial removal, so Disconnect leaves no residue.
 */
export function electronCookieJar(session: CookieSource): DouyinCookieJar {
  return {
    async importCookies(cookies) {
      const expirationDate = Date.now() / 1000 + IMPORT_MAX_AGE_SECONDS;
      for (const cookie of cookies) {
        // Scoped to the Douyin domain on the partition this feature owns, so a pasted cookie can
        // never be written against another site. Nothing is logged: a failure here propagates as
        // its own error, never as a message carrying the value.
        await session.cookies.set({
          url: URL_,
          name: cookie.name,
          value: cookie.value,
          domain: DOMAIN,
          path: '/',
          secure: true,
          expirationDate,
        });
      }
    },
    async identityCookies() {
      const present = new Set<string>();
      for (const name of DOUYIN_IDENTITY_COOKIES) {
        // Ask by URL, not by domain: a login cookie Douyin sets host-only (`www.douyin.com`,
        // no `Domain` attribute) is still sent to `www.douyin.com` but would not match a
        // `.douyin.com` domain filter, so a real completed login could read as not connected.
        const cookies = await session.cookies.get({ url: URL_, name });
        if (cookies.some((cookie) => cookie.value)) present.add(name);
      }
      return present;
    },
    async clear() {
      await session.clearStorageData();
    },
  };
}
