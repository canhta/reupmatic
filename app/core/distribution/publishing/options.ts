import { boolean, object } from '../../catalog/validation.js';
import type { Platform, PostOptions, YouTubeOptions } from './contracts.js';

function parseYouTubeOptions(value: unknown): YouTubeOptions {
  const input = object(value, ['self_declared_made_for_kids', 'contains_synthetic_media']);
  return {
    self_declared_made_for_kids: boolean(input.self_declared_made_for_kids),
    contains_synthetic_media: boolean(input.contains_synthetic_media),
  };
}

// YouTube requires an explicit made-for-kids declaration with no default, so a YouTube post without
// one is refused rather than guessed; every other platform carries no platform options yet.
export function parsePostOptions(value: unknown, platform: Platform): PostOptions {
  const input = object(value, ['youtube']);
  if (platform === 'youtube') return { youtube: parseYouTubeOptions(input.youtube) };
  if (input.youtube !== null) throw new Error('INVALID_REQUEST');
  return { youtube: null };
}
