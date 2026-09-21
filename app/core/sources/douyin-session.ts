import {
  DOUYIN_IDENTITY_COOKIES,
  type DouyinConnectionStatus,
  type DouyinSessionSnapshot,
} from './douyin-contracts.js';
import { parseDouyinCookies } from './douyin-cookie-import.js';
import type { DouyinSessionState, DouyinSessionStore } from './douyin-session-store.js';

// identityCookies returns names only, never values, so no secret can be logged or persisted.
export interface DouyinCookieJar {
  identityCookies(): Promise<ReadonlySet<string>>;
  /** Writes cookies into the partition. Values cross here and nowhere else. */
  importCookies(cookies: readonly { name: string; value: string }[]): Promise<void>;
  clear(): Promise<void>;
}

export interface DouyinSessionDeps {
  cookies: DouyinCookieJar;
  store: DouyinSessionStore;
  now?(): number;
}

export class DouyinSession {
  private readonly cookies: DouyinCookieJar;
  private readonly store: DouyinSessionStore;
  private readonly now: () => number;

  constructor(deps: DouyinSessionDeps) {
    this.cookies = deps.cookies;
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
  }

  get activeCount(): number {
    return 0;
  }

  async close(): Promise<void> {
    this.store.close();
  }

  // Confirming cookies also records "connected" so status survives a restart.
  async refresh(): Promise<DouyinSessionSnapshot> {
    const present = await this.cookies.identityCookies();
    const complete = DOUYIN_IDENTITY_COOKIES.every((name) => present.has(name));
    const state = complete ? this.store.markConnected(this.now()) : this.store.read();
    return this.toSnapshot(complete, state);
  }

  // Parse failures are thrown by code, never by message, so nothing echoes the paste.
  async importCookies(text: string): Promise<DouyinSessionSnapshot> {
    const parsed = parseDouyinCookies(text);
    if (!parsed.ok) throw new Error(`DOUYIN_COOKIES_${parsed.reason.toUpperCase()}`);
    await this.cookies.importCookies(parsed.cookies);
    return this.refresh();
  }

  async disconnect(): Promise<DouyinSessionSnapshot> {
    await this.cookies.clear();
    const state = this.store.markDisconnected();
    return this.toSnapshot(false, state);
  }

  private toSnapshot(identityComplete: boolean, state: DouyinSessionState): DouyinSessionSnapshot {
    const status: DouyinConnectionStatus = identityComplete
      ? 'connected'
      : state.everConnected
        ? 'needs_reconnect'
        : 'not_connected';
    return { status, connectedAt: state.connectedAt, checkedAt: this.now() };
  }
}
