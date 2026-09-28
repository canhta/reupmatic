import type {
  DouyinItem,
  DouyinMediaType,
  DouyinQualityTier,
} from './douyin-discovery-contracts.js';

// A facet a candidate cannot answer excludes nothing.

export const DOUYIN_DURATION_PRESETS = ['under1m', '1mTo5m', 'over5m'] as const;
export type DouyinDurationPreset = (typeof DOUYIN_DURATION_PRESETS)[number];

export const DOUYIN_RESOLUTION_PRESETS = ['hd', 'fhd', 'uhd'] as const;
export type DouyinResolutionPreset = (typeof DOUYIN_RESOLUTION_PRESETS)[number];

export const DOUYIN_VIEW_PRESETS = ['1k', '10k', '100k', '1m'] as const;
export type DouyinViewPreset = (typeof DOUYIN_VIEW_PRESETS)[number];

export const DOUYIN_CANDIDATE_SORTS = ['relevance', 'views', 'duration', 'published'] as const;
export type DouyinCandidateSort = (typeof DOUYIN_CANDIDATE_SORTS)[number];

export interface DouyinCandidateQuery {
  media_types: DouyinMediaType[];
  duration: DouyinDurationPreset | '';
  resolution: DouyinResolutionPreset | '';
  min_views: DouyinViewPreset | '';
  sort: DouyinCandidateSort;
}

export const EMPTY_CANDIDATE_QUERY: DouyinCandidateQuery = {
  media_types: [],
  duration: '',
  resolution: '',
  min_views: '',
  sort: 'relevance',
};

export interface DouyinFacetAvailability {
  mediaType: boolean;
  duration: boolean;
  resolution: boolean;
  views: boolean;
}

export interface DouyinCandidateView {
  items: DouyinItem[];
  total: number;
  matched: number;
  facets: DouyinFacetAvailability;
}

const DURATION_RANGES: Record<DouyinDurationPreset, { min?: number; max?: number }> = {
  under1m: { max: 60_000 },
  '1mTo5m': { min: 60_000, max: 300_000 },
  over5m: { min: 300_000 },
};

const RESOLUTION_MIN_HEIGHT: Record<DouyinResolutionPreset, number> = {
  hd: 720,
  fhd: 1080,
  uhd: 2160,
};

const VIEW_MINIMUMS: Record<DouyinViewPreset, number> = {
  '1k': 1_000,
  '10k': 10_000,
  '100k': 100_000,
  '1m': 1_000_000,
};

// Douyin orders the ladder best-first; ties keep the earlier (better-ranked) entry.
export function bestQualityTier(item: DouyinItem): DouyinQualityTier | null {
  const tiers = item.video?.tiers ?? [];
  let best: DouyinQualityTier | null = null;
  for (const tier of tiers) {
    if (!best || (tier.height ?? 0) > (best.height ?? 0)) best = tier;
  }
  return best;
}

export function bestQualityTierIndex(item: DouyinItem): number {
  const tiers = item.video?.tiers ?? [];
  let best = 0;
  let bestHeight = -1;
  for (let index = 0; index < tiers.length; index += 1) {
    const height = tiers[index]?.height ?? 0;
    if (height > bestHeight) {
      bestHeight = height;
      best = index;
    }
  }
  return best;
}

export function candidateDurationMs(item: DouyinItem): number | null {
  const duration = item.video?.durationMs;
  return typeof duration === 'number' ? duration : null;
}

export function candidateHeight(item: DouyinItem): number | null {
  return bestQualityTier(item)?.height ?? null;
}

export function candidateDataSize(item: DouyinItem): number | null {
  return bestQualityTier(item)?.dataSize ?? null;
}

export function candidateViews(item: DouyinItem): number | null {
  const views = item.statistics.playCount;
  // Douyin reports play_count: 0 on every public endpoint; a withheld counter is null, not zero.
  return views !== null && views > 0 ? views : null;
}

export function candidateLikes(item: DouyinItem): number | null {
  return item.statistics.diggCount;
}

function availability(items: DouyinItem[]): DouyinFacetAvailability {
  return {
    mediaType: items.length > 0,
    duration: items.some((item) => candidateDurationMs(item) !== null),
    resolution: items.some((item) => candidateHeight(item) !== null),
    views: items.some((item) => candidateViews(item) !== null),
  };
}

function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a === b ? 0 : (a - b) * direction;
}

export function viewDouyinCandidates(
  items: DouyinItem[],
  query: DouyinCandidateQuery,
): DouyinCandidateView {
  const durationRange = query.duration ? DURATION_RANGES[query.duration] : undefined;
  const minHeight = query.resolution ? RESOLUTION_MIN_HEIGHT[query.resolution] : undefined;
  const minViews = query.min_views ? VIEW_MINIMUMS[query.min_views] : undefined;

  const matched = items.filter((item) => {
    if (query.media_types.length > 0 && !query.media_types.includes(item.mediaType)) return false;
    if (durationRange) {
      const duration = candidateDurationMs(item);
      if (duration !== null) {
        if (durationRange.min !== undefined && duration < durationRange.min) return false;
        if (durationRange.max !== undefined && duration > durationRange.max) return false;
      }
    }
    if (minHeight !== undefined) {
      const height = candidateHeight(item);
      if (height !== null && height < minHeight) return false;
    }
    if (minViews !== undefined) {
      const views = candidateViews(item);
      if (views !== null && views < minViews) return false;
    }
    return true;
  });

  const indexed = matched.map((item, index) => ({ item, index }));
  if (query.sort !== 'relevance') {
    const read =
      query.sort === 'views'
        ? candidateViews
        : query.sort === 'duration'
          ? candidateDurationMs
          : (item: DouyinItem) => item.createTime;
    const direction: 1 | -1 = query.sort === 'duration' ? 1 : -1;
    indexed.sort(
      (a, b) => compareNullable(read(a.item), read(b.item), direction) || a.index - b.index,
    );
  }

  return {
    items: indexed.map((entry) => entry.item),
    total: items.length,
    matched: indexed.length,
    facets: availability(items),
  };
}
