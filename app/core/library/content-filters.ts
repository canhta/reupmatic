import type {
  ContentLinkedAssetKind,
  ContentMediaKind,
  ContentNumericRange,
  ContentOriginKind,
  ContentQuery,
  OriginalAvailability,
} from './library-contracts.js';

export const CONTENT_DURATION_PRESETS = ['under1m', '1mTo5m', '5mTo20m', 'over20m'] as const;
export type ContentDurationPreset = (typeof CONTENT_DURATION_PRESETS)[number];

export const CONTENT_RESOLUTION_PRESETS = ['hd', 'fhd', 'uhd'] as const;
export type ContentResolutionPreset = (typeof CONTENT_RESOLUTION_PRESETS)[number];

export const CONTENT_SIZE_PRESETS = ['under10mb', '10mbTo100mb', 'over100mb'] as const;
export type ContentSizePreset = (typeof CONTENT_SIZE_PRESETS)[number];

export const CONTENT_RECENCY_PRESETS = ['last7', 'last30', 'last365'] as const;
export type ContentRecencyPreset = (typeof CONTENT_RECENCY_PRESETS)[number];

export interface ContentFilterSelection {
  media_kinds: ContentMediaKind[];
  origins: ContentOriginKind[];
  availability: OriginalAvailability[];
  duration: ContentDurationPreset | '';
  resolution: ContentResolutionPreset | '';
  size: ContentSizePreset | '';
  added: ContentRecencyPreset | '';
  published: ContentRecencyPreset | '';
  label_ids: string[];
  linked: ContentLinkedAssetKind[];
}

export const EMPTY_CONTENT_FILTERS: ContentFilterSelection = {
  media_kinds: [],
  origins: [],
  availability: [],
  duration: '',
  resolution: '',
  size: '',
  added: '',
  published: '',
  label_ids: [],
  linked: [],
};

const DAY_MS = 86_400_000;

const DURATION_RANGES: Record<ContentDurationPreset, ContentNumericRange> = {
  under1m: { max: 60_000 },
  '1mTo5m': { min: 60_000, max: 300_000 },
  '5mTo20m': { min: 300_000, max: 1_200_000 },
  over20m: { min: 1_200_000 },
};

const RESOLUTION_RANGES: Record<ContentResolutionPreset, ContentNumericRange> = {
  hd: { min: 720 },
  fhd: { min: 1080 },
  uhd: { min: 2160 },
};

const SIZE_RANGES: Record<ContentSizePreset, ContentNumericRange> = {
  under10mb: { max: 10 * 1024 * 1024 },
  '10mbTo100mb': { min: 10 * 1024 * 1024, max: 100 * 1024 * 1024 },
  over100mb: { min: 100 * 1024 * 1024 },
};

const RECENCY_DAYS: Record<ContentRecencyPreset, number> = {
  last7: 7,
  last30: 30,
  last365: 365,
};

function recency(value: ContentRecencyPreset | '', now: number): ContentNumericRange | undefined {
  return value ? { min: now - RECENCY_DAYS[value] * DAY_MS } : undefined;
}

export type ContentFilterQuery = Pick<
  ContentQuery,
  | 'media_kinds'
  | 'origins'
  | 'availability'
  | 'duration_ms'
  | 'resolution'
  | 'size_bytes'
  | 'added_at'
  | 'published_at'
  | 'label_ids'
  | 'linked'
>;

export function toContentFilterQuery(
  filters: ContentFilterSelection,
  now = Date.now(),
): ContentFilterQuery {
  const ranges: Partial<ContentFilterQuery> = {};
  const duration = filters.duration ? DURATION_RANGES[filters.duration] : undefined;
  if (duration) ranges.duration_ms = duration;
  const resolution = filters.resolution ? RESOLUTION_RANGES[filters.resolution] : undefined;
  if (resolution) ranges.resolution = resolution;
  const size = filters.size ? SIZE_RANGES[filters.size] : undefined;
  if (size) ranges.size_bytes = size;
  const addedAt = recency(filters.added, now);
  if (addedAt) ranges.added_at = addedAt;
  const publishedAt = recency(filters.published, now);
  if (publishedAt) ranges.published_at = publishedAt;
  return {
    ...(filters.media_kinds.length ? { media_kinds: filters.media_kinds } : {}),
    ...(filters.origins.length ? { origins: filters.origins } : {}),
    ...(filters.availability.length ? { availability: filters.availability } : {}),
    ...(filters.label_ids.length ? { label_ids: filters.label_ids } : {}),
    ...(filters.linked.length ? { linked: filters.linked } : {}),
    ...ranges,
  };
}

export function activeContentFilterCount(filters: ContentFilterSelection): number {
  return Object.keys(toContentFilterQuery(filters)).length;
}

export function hasContentFilters(filters: ContentFilterSelection): boolean {
  return activeContentFilterCount(filters) > 0;
}

export function hasPublishedScopedFilter(filters: ContentFilterSelection): boolean {
  return filters.published !== '';
}
