import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import type { TableColumn, TableSortState } from '@astryxdesign/core/Table';
import {
  proportional,
  Table,
  useTablePagination,
  useTableSortable,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ContentEntry,
  ContentPage,
  ContentSortKey,
} from '../../../core/library/library-contracts';
import { unwrap } from '../../bridge/client';
import { toSortQuery } from '../../design-system/table-sort';

const PAGE_SIZE = 25;

interface ContentRow extends ContentEntry, Record<string, unknown> {}

export function WorkflowInputPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange(ids: string[]): void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<TableSortState<ContentSortKey>>([]);
  const [page, setPage] = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [_generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((current) => current + 1), []);

  useEffect(() => window.reupmatic.onLibraryChanged(refresh), [refresh]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void unwrap(
      window.reupmatic.libraryList({
        search,
        offset,
        limit: PAGE_SIZE,
        // Only video records: a workflow resolves a video source, so others would fail admission.
        media_kinds: ['video'],
        ...toSortQuery(sort),
      }),
    )
      .then((result) => {
        if (current) setPage(result);
      })
      .catch((reason) => {
        if (current) setError(reason instanceof Error ? reason.message : 'LIBRARY_UNAVAILABLE');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [search, offset, sort]);

  const columns: TableColumn<ContentRow>[] = [
    {
      key: 'select',
      header: t('workflowSelect'),
      width: proportional(1),
      renderCell: (item) => (
        <CheckboxInput
          label={t('workflowSelectName', { name: item.name })}
          isLabelHidden
          value={value.includes(item.id)}
          isDisabled={disabled || loading || (!value.includes(item.id) && value.length >= 100)}
          onChange={(checked) =>
            onChange(checked ? [...value, item.id] : value.filter((id) => id !== item.id))
          }
        />
      ),
    },
    {
      key: 'name',
      header: t('catalogName'),
      width: proportional(3),
      sortable: true,
    },
  ];
  const sortPlugin = useTableSortable<ContentRow, ContentSortKey>({
    sort,
    onSortChange: (next) => {
      setSort(next);
      setOffset(0);
    },
  });
  const showPagination = (page?.total ?? 0) > PAGE_SIZE;
  const paginationPlugin = useTablePagination<ContentRow>({
    page: Math.floor(offset / PAGE_SIZE) + 1,
    onPageChange: (next) => setOffset((next - 1) * PAGE_SIZE),
    totalItems: page?.total ?? 0,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });

  return (
    <VStack gap={3}>
      <Heading level={5}>{t('workflowInputs')}</Heading>
      <Toolbar
        label={t('workflowInputs')}
        size="sm"
        startContent={
          <TextInput
            label={t('librarySearch')}
            isLabelHidden
            placeholder={t('librarySearch')}
            startIcon="search"
            hasClear
            value={search}
            isDisabled={disabled}
            onChange={(text) => {
              setSearch(text);
              setOffset(0);
            }}
          />
        }
        endContent={
          <Text type="supporting">{t('workflowSelection', { count: value.length })}</Text>
        }
      />
      <Text as="p" type="supporting">
        {t('workflowInputHelp')}
      </Text>
      {loading && (
        <Text as="p" type="body" role="status">
          {t('libraryLoading')}
        </Text>
      )}
      {error && (
        <Banner
          status="error"
          title={t('catalogError')}
          description={<code>{error}</code>}
          endContent={<Button label={t('retryLoad')} onClick={refresh} />}
        />
      )}
      {!loading && page?.items.length === 0 && !search && (
        <EmptyState isCompact title={t('workflowNoInputs')} />
      )}
      {!loading && page?.items.length === 0 && !!search && (
        <EmptyState
          isCompact
          title={t('workflowNoInputs')}
          actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
        />
      )}
      {page && page.items.length > 0 && (
        <div className="business-table">
          <Table
            density="compact"
            aria-label={t('workflowInputs')}
            idKey="id"
            data={page.items as ContentRow[]}
            columns={columns}
            plugins={{
              sort: sortPlugin,
              ...(showPagination ? { pagination: paginationPlugin } : {}),
            }}
          />
        </div>
      )}
      <div className="business-pagination">
        <Button
          label={t('workflowClearSelection')}
          isDisabled={disabled || !value.length}
          onClick={() => onChange([])}
        />
      </div>
    </VStack>
  );
}
