import type { ProjectMedia } from '../../editing/project-media.js';
import {
  requestEnumList,
  requestLabelIds,
  requestNumericRange,
} from '../../library/content-filter-input.js';
import type {
  ContentAsset,
  ContentAssetKind,
  ContentAssetPage,
  ContentAssetPreview,
  ContentAssetQuery,
  ContentDependencies,
  ContentEntry,
  ContentLinkedAssetKind,
  ContentPage,
  ContentQuery,
  OriginalAvailability,
  OriginalImportOptions,
  OriginalImportResult,
} from '../../library/library-contracts.js';
import {
  CONTENT_ASSET_SORT_KEYS,
  CONTENT_AVAILABILITY_STATES,
  CONTENT_FILTER_KEYS,
  CONTENT_LINKED_ASSET_KINDS,
  CONTENT_MEDIA_KINDS,
  CONTENT_ORIGIN_KINDS,
  CONTENT_QUERY_SORT_DIRECTIONS,
  CONTENT_SORT_KEYS,
} from '../../library/library-contracts.js';
import type { PublicVideo } from '../../media/media-contracts.js';
import type { EditorSnapshot } from '../../projects/project.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

function requestOptionalId(value: unknown): string | undefined {
  return value === undefined ? undefined : requestId(value);
}

export const libraryOperations = {
  'library-list': operation<ContentQuery, ContentPage>()({
    rendererMethod: 'libraryList',
    validate: (input) => {
      const value = requestRecord(input, [
        'search',
        'offset',
        'limit',
        'sort_by',
        'sort_dir',
        ...CONTENT_FILTER_KEYS,
      ]);
      if (
        typeof value.search !== 'string' ||
        typeof value.offset !== 'number' ||
        typeof value.limit !== 'number' ||
        (value.sort_by !== undefined &&
          !(CONTENT_SORT_KEYS as readonly string[]).includes(String(value.sort_by))) ||
        (value.sort_dir !== undefined &&
          !(CONTENT_QUERY_SORT_DIRECTIONS as readonly string[]).includes(String(value.sort_dir)))
      )
        throw new Error('INVALID_REQUEST');
      const query: ContentQuery = {
        search: value.search,
        offset: Number(value.offset),
        limit: Number(value.limit),
      };
      if (value.sort_by !== undefined) query.sort_by = value.sort_by as ContentQuery['sort_by'];
      if (value.sort_dir !== undefined) query.sort_dir = value.sort_dir as ContentQuery['sort_dir'];
      const mediaKinds = requestEnumList(value.media_kinds, CONTENT_MEDIA_KINDS);
      if (mediaKinds) query.media_kinds = mediaKinds;
      const origins = requestEnumList(value.origins, CONTENT_ORIGIN_KINDS);
      if (origins) query.origins = origins;
      const availability = requestEnumList(value.availability, CONTENT_AVAILABILITY_STATES);
      if (availability) query.availability = availability;
      const linked = requestEnumList<ContentLinkedAssetKind>(
        value.linked,
        CONTENT_LINKED_ASSET_KINDS,
      );
      if (linked) query.linked = linked;
      for (const key of [
        'duration_ms',
        'resolution',
        'size_bytes',
        'added_at',
        'published_at',
      ] as const) {
        const range = requestNumericRange(value[key]);
        if (range) query[key] = range;
      }
      const labelIds = requestLabelIds(value.label_ids);
      if (labelIds) query.label_ids = labelIds;
      return query;
    },
  }),
  'library-import': operation<OriginalImportOptions, OriginalImportResult | null>()({
    rendererMethod: 'libraryImport',
    validate: (input) => {
      const value = requestRecord(input, ['mode', 'duplicates']);
      if (
        (value.mode !== 'reference' && value.mode !== 'copy') ||
        (value.duplicates !== 'reuse' && value.duplicates !== 'separate')
      )
        throw new Error('INVALID_REQUEST');
      return { mode: value.mode, duplicates: value.duplicates };
    },
  }),
  'library-cancel-import': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'libraryCancelImport',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'library-open': operation<{ item_id: string }, PublicVideo>()({
    rendererMethod: 'libraryOpen',
    validate: (input) => ({ item_id: requestId(requestRecord(input, ['item_id']).item_id) }),
    toRequest: (id: string) => ({ item_id: id }),
  }),
  'library-add-media': operation<{ item_id: string }, ProjectMedia>()({
    rendererMethod: 'libraryAddMedia',
    validate: (input) => ({ item_id: requestId(requestRecord(input, ['item_id']).item_id) }),
    toRequest: (id: string) => ({ item_id: id }),
  }),
  'library-open-project': operation<
    { item_id: string; link_id: string },
    { media: PublicVideo; snapshot: EditorSnapshot; project_path?: string } | null
  >()({
    rendererMethod: 'libraryOpenProject',
    validate: (input) => {
      const value = requestRecord(input, ['item_id', 'link_id']);
      return { item_id: requestId(value.item_id), link_id: requestId(value.link_id) };
    },
    toRequest: (itemId: string, linkId: string) => ({ item_id: itemId, link_id: linkId }),
  }),
  'library-relink': operation<{ item_id: string }, ContentEntry | null>()({
    rendererMethod: 'libraryRelink',
    validate: (input) => ({ item_id: requestId(requestRecord(input, ['item_id']).item_id) }),
    toRequest: (id: string) => ({ item_id: id }),
  }),
  'library-dependencies': operation<{ item_id: string }, ContentDependencies>()({
    rendererMethod: 'libraryDependencies',
    validate: (input) => ({ item_id: requestId(requestRecord(input, ['item_id']).item_id) }),
    toRequest: (id: string) => ({ item_id: id }),
  }),
  'library-forget': operation<{ item_id: string }, { removed: boolean }>()({
    rendererMethod: 'libraryForget',
    validate: (input) => ({ item_id: requestId(requestRecord(input, ['item_id']).item_id) }),
    toRequest: (id: string) => ({ item_id: id }),
  }),
  'library-reveal': operation<{ item_id: string; link_id?: string }, { revealed: boolean }>()({
    rendererMethod: 'libraryReveal',
    validate: (input) => {
      const value = requestRecord(input, ['item_id', 'link_id']);
      return { item_id: requestId(value.item_id), link_id: requestOptionalId(value.link_id) };
    },
    toRequest: (itemId: string, linkId?: string) => ({
      item_id: itemId,
      ...(linkId ? { link_id: linkId } : {}),
    }),
  }),
  'library-assets': operation<ContentAssetQuery, ContentAssetPage>()({
    rendererMethod: 'libraryAssets',
    validate: (input) => {
      const value = requestRecord(input, [
        'kind',
        'search',
        'offset',
        'limit',
        'item_id',
        'sort_by',
        'sort_dir',
      ]);
      if (
        !['all', 'project', 'subtitle', 'export', 'audio'].includes(String(value.kind)) ||
        typeof value.search !== 'string' ||
        typeof value.offset !== 'number' ||
        typeof value.limit !== 'number' ||
        (value.sort_by !== undefined &&
          !(CONTENT_ASSET_SORT_KEYS as readonly string[]).includes(String(value.sort_by))) ||
        (value.sort_dir !== undefined &&
          !(CONTENT_QUERY_SORT_DIRECTIONS as readonly string[]).includes(String(value.sort_dir)))
      )
        throw new Error('INVALID_REQUEST');
      return {
        kind: value.kind as ContentAssetQuery['kind'],
        search: value.search,
        offset: Number(value.offset),
        limit: Number(value.limit),
        ...(value.item_id !== undefined ? { item_id: requestOptionalId(value.item_id) } : {}),
        ...(value.sort_by !== undefined
          ? { sort_by: value.sort_by as ContentAssetQuery['sort_by'] }
          : {}),
        ...(value.sort_dir !== undefined
          ? { sort_dir: value.sort_dir as ContentAssetQuery['sort_dir'] }
          : {}),
      };
    },
  }),
  'library-asset-attach': operation<
    { item_id: string; kind: ContentAssetKind },
    ContentAsset | null
  >()({
    rendererMethod: 'libraryAssetAttach',
    validate: (input) => {
      const value = requestRecord(input, ['item_id', 'kind']);
      const kind = value.kind as ContentAssetKind;
      if (!['project', 'subtitle', 'export', 'audio'].includes(kind))
        throw new Error('INVALID_REQUEST');
      return { item_id: requestId(value.item_id), kind };
    },
  }),
  'library-asset-check': operation<
    { item_id: string; link_id: string },
    { availability: OriginalAvailability }
  >()({
    rendererMethod: 'libraryAssetCheck',
    validate: (input) => {
      const value = requestRecord(input, ['item_id', 'link_id']);
      return { item_id: requestId(value.item_id), link_id: requestId(value.link_id) };
    },
  }),
  'library-asset-preview': operation<{ item_id: string; link_id: string }, ContentAssetPreview>()({
    rendererMethod: 'libraryAssetPreview',
    validate: (input) => {
      const value = requestRecord(input, ['item_id', 'link_id']);
      return { item_id: requestId(value.item_id), link_id: requestId(value.link_id) };
    },
  }),
} as const;
