import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import type { PowerSearchFilter } from '@astryxdesign/core/PowerSearch';
import { usePowerSearchConfig } from '@astryxdesign/core/PowerSearch';
import { Selector } from '@astryxdesign/core/Selector';
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
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Channel,
  Platform,
  PostQuery,
  SaveChannel,
} from '../../../core/distribution/distribution-contracts';
import { unwrap } from '../../bridge/client';
import {
  CommandFooter,
  type CommandStatus,
  PanelRows,
  PanelToggleProvider,
  ToggleRow,
} from '../../design-system/Panel';
import { WorkspaceDrawer } from '../../shell/WorkspaceFrame';
import { useCatalog } from '../catalog/CatalogProvider';
import { useRecordDraft } from '../catalog/useRecordDraft';
import { LabelManagerDialog } from '../taxonomy/LabelManagerDialog';
import { LabelPicker } from '../taxonomy/LabelPicker';

const PAGE_SIZE = 25;

function ChannelSchedule({ channelId }: { channelId: string }) {
  const { t, i18n } = useTranslation();
  const [nearest, setNearest] = useState<{ instant: number; timezone: string } | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let alive = true;
    setNearest(undefined);
    void unwrap(
      window.reupmatic.postList({
        channel_id: channelId,
        view: 'upcoming',
        search: '',
        offset: 0,
        limit: 1,
      }),
    )
      .then((page) => {
        if (alive) setNearest(page.items[0]?.planned ?? null);
      })
      .catch(() => {
        if (alive) setNearest(null);
      });
    return () => {
      alive = false;
    };
  }, [channelId]);
  if (nearest === undefined) return null;
  if (!nearest) return <Text type="body">{t('channelNoUpcoming')}</Text>;
  return (
    <Text type="body">
      {t('channelUpcomingAt', {
        time: new Date(nearest.instant).toLocaleString(i18n.language, {
          timeZone: nearest.timezone,
        }),
      })}
    </Text>
  );
}

interface ChannelRow extends Channel, Record<string, unknown> {}

function draftOf(record?: Channel): SaveChannel {
  return {
    id: record?.id ?? crypto.randomUUID(),
    expected_revision: record?.revision ?? null,
    name: record?.name ?? '',
    platform: record?.platform ?? 'youtube',
    url: record?.url ?? '',
    label_ids: record?.label_ids ?? [],
    archived: record?.archived ?? false,
  };
}

export function ChannelManager({
  onPosts,
}: {
  onPosts(id: string, view: PostQuery['view']): void;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const form = useRecordDraft(draftOf);
  const { value: draft, setValue: setDraft, dirty, replace } = form;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [pages, setPages] = useState<{ id: string; name: string }[] | null>(null);
  const [pageId, setPageId] = useState('');
  const disabled = catalog.busy || !catalog.snapshot;
  const all = (catalog.snapshot?.channels ?? []) as ChannelRow[];
  const savedChannel = all.find((channel) => channel.id === draft.id);
  const searched = search
    ? all.filter((channel) => channel.name.toLowerCase().includes(search.toLowerCase()))
    : all;

  async function save() {
    const saved = await catalog.mutate(() => window.reupmatic.channelSave(draft));
    if (saved) {
      replace(draftOf(saved));
      setEditing(false);
    }
  }
  async function closeDetail() {
    if (await form.discard()) setEditing(false);
  }
  function openChannel(channel: Channel) {
    setEditing(true);
    void form.choose(draftOf(channel));
  }
  function connectMessage(reason: unknown, fallback: string): string {
    const code = reason instanceof Error ? reason.message : '';
    if (code === 'PUBLISHING_NOT_CONFIGURED' || code === 'PUBLISH_CONFIG_MISSING')
      return t('channelNotConfigured');
    if (code === 'CHANNEL_NO_PAGES') return t('channelNoPages');
    return t(fallback);
  }
  async function savePage(id: string) {
    await unwrap(window.reupmatic.channelConnectPage({ id: draft.id, page_id: id }));
    setPages(null);
    setPageId('');
    await catalog.reload();
  }
  async function connect() {
    setConnecting(true);
    setConnectError('');
    try {
      const result = await unwrap(window.reupmatic.channelConnectStart(draft.id));
      if (result.pages.length === 1) await savePage(result.pages[0].id);
      else {
        setPages(result.pages);
        setPageId(result.pages[0]?.id ?? '');
      }
    } catch (reason) {
      setConnectError(connectMessage(reason, 'channelConnectFailed'));
    } finally {
      setConnecting(false);
    }
  }
  async function completeConnect() {
    setConnecting(true);
    setConnectError('');
    try {
      await savePage(pageId);
    } catch (reason) {
      setConnectError(connectMessage(reason, 'channelConnectFailed'));
    } finally {
      setConnecting(false);
    }
  }
  async function disconnect() {
    setConnecting(true);
    setConnectError('');
    try {
      await unwrap(window.reupmatic.channelDisconnect(draft.id));
      await catalog.reload();
    } catch (reason) {
      setConnectError(connectMessage(reason, 'channelDisconnectFailed'));
    } finally {
      setConnecting(false);
    }
  }
  async function connectYouTube() {
    setConnecting(true);
    setConnectError('');
    try {
      await unwrap(window.reupmatic.channelConnect(draft.id));
      await catalog.reload();
    } catch (reason) {
      setConnectError(connectMessage(reason, 'channelConnectFailed'));
    } finally {
      setConnecting(false);
    }
  }
  async function connectTikTok() {
    setConnecting(true);
    setConnectError('');
    try {
      await unwrap(window.reupmatic.channelConnectTikTok(draft.id));
      await catalog.reload();
    } catch (reason) {
      setConnectError(connectMessage(reason, 'channelConnectFailed'));
    } finally {
      setConnecting(false);
    }
  }

  const saved = draft.expected_revision !== null;
  const connection = savedChannel?.connection ?? 'not_connected';
  const connectable = saved && connection !== 'connected';
  const connectLabel = pages
    ? t('channelConnectPage')
    : connection === 'reauthorize'
      ? t('channelReconnect')
      : t('channelConnect');
  const connectDisabled = disabled || connecting || (pages !== null && !pageId);
  function startConnect() {
    if (draft.platform === 'youtube') return connectYouTube();
    if (draft.platform === 'tiktok') return connectTikTok();
    return pages ? completeConnect() : connect();
  }
  const status: CommandStatus | null = connectError
    ? { tone: 'error', text: connectError }
    : !saved
      ? null
      : connection === 'connected'
        ? {
            tone: 'success',
            text: savedChannel?.account_name
              ? t('channelConnectedAs', { name: savedChannel.account_name })
              : t('connection_connected'),
          }
        : {
            tone: connection === 'reauthorize' ? 'warning' : 'neutral',
            text: t(`connection_${connection}`),
          };

  const platformFields = useMemo(
    () =>
      [
        {
          key: 'platform',
          type: 'enum',
          label: t('channelPlatform'),
          enumValues: [
            { value: 'youtube', label: t('platform_youtube') },
            { value: 'facebook_page', label: t('platform_facebook_page') },
            { value: 'tiktok', label: t('platform_tiktok') },
          ],
        },
      ] as const,
    [t],
  );
  const { config: filterConfig, applyFilters } = usePowerSearchConfig(platformFields);
  const { filters, onFilterChange } = useTableFilterState();
  const filterPlugin = useTableFiltering<ChannelRow>({
    filters,
    onFilterChange,
    searchConfig: filterConfig,
  });

  const columns: TableColumn<ChannelRow>[] = [
    {
      key: 'name',
      header: t('catalogName'),
      width: proportional(2),
      sortable: true,
      renderCell: (channel) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            label={channel.name}
            onClick={() => openChannel(channel)}
          />
          {channel.archived && (
            <Text as="p" type="body">
              {t('catalogArchived')}
            </Text>
          )}
        </>
      ),
    },
    {
      key: 'platform',
      header: t('channelPlatform'),
      width: proportional(1),
      sortable: true,
      filter: 'platform',
      renderCell: (channel) => t(`platform_${channel.platform}`),
    },
    {
      key: 'connection',
      header: t('channelConnection'),
      width: proportional(1),
      renderCell: (channel) => t(`connection_${channel.connection}`),
    },
    {
      key: 'schedule',
      header: t('channelSchedule'),
      width: proportional(1),
      renderCell: (channel) => <ChannelSchedule channelId={channel.id} />,
    },
    {
      key: 'actions',
      header: t('catalogActions'),
      width: pixel(140),
      resizable: false,
      renderCell: (channel) => (
        <Button
          label={t('channelPosts')}
          onClick={(event) => {
            event.stopPropagation();
            onPosts(channel.id, 'all');
          }}
        />
      ),
    },
  ];

  const filtered = applyFilters(
    toSearchFilters(filters, columns, filterConfig) as PowerSearchFilter[],
    searched,
  );
  const { sortedData, sortConfig } = useTableSortableState<ChannelRow>({
    data: filtered,
    defaultSort: [{ sortKey: 'name', direction: 'ascending' }],
  });
  const sortPlugin = useTableSortable<ChannelRow>(sortConfig);
  const showPagination = sortedData.length > PAGE_SIZE;
  const paginationPlugin = useTablePagination<ChannelRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize: PAGE_SIZE,
    variant: 'count',
  });
  const pageData = showPagination ? paginateData(sortedData, page, PAGE_SIZE) : sortedData;

  return (
    <>
      <div className="business-workspace">
        <VStack gap={3} isScrollable>
          <Toolbar
            label={t('channelsTab')}
            size="sm"
            startContent={
              <TextInput
                label={t('catalogSearch')}
                isLabelHidden
                placeholder={t('channelsSearchPlaceholder')}
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
              <HStack gap={2} vAlign="center" hAlign="between">
                <Text type="body">{t('channelsCount', { count: sortedData.length })}</Text>
                <HStack gap={2} vAlign="center">
                  <Button
                    label={t('channelNew')}
                    variant="primary"
                    tooltip={t('channelNew')}
                    isDisabled={disabled}
                    onClick={() => {
                      setEditing(true);
                      void form.choose(draftOf());
                    }}
                  />
                  <MoreMenu
                    label={t('libraryMoreActions')}
                    items={[
                      {
                        label: t('libraryManageLabels'),
                        isDisabled: disabled,
                        onClick: () => setLabelsOpen(true),
                      },
                    ]}
                  />
                </HStack>
              </HStack>
            }
          />
          {!all.length ? (
            <EmptyState title={t('channelsEmpty')} />
          ) : (
            <Table
              density="compact"
              aria-label={t('channelsTab')}
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
                  title={t('channelsNoMatches')}
                  actions={<Button label={t('catalogClearSearch')} onClick={() => setSearch('')} />}
                />
              }
            />
          )}
        </VStack>
        <WorkspaceDrawer
          open={editing}
          label={t(draft.expected_revision ? 'channelEdit' : 'channelNew')}
          onClose={() => void closeDetail()}
          footer={
            <CommandFooter
              status={status}
              menu={
                saved
                  ? [
                      {
                        label: t('postView_upcoming'),
                        isDisabled: disabled,
                        onClick: () => onPosts(draft.id, 'upcoming'),
                      },
                      {
                        label: t('postView_published'),
                        isDisabled: disabled,
                        onClick: () => onPosts(draft.id, 'published'),
                      },
                      ...(connectable && dirty
                        ? [
                            {
                              label: connectLabel,
                              isDisabled: connectDisabled,
                              onClick: () => void startConnect(),
                            },
                          ]
                        : []),
                      ...(savedChannel?.connection === 'connected'
                        ? [
                            { type: 'divider' as const },
                            {
                              label: t('channelDisconnect'),
                              variant: 'destructive' as const,
                              isDisabled: disabled || connecting,
                              onClick: () => void disconnect(),
                            },
                          ]
                        : []),
                    ]
                  : undefined
              }
            >
              {dirty && (
                <Button
                  label={t('catalogReset')}
                  isDisabled={disabled}
                  onClick={() => void form.reset()}
                />
              )}
              {connectable && !dirty ? (
                <Button
                  label={connectLabel}
                  variant="primary"
                  isDisabled={connectDisabled}
                  onClick={() => void startConnect()}
                />
              ) : (
                <Button
                  label={t('catalogSave')}
                  variant="primary"
                  isDisabled={disabled || !draft.name.trim() || (!dirty && saved)}
                  onClick={() => void save()}
                />
              )}
            </CommandFooter>
          }
        >
          <PanelToggleProvider value={CheckboxInput}>
            <PanelRows>
              <TextInput
                label={t('catalogName')}
                value={draft.name}
                isDisabled={disabled}
                onChange={(name) => setDraft({ ...draft, name })}
              />
              <Selector
                label={t('channelPlatform')}
                value={draft.platform}
                isDisabled={disabled || saved}
                options={['youtube', 'facebook_page', 'tiktok'].map((value) => ({
                  value,
                  label: t(`platform_${value}`),
                }))}
                onChange={(platform) => setDraft({ ...draft, platform: platform as Platform })}
              />
              <TextInput
                label={t('channelUrl')}
                value={draft.url}
                isDisabled={disabled}
                onChange={(url) => setDraft({ ...draft, url })}
              />
              {saved && draft.platform === 'facebook_page' && pages && (
                <Selector
                  label={t('channelChoosePage')}
                  value={pageId}
                  isDisabled={disabled || connecting}
                  options={pages.map((entry) => ({ value: entry.id, label: entry.name }))}
                  onChange={setPageId}
                />
              )}
              <LabelPicker
                value={draft.label_ids}
                onChange={(label_ids) => setDraft({ ...draft, label_ids })}
                disabled={disabled}
              />
              <ToggleRow
                label={t('catalogArchived')}
                value={draft.archived}
                isDisabled={disabled}
                onChange={(archived) => setDraft({ ...draft, archived })}
              />
            </PanelRows>
          </PanelToggleProvider>
        </WorkspaceDrawer>
      </div>
      <LabelManagerDialog open={labelsOpen} onClose={() => setLabelsOpen(false)} />
    </>
  );
}
