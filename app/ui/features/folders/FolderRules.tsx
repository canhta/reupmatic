import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import type { PowerSearchFilter } from '@astryxdesign/core/PowerSearch';
import { usePowerSearchConfig } from '@astryxdesign/core/PowerSearch';
import { Section } from '@astryxdesign/core/Section';
import type { TableColumn } from '@astryxdesign/core/Table';
import {
  paginateData,
  pixel,
  proportional,
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
import type { FolderRuleView, FolderSnapshot } from '../../../core/folders/folder-contracts';
import { processingSummaryKey } from '../processing/message-key';
import { folderErrorKey } from './errors';

const PAGE_SIZE = 25;
const STATES: FolderRuleView['state'][] = ['watching', 'scanning', 'needs_attention', 'paused'];

// Table's data-driven plugins require T extends Record<string, unknown>;
// FolderRuleView is a plain named type with no index signature, so it needs
// this wrapper per Table's own documented pattern.
interface FolderRuleRow extends FolderRuleView, Record<string, unknown> {}

interface Props {
  snapshot: FolderSnapshot;
  busy: boolean;
  onControl: (id: string, command: 'start' | 'pause') => Promise<void>;
}

export function FolderRules({ snapshot, busy, onControl }: Props) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const all = snapshot.rules as FolderRuleRow[];
  const searched = search
    ? all.filter((rule) =>
        `${rule.source_name} ${rule.output_name}`.toLowerCase().includes(search.toLowerCase()),
      )
    : all;

  const stateFields = useMemo(
    () =>
      [
        {
          key: 'state',
          type: 'enum',
          label: t('batchState'),
          enumValues: STATES.map((value) => ({ value, label: t(`folderState_${value}`) })),
        },
      ] as const,
    [t],
  );
  const { config: filterConfig, applyFilters } = usePowerSearchConfig(stateFields);
  const { filters, onFilterChange } = useTableFilterState();
  const filterPlugin = useTableFiltering<FolderRuleRow>({
    filters,
    onFilterChange,
    searchConfig: filterConfig,
  });

  // Not memoized: onControl closes over per-render state, and re-deriving
  // three column defs each render is cheap.
  const columns: TableColumn<FolderRuleRow>[] = [
    {
      key: 'source_name',
      header: t('folderRoute'),
      width: proportional(2),
      sortable: true,
      renderCell: (rule) => (
        <>
          <strong className="folder-path">{rule.source_name}</strong>
          <Text type="body" className="folder-path">
            {t('folderTo', { folder: rule.output_name })}
          </Text>
          {rule.processing && <small>{t(processingSummaryKey(rule.processing))}</small>}
          <small>
            {t(rule.include_existing ? 'folderAllExisting' : 'folderNewOnly')}
            {rule.recursive ? ` · ${t('folderRecursive')}` : ''}
          </small>
        </>
      ),
    },
    {
      key: 'state',
      header: t('batchState'),
      width: proportional(2),
      sortable: true,
      filter: 'state',
      renderCell: (rule) => (
        <>
          <Text type="body">{t(`folderState_${rule.state}`)}</Text>
          {rule.last_scan !== null && (
            <small>
              {t('folderLastScan', {
                time: new Date(rule.last_scan).toLocaleTimeString(i18n.language),
              })}
            </small>
          )}
          {rule.error_code && (
            <Text as="p" type="body" className="inline-error">
              {t(folderErrorKey(rule.error_code))} <code>{rule.error_code}</code>
              {rule.error_file && <small>{rule.error_file}</small>}
            </Text>
          )}
        </>
      ),
    },
    {
      key: 'admitted',
      header: t('folderAdmitted'),
      width: proportional(1),
      sortable: true,
      align: 'end',
      renderCell: (rule) => (
        <Text type="body" className="numeric" hasTabularNumbers>
          {rule.admitted}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: t('batchActions'),
      width: pixel(160),
      resizable: false,
      renderCell: (rule) => (
        <Button
          label={t(rule.state === 'paused' ? 'folderStart' : 'folderPause')}
          isDisabled={busy || (rule.state === 'paused' && !snapshot.available)}
          onClick={(event) => {
            event.stopPropagation();
            void onControl(rule.id, rule.state === 'paused' ? 'start' : 'pause');
          }}
        />
      ),
    },
  ];

  const filtered = applyFilters(
    toSearchFilters(filters, columns, filterConfig) as PowerSearchFilter[],
    searched,
  );
  const { sortedData, sortConfig } = useTableSortableState<FolderRuleRow>({ data: filtered });
  const sortPlugin = useTableSortable<FolderRuleRow>(sortConfig);
  const showPagination = sortedData.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<FolderRuleRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  const pageData = showPagination ? paginateData(sortedData, page, PAGE_SIZE) : sortedData;

  return (
    <Section
      variant="transparent"
      padding={0}
      className="folder-rules"
      aria-labelledby="folder-rules-title"
    >
      <div className="workspace-heading">
        <Heading level={5} id="folder-rules-title">
          {t('folderRules')}
        </Heading>
        <Text type="body" className="count-label" hasTabularNumbers>
          {snapshot.rules.length}
        </Text>
      </div>
      {snapshot.queue_paused && snapshot.rules.some((rule) => rule.state !== 'paused') && (
        <Banner status="warning" title={t('folderQueuePaused')} />
      )}
      {!all.length ? (
        <EmptyState title={t('folderEmptyTitle')} description={t('folderEmptyBody')} />
      ) : (
        <div className="folder-scroll">
          <Toolbar
            label={t('folderRules')}
            size="sm"
            startContent={
              <TextInput
                label={t('catalogSearch')}
                isLabelHidden
                placeholder={t('folderSearchPlaceholder')}
                startIcon="search"
                hasClear
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />
            }
          />
          <Table
            density="compact"
            verticalAlign="top"
            aria-label={t('folderRules')}
            idKey="id"
            data={pageData}
            columns={columns}
            plugins={{
              sort: sortPlugin,
              filter: filterPlugin,
              ...(showPagination ? { pagination: paginationPlugin } : {}),
            }}
            emptyState={
              <EmptyState
                title={t('folderNoMatches')}
                actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
              />
            }
          />
        </div>
      )}
      <Text as="p" type="supporting">
        {t('folderLifecycle')}
      </Text>
    </Section>
  );
}
