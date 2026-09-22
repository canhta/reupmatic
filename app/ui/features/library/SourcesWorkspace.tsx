import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import type { ContextMenuOption } from '@astryxdesign/core/ContextMenu';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasContentFilters } from '../../../core/library/content-filters';
import type { ContentEntry } from '../../../core/library/library-contracts';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { DetailSurface } from '../../design-system/DetailSurface';
import { useCatalog } from '../catalog/CatalogProvider';
import { useEditor } from '../editor/EditorContext';
import { ContentLabels } from '../taxonomy/ContentLabels';
import { LabelManagerDialog } from '../taxonomy/LabelManagerDialog';
import { LibraryAssetBrowser } from './assets/LibraryAssetBrowser';
import { libraryErrorKey } from './error-message';
import { LibraryBatchSheet } from './LibraryBatchSheet';
import { LibraryDetails } from './LibraryDetails';
import { LibraryFilters } from './LibraryFilters';
import { LibraryImport } from './LibraryImport';
import { LibraryImportStatus } from './LibraryImportStatus';
import { LibrarySelectionBar } from './LibrarySelectionBar';
import { LibraryTable } from './LibraryTable';
import { DownloadsWorkspace } from './sources/DownloadsWorkspace';
import { useLibrary } from './useLibrary';

interface Props {
  batchBusy: boolean;
  onBatch(ids: string[]): Promise<boolean>;
  onEditor(): void;
}

export function SourcesWorkspace({ batchBusy, onBatch, onEditor }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const [tab, setTab] = useState('library');
  const [batchOpen, setBatchOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const library = useLibrary();
  const editor = useEditor();
  const catalog = useCatalog();
  const { page, selected, loading, busy, active, filters } = library;
  const disabled = busy || loading;
  const filtersActive = hasContentFilters(filters);
  const labelNames = useMemo(
    () => new Map((catalog.snapshot?.labels ?? []).map((label) => [label.id, label.name])),
    [catalog.snapshot],
  );
  const labelsByContent = useMemo(
    () =>
      new Map(
        (catalog.snapshot?.content_labels ?? []).map((record) => [record.id, record.label_ids]),
      ),
    [catalog.snapshot],
  );

  async function open(id: string, projectId?: string) {
    if (await editor.openLibrary(id, projectId)) onEditor();
  }

  function contextCommands(item: ContentEntry, scope: 'row' | 'selection'): ContextMenuOption[] {
    if (scope === 'selection') {
      return [
        { label: t('libraryProcess'), isDisabled: disabled, onClick: () => setBatchOpen(true) },
        {
          label: t('libraryClearSelection'),
          isDisabled: disabled,
          onClick: library.clearSelection,
        },
      ];
    }
    const needsAttention = item.availability === 'missing' || item.availability === 'changed';
    return [
      ...(item.media_kind === 'video'
        ? [
            {
              label: t('libraryOpen'),
              isDisabled: disabled,
              onClick: () => void open(item.id),
            } as ContextMenuOption,
          ]
        : []),
      {
        label: t('libraryReveal'),
        isDisabled: disabled,
        onClick: () =>
          void library.action(async () => {
            await unwrap(window.reupmatic.libraryReveal(item.id));
          }),
      },
      ...(needsAttention
        ? [
            {
              label: t('libraryRelink'),
              isDisabled: disabled,
              onClick: () =>
                void library.action(async () => {
                  await unwrap(window.reupmatic.libraryRelink(item.id));
                }),
            } as ContextMenuOption,
          ]
        : []),
      { type: 'divider' },
      {
        label: t('libraryForget'),
        variant: 'destructive',
        isDisabled: disabled,
        onClick: () =>
          void library.action(async () => {
            const accepted = await confirm(t('libraryForgetConfirm', { name: item.name }), {
              title: t('confirmRemoveTitle'),
              confirmLabel: t('confirmRemoveAction'),
              destructive: true,
            });
            if (accepted) await unwrap(window.reupmatic.libraryForget(item.id));
          }),
      },
    ];
  }

  async function confirmBatch() {
    await library.action(async () => {
      if (await onBatch([...selected])) {
        library.clearSelection();
        setBatchOpen(false);
      }
    });
  }

  return (
    <div className="business-area">
      <TabList value={tab} onChange={setTab} role="tablist" aria-label={t('sources')}>
        <Tab value="library" label={t('libraryTab')} id="library-tab" panelId="library-panel" />
        <Tab
          value="downloads"
          label={t('downloadsTab')}
          id="downloads-tab"
          panelId="downloads-panel"
        />
      </TabList>
      <div
        id="library-panel"
        role="tabpanel"
        aria-labelledby="library-tab"
        hidden={tab !== 'library'}
      >
        <div className="library-panel-body">
          {library.error && (
            <Banner
              status="error"
              title={t(libraryErrorKey(library.error))}
              description={<code>{library.error}</code>}
              endContent={
                <Button
                  label={t('retryLoad')}
                  isDisabled={busy}
                  onClick={() => void library.action(library.reload)}
                />
              }
            />
          )}
          <div className="business-workspace">
            <div className="business-grid">
              <div className="business-list">
                <div className="library-toolbar">
                  <TextInput
                    label={t('librarySearch')}
                    isLabelHidden
                    placeholder={t('librarySearch')}
                    value={library.search}
                    isDisabled={busy}
                    onChange={library.changeSearch}
                  />
                  <div className="library-toolbar-actions">
                    <MoreMenu
                      label={t('libraryMoreActions')}
                      isDisabled={disabled}
                      items={[
                        {
                          label: t('libraryRefresh'),
                          onClick: () => void library.action(library.reload),
                          isDisabled: disabled,
                        },
                        {
                          label: t('libraryManageLabels'),
                          onClick: () => setLabelsOpen(true),
                          isDisabled: !catalog.snapshot || catalog.busy,
                        },
                      ]}
                    />
                    <LibraryImport busy={busy || !page} onImport={library.importFiles} />
                  </div>
                </div>
                <LibraryFilters
                  filters={filters}
                  labels={catalog.snapshot?.labels ?? []}
                  disabled={disabled}
                  onChange={library.changeFilters}
                  onClear={library.clearFilters}
                />
                <LibraryImportStatus
                  progress={library.progress}
                  result={library.imported}
                  onError={library.report}
                />
                <LibrarySelectionBar
                  count={selected.size}
                  disabled={disabled || batchBusy}
                  onPrepare={() => setBatchOpen(true)}
                  onClear={library.clearSelection}
                />
                {loading && (
                  <Text as="p" type="body" role="status">
                    {t('libraryLoading')}
                  </Text>
                )}
                {!loading && page?.items.length === 0 && filtersActive && (
                  <EmptyState
                    title={t('libraryFilterEmpty')}
                    description={t('libraryFilterEmptyHint')}
                    actions={
                      <Button label={t('libraryFilterClearAll')} onClick={library.clearFilters} />
                    }
                  />
                )}
                {!loading && page?.items.length === 0 && !filtersActive && library.search && (
                  <EmptyState
                    title={t('libraryNoMatches')}
                    actions={
                      <Button
                        label={t('libraryClearSearch')}
                        onClick={() => library.changeSearch('')}
                      />
                    }
                  />
                )}
                {!loading && page?.items.length === 0 && !filtersActive && !library.search && (
                  <EmptyState title={t('libraryEmpty')} />
                )}
                {page && page.items.length > 0 && filtersActive && (
                  <Text as="p" type="supporting" role="status">
                    {t('libraryFilterMatch', { count: page.total })}
                  </Text>
                )}
                {page && page.items.length > 0 && (
                  <LibraryTable
                    items={page.items}
                    selected={selected}
                    disabled={disabled}
                    sort={library.sort}
                    page={Math.floor(page.offset / page.limit) + 1}
                    totalItems={page.total}
                    labelNames={labelNames}
                    labelsByContent={labelsByContent}
                    onToggle={library.toggle}
                    onSelectPage={library.selectPage}
                    onDetails={library.setActiveId}
                    onSortChange={library.changeSort}
                    onPageChange={(next) => library.changePage((next - 1) * page.limit)}
                    contextCommands={contextCommands}
                  />
                )}
              </div>
              <DetailSurface
                open={Boolean(active)}
                label={active?.name ?? ''}
                onClose={() => library.setActiveId('')}
              >
                {active && (
                  <>
                    <LibraryDetails
                      item={active}
                      busy={disabled || editor.opening || editor.busy}
                      onAction={library.action}
                      onOpen={open}
                    />
                    <ContentLabels item={active} disabled={disabled} />
                    {}
                    <Collapsible trigger={t('assetRelated')} defaultIsOpen={false}>
                      <LibraryAssetBrowser
                        key={active.id}
                        contentId={active.id}
                        disabled={disabled || editor.opening || editor.busy}
                        onOpen={open}
                      />
                    </Collapsible>
                  </>
                )}
              </DetailSurface>
            </div>
          </div>
        </div>
        <LibraryBatchSheet
          open={batchOpen}
          count={selected.size}
          busy={disabled || batchBusy}
          onClose={() => setBatchOpen(false)}
          onConfirm={() => void confirmBatch()}
        />
        <LabelManagerDialog open={labelsOpen} onClose={() => setLabelsOpen(false)} />
      </div>
      <div
        id="downloads-panel"
        role="tabpanel"
        aria-labelledby="downloads-tab"
        hidden={tab !== 'downloads'}
      >
        {tab === 'downloads' && <DownloadsWorkspace />}
      </div>
    </div>
  );
}
