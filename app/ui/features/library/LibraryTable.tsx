import { Badge } from '@astryxdesign/core/Badge';
import type { ContextMenuOption } from '@astryxdesign/core/ContextMenu';
import { ContextMenu } from '@astryxdesign/core/ContextMenu';
import type {
  BodyRowRenderProps,
  TableColumn,
  TablePlugin,
  TableSortState,
} from '@astryxdesign/core/Table';
import {
  pixel,
  proportional,
  Table,
  useTablePagination,
  useTableSelection,
  useTableSortable,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ContentEntry,
  type ContentSortKey,
  contentDurationMs,
} from '../../../core/library/library-contracts';
import { formatFileSize } from './format';
import { LibraryCover } from './LibraryCover';

interface ContentRow extends ContentEntry, Record<string, unknown> {}

const PAGE_SIZE = 25;

interface Props {
  items: ContentEntry[];
  selected: Set<string>;
  disabled: boolean;
  sort: TableSortState<ContentSortKey>;
  page: number;
  totalItems: number;
  labelNames: Map<string, string>;
  labelsByContent: Map<string, string[]>;
  onToggle(id: string, checked: boolean): void;
  onSelectPage(checked: boolean): void;
  onDetails(id: string): void;
  onSortChange(sort: TableSortState<ContentSortKey>): void;
  onPageChange(page: number): void;
  contextCommands(item: ContentEntry, scope: 'row' | 'selection'): ContextMenuOption[];
}

export function LibraryTable({
  items,
  selected,
  disabled,
  sort,
  page,
  totalItems,
  labelNames,
  labelsByContent,
  onToggle,
  onSelectPage,
  onDetails,
  onSortChange,
  onPageChange,
  contextCommands,
}: Props) {
  const { t, i18n } = useTranslation();
  const [target, setTarget] = useState<string | undefined>(undefined);
  const rows = items as ContentRow[];
  const all = items.length > 0 && items.every((item) => selected.has(item.id));

  const columns: TableColumn<ContentRow>[] = [
    {
      key: 'cover',
      header: t('libraryCover'),
      width: pixel(76),
      renderCell: (item) => <LibraryCover item={item} />,
    },
    {
      key: 'name',
      header: t('libraryName'),
      width: proportional(3),
      sortable: true,
      renderCell: (item) => (
        <Text type="body" className="library-file-name">
          {item.name}
        </Text>
      ),
    },
    {
      key: 'media_kind',
      header: t('libraryFilterMediaType'),
      width: proportional(1),
      renderCell: (item) => <Text type="body">{t(`libraryFilterMedia_${item.media_kind}`)}</Text>,
    },
    {
      key: 'duration_ms',
      header: t('libraryDuration'),
      width: proportional(1),
      sortable: true,
      align: 'end',
      renderCell: (item) => {
        const duration = contentDurationMs(item);
        return duration === null ? (
          <Text type="body">—</Text>
        ) : (
          <Text type="body" className="numeric" hasTabularNumbers>
            {(duration / 1000).toFixed(2)} s
          </Text>
        );
      },
    },
    {
      key: 'resolution',
      header: t('libraryResolution'),
      width: proportional(1),
      align: 'end',
      renderCell: (item) =>
        item.video ? (
          <Text type="body" className="numeric" hasTabularNumbers>
            {item.video.width}×{item.video.height}
          </Text>
        ) : (
          <Text type="body">—</Text>
        ),
    },
    {
      key: 'size_bytes',
      header: t('libraryFileSize'),
      width: proportional(1),
      align: 'end',
      renderCell: (item) => (
        <Text type="body" className="numeric" hasTabularNumbers>
          {formatFileSize(item.size_bytes, i18n.language)}
        </Text>
      ),
    },
    {
      key: 'added_at',
      header: t('libraryImported'),
      width: proportional(1),
      sortable: true,
      align: 'end',
      renderCell: (item) => (
        <Timestamp value={new Date(item.added_at).toISOString()} format="date" />
      ),
    },
    {
      key: 'availability',
      header: t('libraryStatus'),
      width: proportional(1),
      sortable: true,
      renderCell: (item) =>
        item.availability === 'missing' || item.availability === 'changed' ? (
          <Badge
            variant={item.availability === 'missing' ? 'error' : 'warning'}
            label={t(`libraryAvailability_${item.availability}`)}
          />
        ) : (
          t(`libraryAvailability_${item.availability}`)
        ),
    },
    {
      key: 'labels',
      header: t('libraryLabels'),
      width: proportional(2),
      renderCell: (item) => {
        const names = (labelsByContent.get(item.id) ?? [])
          .map((id) => labelNames.get(id))
          .filter((name): name is string => Boolean(name));
        return names.length > 0 ? (
          <Text type="body" maxLines={1}>
            {names.join(', ')}
          </Text>
        ) : (
          <Text type="body">—</Text>
        );
      },
    },
    {
      key: 'links',
      header: t('libraryRelated'),
      width: proportional(1),
      align: 'end',
      renderCell: (item) => (
        <Text type="body" className="numeric" hasTabularNumbers>
          {item.links.length}
        </Text>
      ),
    },
  ];

  const selectionPlugin = useTableSelection<ContentRow>({
    getIsItemSelected: (item) => selected.has(item.id),
    onSelectItem: ({ item, isSelected }) => onToggle(item.id, isSelected),
    onSelectAll: ({ isAllSelected }) => onSelectPage(isAllSelected),
    getIsAllSelected: () => all,
    getIsIndeterminate: () => !all && selected.size > 0,
    getRowLabel: (item) => item.name,
  });
  const sortPlugin = useTableSortable<ContentRow, ContentSortKey>({
    sort,
    onSortChange,
  });
  const showPagination = totalItems > PAGE_SIZE;
  const paginationPlugin = useTablePagination<ContentRow>({
    page,
    onPageChange,
    totalItems,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  // Table's data-driven columns have no row-click prop, so a local plugin restores it.
  const rowOpenPlugin: TablePlugin<ContentRow> = {
    transformBodyRow: (props: BodyRowRenderProps, item) => ({
      ...props,
      htmlProps: {
        ...props.htmlProps,
        className: ['library-row', props.htmlProps.className].filter(Boolean).join(' '),
        tabIndex: 0,
        'aria-label': item.name,
        // Ignore clicks on interactive controls: the selection checkbox has no stopPropagation of its own.
        onClick: (event: MouseEvent<HTMLTableRowElement>) => {
          if ((event.target as HTMLElement | null)?.closest('input, button, a')) return;
          onDetails(item.id);
        },
        onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
          if (event.key !== 'Enter' || disabled) return;
          if ((event.target as HTMLElement | null)?.closest('input, button, a')) return;
          event.preventDefault();
          onDetails(item.id);
        },
      },
    }),
  };

  const targeted = items.find((item) => item.id === target);
  const scope: 'row' | 'selection' =
    targeted && selected.has(targeted.id) && selected.size > 1 ? 'selection' : 'row';

  // Resolve the right-clicked row in the capture phase, before ContextMenu decides to open.
  function captureTarget(event: MouseEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement | null)?.closest('tr.library-row');
    const label = row?.getAttribute('aria-label');
    setTarget(items.find((item) => item.name === label)?.id);
  }

  return (
    <div className="library-table-scroll" onContextMenuCapture={captureTarget}>
      <ContextMenu
        label={t('libraryTab')}
        presentation="adaptive"
        items={targeted ? contextCommands(targeted, scope) : []}
      >
        <Table
          density="compact"
          verticalAlign="top"
          hasHover
          aria-label={t('libraryTab')}
          idKey="id"
          data={rows}
          columns={columns}
          plugins={{
            selection: selectionPlugin,
            sort: sortPlugin,
            rowOpen: rowOpenPlugin,
            ...(showPagination ? { pagination: paginationPlugin } : {}),
          }}
        />
      </ContextMenu>
    </div>
  );
}
