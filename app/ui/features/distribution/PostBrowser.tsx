import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Selector } from '@astryxdesign/core/Selector';
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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from '../../../core/catalog/catalog-contracts';
import type {
  Post,
  PostQuery,
  PostSortKey,
} from '../../../core/distribution/distribution-contracts';
import { unwrap } from '../../bridge/client';
import { DetailSurface } from '../../design-system/DetailSurface';
import { toSortQuery } from '../../design-system/table-sort';
import { registerMenuCommand } from '../../shell/menuCommands';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { PostEditor } from './PostEditor';
import { postDraft } from './post-draft';

const PAGE_SIZE = 25;

// Table's data-driven plugins require T extends Record<string, unknown>;
// Post is a plain named type with no index signature, so it needs this
// wrapper per Table's own documented pattern.
interface PostRow extends Post, Record<string, unknown> {}

export type PostFilter = Pick<PostQuery, 'channel_id' | 'link_id' | 'view'>;
export function PostBrowser({
  filter,
  onFilter,
}: {
  filter: PostFilter;
  onFilter(filter: PostFilter): void;
}) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog();
  const form = useRecordDraft(postDraft);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<TableSortState<PostSortKey>>([]);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState<Page<Post> | null>(null);
  const [error, setError] = useState(false);
  const [_generation, setGeneration] = useState(0);
  const _revision = catalog.snapshot?.revision;
  useEffect(() => {
    let alive = true;
    setError(false);
    setPage(null);
    void unwrap(
      window.reupmatic.postList({
        ...filter,
        search,
        offset,
        limit: PAGE_SIZE,
        ...toSortQuery(sort),
      }),
    )
      .then((value) => {
        if (!alive) return;
        if (offset && offset >= value.total) {
          setOffset(0);
          return;
        }
        setPage(value);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [filter, search, offset, sort]);
  useEffect(() => setOffset(0), []);

  // Native Channels-menu "New Post…" opens the same create draft
  // as the toolbar button below, gated the same way (isDisabled).
  useEffect(
    () =>
      registerMenuCommand('channels.newPost', () => {
        if (catalog.busy || !catalog.snapshot) return;
        setEditing(true);
        void form.choose(postDraft());
      }),
    [catalog.busy, catalog.snapshot, form],
  );
  const filtered = !!filter.channel_id || !!filter.link_id;
  const filterName = filter.channel_id
    ? catalog.snapshot?.channels.find((item) => item.id === filter.channel_id)?.name
    : catalog.snapshot?.links.find((item) => item.id === filter.link_id)?.name;
  async function closeDetail() {
    if (await form.discard()) setEditing(false);
  }
  function openPost(post: Post) {
    setEditing(true);
    void form.choose(postDraft(post));
  }

  // Not memoized: openPost closes over per-render state, and re-deriving
  // four column defs each render is cheap.
  const columns: TableColumn<PostRow>[] = [
    {
      key: 'title',
      header: t('postTitle'),
      width: proportional(2),
      sortable: true,
      renderCell: (post) => (
        <button type="button" className="business-row-open" onClick={() => openPost(post)}>
          {post.title}
        </button>
      ),
    },
    {
      key: 'channel',
      header: t('postDestination'),
      width: proportional(1),
      sortable: true,
      renderCell: (post) => post.channel.name,
    },
    {
      key: 'state',
      header: t('postState'),
      width: proportional(1),
      sortable: true,
      renderCell: (post) => t(`postState_${post.state}`),
    },
    {
      key: 'planned',
      header: t('postPlanTime'),
      width: proportional(2),
      sortable: true,
      renderCell: (post) =>
        post.planned
          ? `${new Date(post.planned.instant).toLocaleString(i18n.language, {
              timeZone: post.planned.timezone,
            })} (${post.planned.timezone})`
          : t('postUnplanned'),
    },
  ];
  const sortPlugin = useTableSortable<PostRow, PostSortKey>({
    sort,
    onSortChange: (next) => {
      setSort(next);
      setOffset(0);
    },
  });
  const showPagination = (page?.total ?? 0) > PAGE_SIZE;
  const paginationPlugin = useTablePagination<PostRow>({
    page: Math.floor(offset / PAGE_SIZE) + 1,
    onPageChange: (next) => setOffset((next - 1) * PAGE_SIZE),
    totalItems: page?.total ?? 0,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });

  return (
    <div className="business-workspace">
      <div className="business-grid">
        <div className="business-list">
          <Toolbar
            label={t('postsTab')}
            size="sm"
            startContent={
              <TextInput
                label={t('catalogSearch')}
                isLabelHidden
                placeholder={t('postsSearchPlaceholder')}
                startIcon="search"
                hasClear
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setOffset(0);
                }}
              />
            }
            endContent={
              <div className="action-row">
                <Selector
                  label={t('postView')}
                  isLabelHidden
                  value={filter.view}
                  options={['all', 'upcoming', 'published', 'cancelled'].map((value) => ({
                    value,
                    label: t(`postView_${value}`),
                  }))}
                  onChange={(view) => onFilter({ ...filter, view: view as PostQuery['view'] })}
                />
                <Button
                  label={t('postNew')}
                  variant="primary"
                  className="business-toolbar-primary"
                  isDisabled={catalog.busy || !catalog.snapshot}
                  onClick={() => {
                    setEditing(true);
                    void form.choose(postDraft());
                  }}
                />
              </div>
            }
          />
          {filtered && (
            <div className="action-row">
              <Text type="body">
                {t('postFilter', { name: filterName ?? filter.channel_id ?? filter.link_id })}
              </Text>
              <Button
                label={t('postClearFilter')}
                onClick={() => onFilter({ view: filter.view })}
              />
            </div>
          )}
          {error ? (
            <Banner
              status="error"
              title={t('postsLoadError')}
              endContent={
                <Button
                  label={t('retryLoad')}
                  onClick={() => setGeneration((value) => value + 1)}
                />
              }
            />
          ) : !page ? (
            <Text as="p" type="body" role="status">
              {t('catalogLoading')}
            </Text>
          ) : !page.items.length && !search ? (
            <EmptyState
              title={t(filter.view === 'published' ? 'postsPublishedEmpty' : 'postsEmpty')}
              description={filter.view === 'published' ? undefined : t('postsEmptyHelp')}
            />
          ) : (
            <Table
              density="compact"
              aria-label={t('postsTab')}
              idKey="id"
              data={page.items as PostRow[]}
              columns={columns}
              plugins={{
                sort: sortPlugin,
                ...(showPagination ? { pagination: paginationPlugin } : {}),
              }}
              emptyState={
                <EmptyState
                  title={t('postsNoMatches')}
                  actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
                />
              }
            />
          )}
          {!!page?.total && (
            <Text as="p" type="body" role="status">
              {t('postsCount', { count: page.total })}
            </Text>
          )}
        </div>
        <DetailSurface
          open={editing}
          label={t(form.value.saved ? 'postEdit' : 'postNew')}
          onClose={() => void closeDetail()}
        >
          <PostEditor
            form={form}
            onSaved={() => {
              setGeneration((value) => value + 1);
              setEditing(false);
            }}
          />
        </DetailSurface>
      </div>
    </div>
  );
}
