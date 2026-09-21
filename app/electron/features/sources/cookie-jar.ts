import { DOUYIN_IDENTITY_COOKIES } from '../../../core/sources/douyin-contracts.js';
import type { DouyinCookieJar } from '../../../core/sources/douyin-session.js';

const DOMAIN = '.douyin.com';
const URL_ = 'https://www.douyin.com/';
// Browsers cap cookie lifetime at ~400 days; pasted cookies need a durable expiry.
const IMPORT_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Narrow slice of Electron's Session; declared locally so tests need no Electron. */
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
      /** Unix seconds; omitted, Electron writes a session cookie that dies with the process. */
      expirationDate?: number;
    }): Promise<void>;
  };
  clearStorageData(): Promise<void>;
}

/** Only cookie names cross this boundary; clear() wipes the whole partition. */
export function electronCookieJar(session: CookieSource): DouyinCookieJar {
  return {
    async importCookies(cookies) {
      const expirationDate = Date.now() / 1000 + IMPORT_MAX_AGE_SECONDS;
      for (const cookie of cookies) {
        // Scoped to the Douyin domain; failures never carry the cookie value.
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
        // Ask by URL, not domain: host-only login cookies miss a .douyin.com filter.
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
