export type DouyinIntakeMediaType = 'video' | 'image' | 'slides';

export type DouyinServedBy = 'direct' | 'page';

/** Read from structured `text_extra[]`, never parsed out of `desc`. */
export interface DouyinTag {
  /** Sanitized, length-capped untrusted source content, never an instruction. */
  name: string;
  hashtagId: string | null;
}

export interface DouyinMention {
  nickname: string;
  secUid: string | null;
}

export interface DouyinLadderTier {
  gearName: string | null;
  bitRate: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  dataSize: number | null;
  /** url_list mirrors expire and are deliberately absent. */
  uri: string | null;
}

export interface DouyinProbeFacts {
  container: string;
  codec: string;
  width: number;
  height: number;
  durationMs: number;
  frameRate: string;
  hasAudio: boolean;
}

export interface DouyinCounters {
  diggCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  playCount: number | null;
  capturedAt: number;
}

export interface DouyinMusic {
  id: string | null;
  title: string | null;
  author: string | null;
}

export interface DouyinMixInfo {
  id: string | null;
  name: string | null;
}

export interface DouyinAnchorLink {
  kind: 'product' | 'link';
  title: string | null;
  url: string | null;
}

export interface DouyinImageAsset {
  uri: string | null;
  width: number | null;
  height: number | null;
}

export interface DouyinIntakeAuthor {
  uid: string | null;
  nickname: string | null;
  secUid: string | null;
  avatarUri: string | null;
}

export interface DouyinIntakeVideo {
  durationMs: number | null;
  ratio: string | null;
  format: string | null;
  codec: string | null;
  coverUri: string | null;
  tiers: DouyinLadderTier[];
  takenTierIndex: number | null;
  takenTier: DouyinLadderTier | null;
}

export interface DouyinIntake {
  awemeId: string;
  mediaType: DouyinIntakeMediaType;
  /** Douyin's raw `aweme_type`; image posts and slides are not videos. */
  awemeType: number | null;
  isTop: boolean;
  description: string;
  /** Epoch ms, derived from Douyin's `create_time` (seconds). */
  publishedAt: number | null;
  downloadedAt: number;
  servedBy: DouyinServedBy;
  shareUrl: string | null;
  author: DouyinIntakeAuthor;
  tags: DouyinTag[];
  mentions: DouyinMention[];
  video: DouyinIntakeVideo | null;
  probe: DouyinProbeFacts | null;
  /** Probe wins over the payload; the mismatch is recorded, not dropped. */
  disagreements: string[];
  counters: DouyinCounters;
  music: DouyinMusic | null;
  mixInfo: DouyinMixInfo | null;
  anchorLinks: DouyinAnchorLink[];
  images: DouyinImageAsset[];
}

export interface DouyinIntakeRecord {
  intake: DouyinIntake;
  raw: unknown;
}
