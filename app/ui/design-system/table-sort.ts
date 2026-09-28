import type { TableSortState } from '@astryxdesign/core/Table';

export function toSortQuery<Key extends string>(
  sort: TableSortState<Key>,
): { sort_by?: Key; sort_dir?: 'ascending' | 'descending' } {
  const entry = sort[0];
  return entry ? { sort_by: entry.sortKey, sort_dir: entry.direction } : {};
}
