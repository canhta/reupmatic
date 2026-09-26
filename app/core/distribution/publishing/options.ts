import { boolean, object } from '../../catalog/validation.js';
import type { Platform, PostOptions, YouTubeOptions } from './contracts.js';
import { parseTikTokOptions } from './tiktok.js';

function parseYouTubeOptions(value: unknown): YouTubeOptions {
  const input = object(value, ['self_declared_made_for_kids', 'contains_synthetic_media']);
  return {
    self_declared_made_for_kids: boolean(input.self_declared_made_for_kids),
    contains_synthetic_media: boolean(input.contains_synthetic_media),
  };
}

// YouTube requires an explicit made-for-kids declaration with no default and TikTok a
// privacy_level with no default, so a post missing its platform's options is refused rather than
// guessed. A platform carries no other platform's options.
export function parsePostOptions(value: unknown, platform: Platform): PostOptions {
  const input = object(value, [], ['youtube', 'tiktok']);
  const youtube =
    input.youtube === undefined || input.youtube === null
      ? null
      : parseYouTubeOptions(input.youtube);
  const tiktok =
    input.tiktok === undefined || input.tiktok === null ? null : parseTikTokOptions(input.tiktok);
  if (platform === 'youtube') {
    if (!youtube) throw new Error('INVALID_REQUEST');
    if (tiktok) throw new Error('INVALID_REQUEST');
    return { youtube, tiktok: null };
  }
  if (platform === 'tiktok') {
    if (!tiktok) throw new Error('INVALID_REQUEST');
    if (youtube) throw new Error('INVALID_REQUEST');
    return { youtube: null, tiktok };
  }
  if (youtube || tiktok) throw new Error('INVALID_REQUEST');
  return { youtube: null, tiktok: null };
}
