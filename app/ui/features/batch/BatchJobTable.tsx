import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import type { PowerSearchFilter } from '@astryxdesign/core/PowerSearch';
import { usePowerSearchConfig } from '@astryxdesign/core/PowerSearch';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import type { BodyRowRenderProps, TableColumn, TablePlugin } from '@astryxdesign/core/Table';
import {
  paginateData,
  Table,
  toSearchFilters,
  useTableFiltering,
  useTableFilterState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BatchItemView, BatchState } from '../../../core/batch/batch-contracts';
import { processingSummaryKey } from '../processing/message-key';
import { batchErrorKey } from './errors';

const PAGE_SIZE = 25;
const STATES: BatchState[] = [
  'queued',
  'running',
  'cancelling',
  'interrupted',
  'complete',
  'failed',
  'cancelled',
];

// Table's data-driven plugins require T extends Record<string, unknown>;
// BatchItemView is a plain named type with no index signature, so it needs
// this wrapper per Table's own documented pattern.
interface BatchRow extends BatchItemView, Record<string, unknown> {}

interface Props {
  items: BatchItemView[];
  busy: boolean;
  onControl: (command: 'cancel' | 'retry' | 'reveal', id: string) => Promise<void>;
}

export function BatchJobTable({ items, busy, onControl }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const all = items as BatchRow[];
  const searched = search
    ? all.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : all;

  const stateFields = useMemo(
    () =>
      [
        {
          key: 'state',
          type: 'enum',
          label: t('batchState'),
          enumValues: STATES.map((value) => ({ value, label: t(`batchState_${value}`) })),
        },
      ] as const,
    [t],
  );
  const { config: filterConfig, applyFilters } = usePowerSearchConfig(stateFields);
  const { filters, onFilterChange } = useTableFilterState();
  const filterPlugin = useTableFiltering<BatchRow>({
    filters,
    onFilterChange,
    searchConfig: filterConfig,
  });

  // Not memoized: onControl closes over per-render state, and re-deriving
  // three column defs each render is cheap.
  //
  // No explicit column `width`: this table only ever renders inside the
  // ~400px JobsTray sidebar (standalone or nested in a RunHistory row), far
  // narrower than proportional()'s 120px-per-column minimum can fit across
  // four+ columns — that minimum forced permanent horizontal scroll that hid
  // the Actions column entirely. Omitting width lets columns size to content
  // the way the original manual table did. Attempts folds into the State
  // cell rather than staying a separate sortable column for the same
  // width reason.
  const columns: TableColumn<BatchRow>[] = [
    {
      key: 'name',
      header: t('batchVideo'),
      sortable: true,
      renderCell: (item) => (
        <div className="queue-file">
          {item.name}
          {item.processing && <small>{t(processingSummaryKey(item.processing))}</small>}
          {item.subtitle_name && <small>{item.subtitle_name}</small>}
          {item.output_name && <small>{item.output_name}</small>}
        </div>
      ),
    },
    {
      key: 'state',
      header: t('batchState'),
      sortable: true,
      filter: 'state',
      renderCell: (item) => (
        <div className="queue-file">
          <Text type="body">{t(`batchState_${item.state}`)}</Text>
          <small className="numeric">
            {t('batchAttempt')}: {item.attempt}
          </small>
          {item.state === 'running' && item.progress && (
            <ProgressBar
              label={t(
                item.progress.phase.startsWith('processing')
                  ? item.progress.phase
                  : `batchPhase_${item.progress.phase}`,
              )}
              max={1}
              value={item.progress.fraction ?? undefined}
              isIndeterminate={item.progress.fraction === null}
            />
          )}
          {item.error_code && (
            <Text as="p" type="body" className="inline-error">
              {t(batchErrorKey(item.error_code))} <code>{item.error_code}</code>
            </Text>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: t('batchActions'),
      resizable: false,
      renderCell: (item) => (
        <div className="action-row">
          {['queued', 'running', 'interrupted'].includes(item.state) && (
            <Button
              label={t('cancel')}
              isDisabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void onControl('cancel', item.id);
              }}
            />
          )}
          {['failed', 'cancelled', 'interrupted'].includes(item.state) && (
            <Button
              label={t('batchRetry')}
              isDisabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void onControl('retry', item.id);
              }}
            />
          )}
          {item.state === 'complete' && (
            <Button
              label={t('batchShowOutput')}
              isDisabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void onControl('reveal', item.id);
              }}
            />
          )}
        </div>
      ),
    },
  ];

  const filtered = applyFilters(
    toSearchFilters(filters, columns, filterConfig) as PowerSearchFilter[],
    searched,
  );
  // No defaultSort: the queue's own admission/position order is the sensible
  // default, not an alphabetical one; sorting only kicks in once the user
  // clicks a header.
  const { sortedData, sortConfig } = useTableSortableState<BatchRow>({ data: filtered });
  const sortPlugin = useTableSortable<BatchRow>(sortConfig);
  // batch.test.mjs and folder.test.mjs locate rows by these data attributes
  // (e.g. waiting for a job to reach `[data-state="complete"]`); Table's
  // data-driven rows have no built-in per-row data-attribute prop, so a
  // local plugin adds them the same way LibraryTable's rowOpenPlugin does.
  const rowAttributesPlugin: TablePlugin<BatchRow> = {
    transformBodyRow: (props: BodyRowRenderProps, item) => ({
      ...props,
      htmlProps: {
        ...props.htmlProps,
        'data-job-id': item.id,
        'data-state': item.state,
      },
    }),
  };
  const showPagination = sortedData.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<BatchRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  const pageData = showPagination ? paginateData(sortedData, page, PAGE_SIZE) : sortedData;

  if (!items.length) {
    return <EmptyState isCompact title={t('batchEmpty')} description={t('batchDraftNote')} />;
  }
  return (
    <div className="batch-scroll">
      <Toolbar
        label={t('batchQueue')}
        size="sm"
        startContent={
          <TextInput
            label={t('catalogSearch')}
            isLabelHidden
            placeholder={t('batchSearchPlaceholder')}
            startIcon="search"
            hasClear
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        }
        endContent={
          <Text type="supporting">{t('batchJobsCount', { count: sortedData.length })}</Text>
        }
      />
      <Table
        density="compact"
        verticalAlign="top"
        aria-label={t('batchQueue')}
        idKey="id"
        data={pageData}
        columns={columns}
        plugins={{
          sort: sortPlugin,
          filter: filterPlugin,
          rowAttributes: rowAttributesPlugin,
          ...(showPagination ? { pagination: paginationPlugin } : {}),
        }}
        emptyState={
          <EmptyState
            isCompact
            title={t('batchNoMatches')}
            actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
          />
        }
      />
    </div>
  );
}
