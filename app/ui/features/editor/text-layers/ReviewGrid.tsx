import { Pagination } from '@astryxdesign/core/Pagination';
import { type ColumnWidth, proportional, Table, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ReviewGridColumn<T> {
  key: string;
  header: string;
  render(row: T): React.ReactNode;
  /** Explicit width; defaults to `proportional(1)`. Astryx truncates every header and a column
   * with no width has no minimum, so a grid narrower than its content collapses to one character
   * per line — give a column an explicit `proportional()`/`pixel()` whenever its header or values
   * need more than the 120px proportional floor. */
  width?: ColumnWidth;
}

/**
 * The one comparison grid every generator's review uses: before/after,
 * source/translated/final, or any other fixed set of columns over a page of
 * cues. It owns only the table and its own pagination; the caller still owns
 * the policy controls and Apply/Discard actions around it.
 */
export function ReviewGrid<T>({
  rows,
  columns,
  rowKey,
  ariaLabel,
  pageSize = 25,
}: {
  rows: T[];
  columns: ReviewGridColumn<T>[];
  rowKey(row: T): string;
  ariaLabel: string;
  pageSize?: number;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const visible = rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
  // Table's data-driven API constrains its row type to `Record<string, unknown>`; wrapping the
  // caller's T keeps this component generic (T may itself be a string or a named interface).
  const data = visible.map((row) => ({ row }));
  const tableColumns: TableColumn<{ row: T }>[] = columns.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width ?? proportional(1),
    renderCell: ({ row }) => (
      <Text type="body" className="rule-comparison-text">
        {column.render(row)}
      </Text>
    ),
  }));
  return (
    <div className="review-grid">
      <Table
        density="compact"
        aria-label={ariaLabel}
        data={data}
        columns={tableColumns}
        idKey={(item) => rowKey(item.row)}
        emptyState={false}
      />
      {rows.length > pageSize && (
        <Pagination
          label={ariaLabel}
          variant="compact"
          size="sm"
          page={clampedPage}
          pageSize={pageSize}
          totalItems={rows.length}
          onChange={setPage}
          pageLabel={t('reviewGridPage')}
        />
      )}
    </div>
  );
}
