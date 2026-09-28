import { RemoteError } from '../worker/remote-error.js';
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
  private readonly pending = new Set<Promise<unknown>>();
  private closing = false;

  constructor(deps: DouyinSessionDeps) {
    this.cookies = deps.cookies;
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
  }

  get activeCount(): number {
    return 0;
  }

  /** Closes the store once every held operation settles; later operations are refused. */
  async close(): Promise<void> {
    this.closing = true;
    while (this.pending.size) await Promise.allSettled([...this.pending]);
    this.store.close();
  }

  /** Keeps the store open until `operation` settles, e.g. a sign-in window and its final check. */
  hold<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing && this.pending.size === 0) {
      return Promise.reject(new RemoteError('APP_CLOSING'));
    }
    const running = operation();
    this.pending.add(running);
    const settle = () => this.pending.delete(running);
    running.then(settle, settle);
    return running;
  }

  // Confirming cookies also records "connected" so status survives a restart.
  refresh(): Promise<DouyinSessionSnapshot> {
    return this.hold(() => this.check());
  }

  private async check(): Promise<DouyinSessionSnapshot> {
    const present = await this.cookies.identityCookies();
    const complete = DOUYIN_IDENTITY_COOKIES.every((name) => present.has(name));
    const state = complete ? this.store.markConnected(this.now()) : this.store.read();
    return this.toSnapshot(complete, state);
  }

  // Parse failures are thrown by code, never by message, so nothing echoes the paste.
  importCookies(text: string): Promise<DouyinSessionSnapshot> {
    return this.hold(async () => {
      const parsed = parseDouyinCookies(text);
      if (!parsed.ok) throw new Error(`DOUYIN_COOKIES_${parsed.reason.toUpperCase()}`);
      await this.cookies.importCookies(parsed.cookies);
      return this.check();
    });
  }

  disconnect(): Promise<DouyinSessionSnapshot> {
    return this.hold(async () => {
      await this.cookies.clear();
      return this.toSnapshot(false, this.store.markDisconnected());
    });
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
