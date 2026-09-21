import { requestEnumList, requestNumericRange } from './content-filter-input.js';
import type { ContentLinkedAssetKind, ContentQuery } from './library-contracts.js';
import {
  CONTENT_AVAILABILITY_STATES,
  CONTENT_LINKED_ASSET_KINDS,
  CONTENT_MEDIA_KINDS,
  CONTENT_ORIGIN_KINDS,
} from './library-contracts.js';

/**
 * The query keys `LibraryStore` itself reads. `label_ids` is not one of them: labels belong to
 * `app/core/taxonomy`, and `ContentLibrary` resolves them to content ids before the store runs,
 * so the store refuses the key rather than accepting and ignoring it.
 */
export type ContentStoreQuery = Omit<ContentQuery, 'label_ids'>;

function placeholders(count: number): string {
  return new Array(count).fill('?').join(',');
}

/**
 * Builds the one WHERE the count and the page share. Never interpolates a user value: every
 * value is bound, and every column/key is chosen here rather than passed through.
 *
 * Two degradation rules live here, both required by the mixed Library:
 * - a facet not every kind carries (`duration_ms` for video/audio, `resolution` for video only)
 *   keeps every row that cannot answer it;
 * - an optional facet (`published_at`) keeps every row that has no value for it.
 * A range a row cannot answer excludes nothing, so an empty page never reads as "none are
 * popular" when it means "we do not have that number".
 */
export function contentWhere(
  query: ContentStoreQuery,
  contentIds?: readonly string[],
): { where: string; values: (string | number)[] } {
  const clauses: string[] = ["removed_at IS NULL AND name LIKE ? ESCAPE '\\'"];
  const values: (string | number)[] = [`%${query.search.replace(/[\\%_]/g, '\\$&')}%`];

  const mediaKinds = requestEnumList(query.media_kinds, CONTENT_MEDIA_KINDS);
  if (mediaKinds) {
    clauses.push(`media_kind IN (${placeholders(mediaKinds.length)})`);
    values.push(...mediaKinds);
  }
  const origins = requestEnumList(query.origins, CONTENT_ORIGIN_KINDS);
  if (origins) {
    clauses.push(`origin_kind IN (${placeholders(origins.length)})`);
    values.push(...origins);
  }
  const availability = requestEnumList(query.availability, CONTENT_AVAILABILITY_STATES);
  if (availability) {
    clauses.push(`availability IN (${placeholders(availability.length)})`);
    values.push(...availability);
  }
  const linked = requestEnumList<ContentLinkedAssetKind>(query.linked, CONTENT_LINKED_ASSET_KINDS);
  if (linked) {
    clauses.push(
      `EXISTS (SELECT 1 FROM library_links lk WHERE lk.item_id = library_items.id AND lk.kind IN (${placeholders(linked.length)}))`,
    );
    values.push(...linked);
  }

  const sizeBytes = requestNumericRange(query.size_bytes);
  if (sizeBytes) {
    if (sizeBytes.min !== undefined) {
      clauses.push('size_bytes >= ?');
      values.push(sizeBytes.min);
    }
    if (sizeBytes.max !== undefined) {
      clauses.push('size_bytes <= ?');
      values.push(sizeBytes.max);
    }
  }
  const addedAt = requestNumericRange(query.added_at);
  if (addedAt) {
    if (addedAt.min !== undefined) {
      clauses.push('added_at >= ?');
      values.push(addedAt.min);
    }
    if (addedAt.max !== undefined) {
      clauses.push('added_at <= ?');
      values.push(addedAt.max);
    }
  }

  const duration = requestNumericRange(query.duration_ms);
  if (duration) {
    const bounds: string[] = [];
    if (duration.min !== undefined) {
      bounds.push('duration_ms >= ?');
      values.push(duration.min);
    }
    if (duration.max !== undefined) {
      bounds.push('duration_ms <= ?');
      values.push(duration.max);
    }
    // Video and audio carry a duration; every other kind answers the facet with "unknown" and
    // must survive it rather than be read as zero.
    clauses.push(`(media_kind NOT IN ('video','audio') OR (${bounds.join(' AND ')}))`);
  }
  const resolution = requestNumericRange(query.resolution);
  if (resolution) {
    const bounds: string[] = [];
    if (resolution.min !== undefined) {
      bounds.push('min(width, height) >= ?');
      values.push(resolution.min);
    }
    if (resolution.max !== undefined) {
      bounds.push('min(width, height) <= ?');
      values.push(resolution.max);
    }
    clauses.push(`(media_kind <> 'video' OR (${bounds.join(' AND ')}))`);
  }
  const publishedAt = requestNumericRange(query.published_at);
  if (publishedAt) {
    const bounds: string[] = [];
    if (publishedAt.min !== undefined) {
      bounds.push('published_at >= ?');
      values.push(publishedAt.min);
    }
    if (publishedAt.max !== undefined) {
      bounds.push('published_at <= ?');
      values.push(publishedAt.max);
    }
    clauses.push(`(published_at IS NULL OR (${bounds.join(' AND ')}))`);
  }

  if (contentIds !== undefined) {
    if (contentIds.length === 0) clauses.push('0 = 1');
    else {
      clauses.push(`id IN (${placeholders(contentIds.length)})`);
      values.push(...contentIds);
    }
  }
  return { where: clauses.join(' AND '), values };
}
