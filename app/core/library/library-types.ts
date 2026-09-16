import type { VideoSource } from '../media/media-types.js';

export type LibraryStorage = 'reference' | 'copy';
export type LibraryAvailability = 'unchecked' | 'available' | 'missing' | 'changed';
export type LibraryLinkKind = 'project' | 'subtitle' | 'export' | 'audio';
export interface LibraryFileIdentity {
  sha256: string;
  size_bytes: number;
}
export interface LibraryLink extends LibraryFileIdentity {
  id: string;
  kind: LibraryLinkKind;
  name: string;
  path: string;
  created_at: number;
}

export interface LibraryItem extends VideoSource {
  id: string;
  storage: LibraryStorage;
  availability: LibraryAvailability;
  created_at: number;
  updated_at: number;
  links: LibraryLink[];
}

export interface LibraryQuery {
  search: string;
  offset: number;
  limit: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface LibraryImportOptions {
  mode: LibraryStorage;
  duplicates: 'reuse' | 'separate';
}

export interface LibraryImportResult {
  items: { item: LibraryItem; reused: boolean }[];
  rejected: { name: string; code: string }[];
  cancelled: boolean;
}

export interface LibraryImportProgress {
  completed: number;
  total: number;
  name: string;
  phase: 'importing' | 'complete' | 'cancelled';
}

export interface LibraryDependencies {
  posts?: number;
  pending_posts?: number;
  workflows?: number;
  item: LibraryItem;
  pending_jobs: number;
  known_links_only: true;
}

export interface LibraryAssetQuery extends LibraryQuery {
  kind: LibraryLinkKind | 'all';
  item_id?: string;
}
export interface LibraryAsset extends LibraryLink {
  item_id: string;
  content_name: string;
}
export interface LibraryAssetPage extends Omit<LibraryPage, 'items'> {
  items: LibraryAsset[];
}
export type LibraryAssetPreview =
  | { kind: 'export' | 'audio'; name: string; url: string; duration_ms: number }
  | { kind: 'subtitle'; name: string; cues: import('../subtitles/cues.js').Cue[] };
