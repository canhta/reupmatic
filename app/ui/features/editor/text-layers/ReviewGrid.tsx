import { Pagination } from '@astryxdesign/core/Pagination';
import { type ColumnWidth, proportional, Table, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ReviewGridColumn<T> {
  key: string;
  header: string;
  render(row: T): React.ReactNode;
  width?: ColumnWidth;
}

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
