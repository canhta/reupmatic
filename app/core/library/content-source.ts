import path from 'node:path';
import type { ContentMediaKind, ContentOrigin } from './library-contracts.js';
import { CONTENT_MEDIA_KINDS } from './library-contracts.js';

export const LOCAL_MEDIA_EXTENSIONS = {
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi'],
  audio: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus'],
  subtitle: ['srt', 'ass'],
} as const;

/** `image`/`slides` only ever arrive from a connector. */
export type LocalMediaKind = keyof typeof LOCAL_MEDIA_EXTENSIONS;

export function localMediaKindForExtension(extension: string): LocalMediaKind | null {
  const normalized = extension.toLowerCase().replace(/^\./, '');
  for (const kind of Object.keys(LOCAL_MEDIA_EXTENSIONS) as LocalMediaKind[]) {
    if ((LOCAL_MEDIA_EXTENSIONS[kind] as readonly string[]).includes(normalized)) return kind;
  }
  return null;
}

export interface ContentSource {
  path: string;
  name: string;
  sha256: string;
  size_bytes: number;
  media_kind: ContentMediaKind;
  video: { duration_ms: number; width: number; height: number; has_audio: boolean } | null;
  audio: { duration_ms: number } | null;
  origin?: ContentOrigin;
  published_at?: number | null;
}

export function assertContentSource(source: ContentSource): void {
  if (
    !source ||
    !path.isAbsolute(source.path) ||
    source.path.includes('\0') ||
    !source.name ||
    source.name.length > 1024 ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    !Number.isSafeInteger(source.size_bytes) ||
    source.size_bytes < 0 ||
    !(CONTENT_MEDIA_KINDS as readonly string[]).includes(source.media_kind)
  )
    throw new Error('INVALID_MEDIA');
  const video = source.video;
  const audio = source.audio;
  if (source.media_kind === 'video') {
    if (
      !video ||
      audio ||
      !Number.isInteger(video.duration_ms) ||
      video.duration_ms <= 0 ||
      !Number.isInteger(video.width) ||
      video.width <= 0 ||
      !Number.isInteger(video.height) ||
      video.height <= 0 ||
      typeof video.has_audio !== 'boolean'
    )
      throw new Error('INVALID_MEDIA');
  } else if (source.media_kind === 'audio') {
    if (video || !audio || !Number.isInteger(audio.duration_ms) || audio.duration_ms <= 0)
      throw new Error('INVALID_MEDIA');
  } else if (video || audio) {
    throw new Error('INVALID_MEDIA');
  }
}
