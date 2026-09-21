import type { TableSortState } from '@astryxdesign/core/Table';

/**
 * Every paged-query contract carries at most one active sort as `{sort_by, sort_dir}`; Astryx's
 * `TableSortState` carries the same fact as a one-entry array. One place converts between them
 * instead of each table-backed list re-deriving `sort[0]?.sortKey`/`sort[0]?.direction`.
 */
export function toSortQuery<Key extends string>(
  sort: TableSortState<Key>,
): { sort_by?: Key; sort_dir?: 'ascending' | 'descending' } {
  const entry = sort[0];
  return entry ? { sort_by: entry.sortKey, sort_dir: entry.direction } : {};
}
