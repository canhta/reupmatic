import {
  DOUYIN_IDENTITY_COOKIES,
  type DouyinConnectionStatus,
  type DouyinSessionSnapshot,
} from './douyin-contracts.js';
import { parseDouyinCookies } from './douyin-cookie-import.js';
import type { DouyinSessionState, DouyinSessionStore } from './douyin-session-store.js';

/**
 * The `persist:douyin` partition's cookie jar, narrowed to exactly what this module needs and no
 * more. `identityCookies()` returns only cookie *names* that are present with a non-empty value —
 * never a value — so nothing downstream of this interface can log, forward or persist a session
 * secret; it structurally never receives one. The real adapter
 * (`app/electron/features/sources/cookie-jar.ts`) wraps Electron's `session.cookies`; nothing in
 * this file imports Electron.
 */
export interface DouyinCookieJar {
  identityCookies(): Promise<ReadonlySet<string>>;
  /** Writes cookies into the partition. Values cross here and nowhere else. */
  importCookies(cookies: readonly { name: string; value: string }[]): Promise<void>;
  /** Erases every cookie and other stored data for the partition — the whole session, not a
   * partial removal. */
  clear(): Promise<void>;
}

export interface DouyinSessionDeps {
  cookies: DouyinCookieJar;
  store: DouyinSessionStore;
  now?(): number;
}

/**
 * Connection-state contract for the authorized Douyin session (ticket 01). Owns exactly the
 * status derivation and the persisted "was this ever connected" intent — not the session
 * partition, the login window, or any request to Douyin, which are Electron/host concerns.
 */
export class DouyinSession {
  private readonly cookies: DouyinCookieJar;
  private readonly store: DouyinSessionStore;
  private readonly now: () => number;

  constructor(deps: DouyinSessionDeps) {
    this.cookies = deps.cookies;
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
  }

  /** No pending background work of its own — a `WorkspaceParticipant` for symmetry with the
   * other Sources & Library close-sequence members. */
  get activeCount(): number {
    return 0;
  }

  async close(): Promise<void> {
    this.store.close();
  }

  /**
   * Re-reads the real session and reports current status — never assumes success merely because
   * a login window closed. Confirming the identity cookies are present also records "connected"
   * so status survives an app restart even if the cookies later expire while the app is closed.
   */
  async refresh(): Promise<DouyinSessionSnapshot> {
    const present = await this.cookies.identityCookies();
    const complete = DOUYIN_IDENTITY_COOKIES.every((name) => present.has(name));
    const state = complete ? this.store.markConnected(this.now()) : this.store.read();
    return this.toSnapshot(complete, state);
  }

  /**
   * The advanced entry point: pasted cookies go into the same partition Connect builds, then the
   * status is derived by the same `refresh()` every other path uses. One code path, two ways in —
   * so a session imported this way cannot behave differently from one logged in through the
   * browser window.
   *
   * The parse failure is thrown by code, never by message: nothing here can echo the paste.
   */
  async importCookies(text: string): Promise<DouyinSessionSnapshot> {
    const parsed = parseDouyinCookies(text);
    if (!parsed.ok) throw new Error(`DOUYIN_COOKIES_${parsed.reason.toUpperCase()}`);
    await this.cookies.importCookies(parsed.cookies);
    return this.refresh();
  }

  /** Erases the partition's stored session and the persisted "connected" intent. */
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
