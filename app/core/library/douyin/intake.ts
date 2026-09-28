// Source metadata is untrusted display content, never an instruction.

import type { DouyinDetail, DouyinStatistics } from '../../sources/douyin-discovery-contracts.js';
import type {
  DouyinAnchorLink,
  DouyinCounters,
  DouyinImageAsset,
  DouyinIntake,
  DouyinIntakeVideo,
  DouyinLadderTier,
  DouyinMention,
  DouyinMixInfo,
  DouyinMusic,
  DouyinProbeFacts,
  DouyinServedBy,
  DouyinTag,
} from './intake-contracts.js';

export const MAX_DOUYIN_TAG_LENGTH = 80;

export interface DouyinIntakeInput {
  detail: DouyinDetail;
  downloadedAt: number;
  takenTierIndex?: number | null;
  probe?: DouyinProbeFacts | null;
  servedBy?: DouyinServedBy;
}

export function probeFactsFromDownload(result: {
  container: string;
  codec: string;
  width: number;
  height: number;
  duration_ms: number;
  frame_rate: string;
  has_audio: boolean;
}): DouyinProbeFacts {
  return {
    container: result.container,
    codec: result.codec,
    width: result.width,
    height: result.height,
    durationMs: result.duration_ms,
    frameRate: result.frame_rate,
    hasAudio: result.has_audio,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function idText(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function awemeOf(detail: DouyinDetail): Record<string, unknown> {
  const payload = record(detail.raw);
  return record(payload?.aweme_detail) ?? payload ?? {};
}

export function sanitizeDouyinTag(raw: string): string | null {
  const cleaned = raw
    .replace(/^#+/, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, MAX_DOUYIN_TAG_LENGTH).join('');
}

// Captions lack reliable delimiters, so text_extra[] is read instead of desc.
function readTagsAndMentions(aweme: Record<string, unknown>): {
  tags: DouyinTag[];
  mentions: DouyinMention[];
} {
  const extra = Array.isArray(aweme.text_extra) ? aweme.text_extra : [];
  const tags: DouyinTag[] = [];
  const mentions: DouyinMention[] = [];
  const seenTags = new Set<string>();
  const seenMentions = new Set<string>();
  for (const entry of extra) {
    const item = record(entry);
    if (!item) continue;
    const hashtag = text(item.hashtag_name);
    if (hashtag !== null) {
      const name = sanitizeDouyinTag(hashtag);
      if (name && !seenTags.has(name)) {
        seenTags.add(name);
        tags.push({ name, hashtagId: idText(item.hashtag_id) });
      }
      continue;
    }
    const nickname = text(item.nickname) ?? text(item.user_nickname) ?? text(item.mention_name);
    if (nickname !== null) {
      const name = sanitizeDouyinTag(nickname);
      if (name && !seenMentions.has(name)) {
        seenMentions.add(name);
        mentions.push({ nickname: name, secUid: idText(item.sec_uid) });
      }
    }
  }
  return { tags, mentions };
}

function readMusic(aweme: Record<string, unknown>): DouyinMusic | null {
  const music = record(aweme.music);
  if (!music) return null;
  const value: DouyinMusic = {
    id: idText(music.id_str) ?? idText(music.id),
    title: text(music.title),
    author: text(music.author) ?? text(music.owner_nickname),
  };
  return value.id || value.title || value.author ? value : null;
}

function readMixInfo(aweme: Record<string, unknown>): DouyinMixInfo | null {
  const mix = record(aweme.mix_info);
  if (!mix) return null;
  const value: DouyinMixInfo = {
    id: idText(mix.mix_id) ?? idText(mix.id),
    name: text(mix.mix_name) ?? text(mix.name),
  };
  return value.id || value.name ? value : null;
}

function anchorFrom(value: unknown, fallbackKind: 'product' | 'link'): DouyinAnchorLink | null {
  const source = record(value);
  if (!source) return null;
  const content = record(parseJson(source.content)) ?? source;
  const kind =
    text(source.type) === 'product' || text(source.anchor_type) === 'product'
      ? 'product'
      : fallbackKind;
  const link: DouyinAnchorLink = {
    kind,
    title: text(content.title) ?? text(content.name) ?? text(source.title),
    url: text(content.url) ?? text(content.web_url) ?? text(source.url),
  };
  return link.title || link.url ? link : null;
}

function readAnchorLinks(aweme: Record<string, unknown>): DouyinAnchorLink[] {
  const links: DouyinAnchorLink[] = [];
  const info = anchorFrom(aweme.anchor_info, 'link');
  if (info) links.push(info);
  const anchors = Array.isArray(aweme.anchors) ? aweme.anchors : [];
  for (const entry of anchors) {
    const link = anchorFrom(entry, 'link');
    if (link) links.push(link);
  }
  const single = anchorFrom(aweme.anchor, 'link');
  if (single) links.push(single);
  return links;
}

function readImages(aweme: Record<string, unknown>, mediaType: string): DouyinImageAsset[] {
  if (mediaType === 'video') return [];
  const images = Array.isArray(aweme.images) ? aweme.images : [];
  return images.flatMap((entry) => {
    const image = record(entry);
    if (!image) return [];
    const uri = text(image.uri);
    const width = number(image.width);
    const height = number(image.height);
    return uri || width || height ? [{ uri, width, height }] : [];
  });
}

function readVideoProjection(
  detail: DouyinDetail,
  takenTierIndex: number | null,
): DouyinIntakeVideo | null {
  const video = detail.video;
  if (!video) return null;
  const tiers: DouyinLadderTier[] = video.tiers.map((tier) => ({
    gearName: tier.gearName,
    bitRate: tier.bitRate,
    codec: tier.codec,
    width: tier.width,
    height: tier.height,
    dataSize: tier.dataSize,
    uri: tier.uri,
  }));
  const index =
    takenTierIndex !== null && takenTierIndex >= 0 && takenTierIndex < tiers.length
      ? takenTierIndex
      : null;
  return {
    durationMs: video.durationMs,
    ratio: video.ratio,
    format: video.format,
    codec: (index !== null ? tiers[index]?.codec : null) ?? tiers[0]?.codec ?? null,
    coverUri: video.coverUri,
    tiers,
    takenTierIndex: index,
    takenTier: index !== null ? (tiers[index] ?? null) : null,
  };
}

function normalizeCodec(value: string | null): string | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered === 'hevc' || lowered === 'hvc1' || lowered === 'h265') return 'h265';
  if (lowered === 'avc' || lowered === 'avc1' || lowered === 'h264') return 'h264';
  return lowered;
}

function findDisagreements(video: DouyinIntakeVideo | null, probe: DouyinProbeFacts): string[] {
  if (!video) return [];
  const found: string[] = [];
  const taken = video.takenTier;
  if (video.durationMs !== null && video.durationMs !== probe.durationMs) found.push('duration');
  if (taken?.width != null && taken.width !== probe.width) found.push('width');
  if (taken?.height != null && taken.height !== probe.height) found.push('height');
  const payloadCodec = normalizeCodec(taken?.codec ?? video.codec);
  if (payloadCodec && payloadCodec !== normalizeCodec(probe.codec)) found.push('codec');
  return found;
}

export function buildDouyinIntake(input: DouyinIntakeInput): DouyinIntake {
  if (!Number.isSafeInteger(input.downloadedAt) || input.downloadedAt <= 0)
    throw new Error('INVALID_INTAKE');
  const { detail } = input;
  const takenTierIndex =
    input.takenTierIndex !== undefined && input.takenTierIndex !== null
      ? input.takenTierIndex
      : null;
  const video = readVideoProjection(detail, takenTierIndex);
  const probe = input.probe ?? null;
  const aweme = awemeOf(detail);
  const { tags, mentions } = readTagsAndMentions(aweme);
  const isTop = aweme.is_top === 1 || aweme.is_top === true;
  return {
    awemeId: detail.awemeId,
    mediaType: detail.mediaType,
    awemeType: number(aweme.aweme_type),
    isTop,
    description: detail.description,
    publishedAt: detail.createTime === null ? null : detail.createTime * 1000,
    downloadedAt: input.downloadedAt,
    servedBy: input.servedBy ?? 'direct',
    shareUrl: detail.shareUrl,
    author: {
      uid: detail.author.uid,
      nickname: detail.author.nickname,
      secUid: detail.author.secUid,
      avatarUri: detail.author.avatarUri,
    },
    tags,
    mentions,
    video,
    probe,
    disagreements: probe ? findDisagreements(video, probe) : [],
    counters: countersOf(detail.statistics),
    music: readMusic(aweme),
    mixInfo: readMixInfo(aweme),
    anchorLinks: readAnchorLinks(aweme),
    images: readImages(aweme, detail.mediaType),
  };
}

function countersOf(statistics: DouyinStatistics): DouyinCounters {
  return {
    diggCount: statistics.diggCount,
    commentCount: statistics.commentCount,
    shareCount: statistics.shareCount,
    collectCount: statistics.collectCount,
    playCount: statistics.playCount,
    capturedAt: statistics.capturedAt,
  };
}

export interface ResolvedVideoFacts {
  container: string | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  frameRate: string | null;
  hasAudio: boolean | null;
}

export function resolvedVideoFacts(intake: DouyinIntake): ResolvedVideoFacts | null {
  if (intake.probe) {
    return {
      container: intake.probe.container,
      codec: intake.probe.codec,
      width: intake.probe.width,
      height: intake.probe.height,
      durationMs: intake.probe.durationMs,
      frameRate: intake.probe.frameRate,
      hasAudio: intake.probe.hasAudio,
    };
  }
  if (!intake.video) return null;
  return {
    container: intake.video.format,
    codec: intake.video.codec,
    width: intake.video.takenTier?.width ?? null,
    height: intake.video.takenTier?.height ?? null,
    durationMs: intake.video.durationMs,
    frameRate: null,
    hasAudio: null,
  };
}

function isCounter(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

// A count without capturedAt would silently go stale.
export function assertDouyinIntake(value: unknown): asserts value is DouyinIntake {
  const intake = record(value);
  if (!intake) throw new Error('INVALID_INTAKE');
  if (!text(intake.awemeId)) throw new Error('INVALID_INTAKE');
  if (intake.mediaType !== 'video' && intake.mediaType !== 'image' && intake.mediaType !== 'slides')
    throw new Error('INVALID_INTAKE');
  if (!Number.isSafeInteger(intake.downloadedAt) || Number(intake.downloadedAt) <= 0)
    throw new Error('INVALID_INTAKE');
  if (intake.servedBy !== 'direct' && intake.servedBy !== 'page') throw new Error('INVALID_INTAKE');
  const counters = record(intake.counters);
  if (
    !counters ||
    !Number.isSafeInteger(counters.capturedAt) ||
    Number(counters.capturedAt) <= 0 ||
    !isCounter(counters.diggCount) ||
    !isCounter(counters.commentCount) ||
    !isCounter(counters.shareCount) ||
    !isCounter(counters.collectCount) ||
    !isCounter(counters.playCount)
  )
    throw new Error('DOUYIN_COUNTER_CAPTURED_AT_REQUIRED');
  const tags = Array.isArray(intake.tags) ? intake.tags : null;
  if (!tags) throw new Error('INVALID_INTAKE');
  for (const tag of tags) {
    const entry = record(tag);
    const name = entry ? text(entry.name) : null;
    if (!name || Array.from(name).length > MAX_DOUYIN_TAG_LENGTH) throw new Error('INVALID_INTAKE');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters must never persist
    if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error('INVALID_INTAKE');
  }
  if (intake.video !== null && !record(intake.video)) throw new Error('INVALID_INTAKE');
  if (intake.probe !== null && !record(intake.probe)) throw new Error('INVALID_INTAKE');
  if (!Array.isArray(intake.disagreements)) throw new Error('INVALID_INTAKE');
}
