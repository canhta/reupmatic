/**
 * The typed projection we persist beside a Douyin item's untouched raw payload
 * (`spec.md`, "What metadata we persist, and why it is not obvious").
 *
 * The raw payload is retained exactly once so a facet nobody anticipated can be added later without
 * a second fetch, but raw JSON is not queryable, sortable or displayable — anything the product
 * reasons about needs this projection. It is the Douyin variant of a content record's origin: facts
 * specific to one connector live here rather than as nullable columns on the shared shape.
 *
 * Rules this contract encodes, each earned by a failure it prevents:
 * - Counters are a snapshot. Every one carries `capturedAt`; a count without it silently becomes a
 *   lie the moment the source changes.
 * - The offered quality ladder and the tier actually taken are both kept, so "do we hold the best
 *   copy offered?" and "does this need re-encoding?" are answerable without re-fetching.
 * - `publishedAt` (Douyin's `create_time`) and `downloadedAt` (ours) are distinct fields. Nothing
 *   here is just "date".
 * - No durable field is an expiring CDN URL: `uri` and `coverUri` are stable handles, and the cover
 *   itself is materialized to a local file by the Library intake path.
 * - `probe` is the FFmpeg fact and wins over the payload's claim; `disagreements` records a
 *   mismatch rather than dropping it.
 * - Tags are carried with their `hashtagId` for provenance. They are *not* a tag field on the
 *   content record: they become `tag` labels through `app/core/taxonomy` (see `intake-tags.ts`).
 */

export type DouyinIntakeMediaType = 'video' | 'image' | 'slides';

/**
 * Which path actually served the bytes. Whether a CDN media URL needs the page context or merely
 * cookies plus referer was never settled on paper (`spec.md`, "Known unverified assumption"), so
 * the fact we obtained is recorded per item rather than claimed in the abstract.
 */
export type DouyinServedBy = 'direct' | 'page';

/** One hashtag read from the payload's structured `text_extra[]`, never parsed out of `desc`. */
export interface DouyinTag {
  /** Sanitized, length-capped display text. Untrusted source content, never an instruction. */
  name: string;
  /** Provenance only. The shared `Label` contract is deliberately not widened for it. */
  hashtagId: string | null;
}

/** An @mention from the same `text_extra[]`, kept distinct from a hashtag. */
export interface DouyinMention {
  nickname: string;
  secUid: string | null;
}

/** One rung of `video.bit_rate[]`: what the source offered, before any download. */
export interface DouyinLadderTier {
  gearName: string | null;
  bitRate: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  /** Bytes, from `play_addr.data_size`. Known before download, not an estimate. */
  dataSize: number | null;
  /** Stable-ish handle. `url_list` mirrors expire and are deliberately absent. */
  uri: string | null;
}

/** The FFmpeg-probed facts of the file we actually hold. The fact, not a claim. */
export interface DouyinProbeFacts {
  container: string;
  codec: string;
  width: number;
  height: number;
  durationMs: number;
  /** A ratio string (e.g. "30" or "30000/1001"), not a decimal. */
  frameRate: string;
  hasAudio: boolean;
}

/** Counters are true only at the instant they were read, so `capturedAt` is required. */
export interface DouyinCounters {
  diggCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  playCount: number | null;
  /** Epoch milliseconds. A counter cannot be persisted without one (`assertDouyinIntake`). */
  capturedAt: number;
}

export interface DouyinMusic {
  id: string | null;
  title: string | null;
  author: string | null;
}

/** The collection an item belongs to, so a partial listing can be resumed and grouped. */
export interface DouyinMixInfo {
  id: string | null;
  name: string | null;
}

/** A product or generic anchor attached to the post; the one moment it is cheap to capture. */
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
  /** Changes and collides; attribution keys off `secUid`. */
  nickname: string | null;
  secUid: string | null;
  avatarUri: string | null;
}

export interface DouyinIntakeVideo {
  durationMs: number | null;
  ratio: string | null;
  format: string | null;
  /** The payload's codec flag (h264 vs h265 changes what the render path must do). */
  codec: string | null;
  coverUri: string | null;
  tiers: DouyinLadderTier[];
  takenTierIndex: number | null;
  /** The rung actually downloaded, recorded separately from the whole ladder. */
  takenTier: DouyinLadderTier | null;
}

export interface DouyinIntake {
  awemeId: string;
  mediaType: DouyinIntakeMediaType;
  /** Douyin's raw `aweme_type`. Image posts and slides are not videos. */
  awemeType: number | null;
  /** A pinned item is not just an old item. */
  isTop: boolean;
  description: string;
  /** Original publish instant, epoch ms, derived from Douyin's `create_time` (seconds). */
  publishedAt: number | null;
  /** When we downloaded the item. Distinct from `publishedAt` by name and meaning. */
  downloadedAt: number;
  /** Which path served the bytes; recorded because the CDN behaviour is not settled. */
  servedBy: DouyinServedBy;
  shareUrl: string | null;
  author: DouyinIntakeAuthor;
  tags: DouyinTag[];
  mentions: DouyinMention[];
  /** Non-null only for a video; an image post or slides carries no video projection. */
  video: DouyinIntakeVideo | null;
  probe: DouyinProbeFacts | null;
  /** Names of fields where the probe and the payload disagreed; probe wins, mismatch recorded. */
  disagreements: string[];
  counters: DouyinCounters;
  music: DouyinMusic | null;
  mixInfo: DouyinMixInfo | null;
  anchorLinks: DouyinAnchorLink[];
  images: DouyinImageAsset[];
}

/** What `LibraryStore.getDouyinIntake` returns: the projection and its raw payload, once. */
export interface DouyinIntakeRecord {
  intake: DouyinIntake;
  raw: unknown;
}
