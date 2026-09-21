import path from 'node:path';
import type { ContentMediaKind, ContentOrigin } from './library-contracts.js';
import { CONTENT_MEDIA_KINDS } from './library-contracts.js';

/**
 * The local file kinds a Library import can create, and the extensions each accepts. One list
 * shared by the copy-mode allowlist here and the native picker filters in Electron, so the picker
 * can never offer a file the copy path then refuses.
 */
export const LOCAL_MEDIA_EXTENSIONS = {
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi'],
  audio: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus'],
  subtitle: ['srt', 'ass'],
} as const;

/** The kinds a local import can produce; `image`/`slides` only ever arrive from a connector. */
export type LocalMediaKind = keyof typeof LOCAL_MEDIA_EXTENSIONS;

/** The kind an extension (with or without its leading dot, any case) belongs to, or `null`. */
export function localMediaKindForExtension(extension: string): LocalMediaKind | null {
  const normalized = extension.toLowerCase().replace(/^\./, '');
  for (const kind of Object.keys(LOCAL_MEDIA_EXTENSIONS) as LocalMediaKind[]) {
    if ((LOCAL_MEDIA_EXTENSIONS[kind] as readonly string[]).includes(normalized)) return kind;
  }
  return null;
}

/** What a caller hands the store to create or relink a content record. The probed facts are
 * present only for the kind that owns them; a connector item arrives with its own origin and
 * publish date. */
export interface ContentSource {
  path: string;
  name: string;
  sha256: string;
  /** The probed original's size on disk; every source has one. */
  size_bytes: number;
  media_kind: ContentMediaKind;
  video: { duration_ms: number; width: number; height: number; has_audio: boolean } | null;
  audio: { duration_ms: number } | null;
  origin?: ContentOrigin;
  published_at?: number | null;
}

/**
 * Each kind must carry exactly its own probed facts and no other kind's. Accepting a video with
 * no duration, or an image with zeroed video facts, is exactly the silent corruption the media
 * kind exists to prevent, so it is rejected here rather than discovered in the Editor.
 */
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
