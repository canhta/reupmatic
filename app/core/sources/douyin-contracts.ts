// The three cookies that distinguish an authenticated session from an anonymous one.
export const DOUYIN_IDENTITY_COOKIES = ['sid_guard', 'sessionid', 'sid_tt'] as const;

export type DouyinConnectionStatus = 'connected' | 'not_connected' | 'needs_reconnect';

export interface DouyinSessionSnapshot {
  status: DouyinConnectionStatus;
  /** Epoch ms of the last time the identity cookies were confirmed present, or `null` if never. */
  connectedAt: number | null;
  checkedAt: number;
}
