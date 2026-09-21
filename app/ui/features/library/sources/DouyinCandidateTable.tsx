import type { TableColumn } from '@astryxdesign/core/Table';
import {
  proportional,
  Table,
  useTablePagination,
  useTableSelection,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  candidateDurationMs,
  candidateHeight,
  candidateLikes,
  candidateViews,
} from '../../../../core/sources/douyin-candidates';
import type { DouyinItem } from '../../../../core/sources/douyin-discovery-contracts';

// Table's data-driven plugins require T extends Record<string, unknown>;
// DouyinItem is a plain named type with no index signature, so it needs this
// wrapper per Table's own documented pattern.
interface CandidateRow extends DouyinItem, Record<string, unknown> {}

const PAGE_SIZE = 25;

interface Props {
  items: DouyinItem[];
  selected: Set<string>;
  /** The exact item the pasted link pointed at, marked in its own row. */
  exactId: string | undefined;
  /** The download state for one candidate, or `undefined` when it is not part of a run. */
  stateOf(awemeId: string): string | undefined;
  onToggle(awemeId: string, checked: boolean): void;
}

/**
 * The Search result list, as the Library's own record table is composed (UI-CM05): Astryx `Table`
 * with selection and pagination plugins, the same compact density and the same "absent value is
 * an em dash, never zero" rule. This is the one working list — the exact item and the channel's
 * videos together — so one selection and one set of filters apply to all of it.
 */
export function DouyinCandidateTable({ items, selected, exactId, stateOf, onToggle }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const rows = items as CandidateRow[];
  const all = items.length > 0 && items.every((item) => selected.has(item.awemeId));

  const columns: TableColumn<CandidateRow>[] = [
    {
      key: 'description',
      header: t('libraryName'),
      width: proportional(3),
      renderCell: (item) => (
        <>
          <Text type="body" maxLines={2}>
            {item.description || item.awemeId}
          </Text>
          {item.awemeId === exactId && <Text type="supporting">{t('douyinSearchExact')}</Text>}
        </>
      ),
    },
    {
      key: 'media_kind',
      header: t('libraryFilterMediaType'),
      width: proportional(1),
      renderCell: (item) => <Text type="body">{t(`libraryFilterMedia_${item.mediaType}`)}</Text>,
    },
    {
      key: 'duration_ms',
      header: t('libraryDuration'),
      width: proportional(1),
      align: 'end',
      renderCell: (item) => {
        const ms = candidateDurationMs(item);
        return ms === null ? (
          <Text type="body">{t('douyinSearchUnavailable')}</Text>
        ) : (
          <Text type="body" className="numeric" hasTabularNumbers>
            {(ms / 1000).toFixed(1)} s
          </Text>
        );
      },
    },
    {
      key: 'resolution',
      header: t('libraryResolution'),
      width: proportional(1),
      align: 'end',
      renderCell: (item) => {
        const height = candidateHeight(item);
        return height === null ? (
          <Text type="body">{t('douyinSearchUnavailable')}</Text>
        ) : (
          <Text type="body" className="numeric" hasTabularNumbers>
            {height}p
          </Text>
        );
      },
    },
    {
      key: 'likes',
      header: t('douyinCandidateLikes'),
      width: proportional(1),
      align: 'end',
      renderCell: (item) => {
        const likes = candidateLikes(item);
        return likes === null ? (
          <Text type="body">{t('douyinSearchUnavailable')}</Text>
        ) : (
          <Text type="body" className="numeric" hasTabularNumbers>
            {new Intl.NumberFormat().format(likes)}
          </Text>
        );
      },
    },
    {
      key: 'views',
      header: t('douyinCandidateViews'),
      width: proportional(1),
      align: 'end',
      renderCell: (item) => {
        const views = candidateViews(item);
        return views === null ? (
          <Text type="body">{t('douyinSearchUnavailable')}</Text>
        ) : (
          <Text type="body" className="numeric" hasTabularNumbers>
            {new Intl.NumberFormat().format(views)}
          </Text>
        );
      },
    },
    {
      key: 'state',
      header: t('douyinCandidateState'),
      width: proportional(1),
      renderCell: (item) => {
        const state = stateOf(item.awemeId);
        return <Text type="body">{state ? t(`douyinDownloadState_${state}`) : '—'}</Text>;
      },
    },
  ];

  const selectionPlugin = useTableSelection<CandidateRow>({
    getIsItemSelected: (item) => selected.has(item.awemeId),
    onSelectItem: ({ item, isSelected }) => onToggle(item.awemeId, isSelected),
    onSelectAll: ({ isAllSelected }) => {
      for (const item of items) onToggle(item.awemeId, isAllSelected);
    },
    getIsAllSelected: () => all,
    getIsIndeterminate: () => !all && selected.size > 0,
    getRowLabel: (item) => item.description || item.awemeId,
  });
  const showPagination = items.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<CandidateRow>({
    page,
    onPageChange: setPage,
    totalItems: items.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });

  return (
    <Table
      density="compact"
      hasHover
      aria-label={t('douyinSearchTitle')}
      idKey="awemeId"
      data={rows}
      columns={columns}
      plugins={{
        selection: selectionPlugin,
        ...(showPagination ? { pagination: paginationPlugin } : {}),
      }}
      emptyState={<Text type="body">{t('douyinSearchNoCandidates')}</Text>}
    />
  );
}
