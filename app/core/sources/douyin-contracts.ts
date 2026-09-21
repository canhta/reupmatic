/**
 * Douyin identity cookies beyond the anonymous-capable required set
 * (`msToken`/`ttwid`/`odin_tt`/`passport_csrf_token`, which a signed request needs whether or not
 * anyone is logged in). Named exactly per
 * R-J7's
 * `SUGGESTED_KEYS - REQUIRED_KEYS = {sid_guard, sessionid, sid_tt}` — the three cookies that
 * distinguish an authenticated session from an anonymous one.
 *
 * Ticket 01 makes no request to Douyin (that is ticket 04's job), so this is the best signal
 * available from the session alone. It is a heuristic, not a verified login: ticket 07 confirms
 * (or invalidates) it reactively from an actual request outcome.
 */
export const DOUYIN_IDENTITY_COOKIES = ['sid_guard', 'sessionid', 'sid_tt'] as const;

export type DouyinConnectionStatus = 'connected' | 'not_connected' | 'needs_reconnect';

export interface DouyinSessionSnapshot {
  status: DouyinConnectionStatus;
  /** Epoch ms of the last time the identity cookies were confirmed present, or `null` if never. */
  connectedAt: number | null;
  /** Epoch ms this snapshot was computed. */
  checkedAt: number;
}
