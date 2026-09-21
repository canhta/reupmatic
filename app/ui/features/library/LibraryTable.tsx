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

// Table's data-driven plugins require T extends Record<string, unknown>;
// ContentEntry is a plain named type with no index signature, so it needs
// this wrapper per Table's own documented pattern.
interface ContentRow extends ContentEntry, Record<string, unknown> {}

const PAGE_SIZE = 25;

interface Props {
  items: ContentEntry[];
  selected: Set<string>;
  disabled: boolean;
  sort: TableSortState<ContentSortKey>;
  page: number;
  totalItems: number;
  /**
   * The Library's label facet, resolved from the catalog's taxonomy rather than owned by the
   * content record: `labelNames` maps a label id to its display name, `labelsByContent` maps a
   * content id to the label ids attached to it.
   */
  labelNames: Map<string, string>;
  labelsByContent: Map<string, string[]>;
  onToggle(id: string, checked: boolean): void;
  onSelectPage(checked: boolean): void;
  onDetails(id: string): void;
  onSortChange(sort: TableSortState<ContentSortKey>): void;
  onPageChange(page: number): void;
  /**
   * Every command this row offers, for the context menu. Fluent documents that all commands must
   * be reachable from the context menu and that hover/toolbar buttons are accelerators on top of
   * it, never the only path (rows 5c
   * and 9a). `scope` is `'selection'` only when the right-clicked row is itself part of a
   * multi-row selection; otherwise the menu acts on the one row under the cursor.
   */
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

  // Only the universal facts every source has. Source-specific facts (author/channel,
  // `published_at`, counters, `share_url`, music, collection, product links) live in
  // LibraryDetails, never as a column: a column that is empty for a whole class of source is a
  // ragged column ("The Library list is source-agnostic").
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
        // A kind without a duration shows a gap; an empty cell is honest, a zero would not be.
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
          // Only an exception earns a badge; normal states stay plain text.
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
  // Preserves the previous whole-row click-to-open + keyboard affordance
  // (Table's data-driven columns have no built-in row-click prop): a local
  // plugin transforming just the body row's own props.
  const rowOpenPlugin: TablePlugin<ContentRow> = {
    transformBodyRow: (props: BodyRowRenderProps, item) => ({
      ...props,
      htmlProps: {
        ...props.htmlProps,
        className: ['library-row', props.htmlProps.className].filter(Boolean).join(' '),
        tabIndex: 0,
        'aria-label': item.name,
        // The selection plugin's own checkbox cell has no stopPropagation
        // of its own, so a checkbox click would otherwise bubble up and
        // also open the row; ignore clicks that originate on an interactive
        // control inside the row.
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

  /**
   * Resolves the right-clicked row from the DOM, synchronously, in the capture phase — before
   * ContextMenu's own handler decides whether to open. Reading it from React state instead would
   * always be one event behind, because the state update and the open land in the same batch;
   * that cost the first right-click its menu entirely. Fires for the keyboard context-menu key
   * and Shift+F10 too, since rows are focusable and the browser targets the focused element.
   */
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
