import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import type { ContextMenuOption } from '@astryxdesign/core/ContextMenu';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { StackItem } from '@astryxdesign/core/Stack';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { VStack } from '@astryxdesign/core/VStack';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasContentFilters } from '../../../core/library/content-filters';
import type { ContentEntry } from '../../../core/library/library-contracts';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { PanelSections } from '../../design-system/Panel';
import { SelectionBar } from '../../design-system/PanelControls';
import { WorkspaceDrawer, WorkspaceFrame, WorkspaceTabPanel } from '../../shell/WorkspaceFrame';
import { useCatalog } from '../catalog/CatalogProvider';
import { useEditor } from '../editor/EditorContext';
import { LabelManagerDialog } from '../taxonomy/LabelManagerDialog';
import { LibraryAssetBrowser } from './assets/LibraryAssetBrowser';
import { libraryErrorKey } from './error-message';
import { LibraryBatchSheet } from './LibraryBatchSheet';
import { LibraryDetails, LibraryDetailsFooter } from './LibraryDetails';
import { LibraryFilters } from './LibraryFilters';
import { LibraryImport } from './LibraryImport';
import { LibraryImportStatus } from './LibraryImportStatus';
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
          label: t('selectionClear'),
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
    <WorkspaceFrame>
      <TabList value={tab} onChange={setTab} role="tablist" aria-label={t('sources')}>
        <Tab value="library" label={t('libraryTab')} id="library-tab" panelId="library-panel" />
        <Tab
          value="downloads"
          label={t('downloadsTab')}
          id="downloads-tab"
          panelId="downloads-panel"
        />
      </TabList>
      <WorkspaceTabPanel id="library-panel" tabId="library-tab" active={tab === 'library'}>
        <div className="library-panel-body">
          {library.error && (
            <Banner
              status="error"
              title={t(libraryErrorKey(library.error))}
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
            <VStack gap={3} isScrollable>
              <Toolbar
                label={t('libraryTab')}
                startContent={
                  <HStack gap={2} vAlign="center">
                    <StackItem size="fill">
                      <TextInput
                        label={t('librarySearch')}
                        isLabelHidden
                        placeholder={t('librarySearch')}
                        startIcon="search"
                        hasClear
                        value={library.search}
                        isDisabled={busy}
                        onChange={library.changeSearch}
                      />
                    </StackItem>
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
                  </HStack>
                }
              />
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
              <SelectionBar
                count={selected.size}
                isDisabled={disabled || batchBusy}
                onClear={library.clearSelection}
              >
                <Button
                  label={t('libraryProcess')}
                  variant="primary"
                  isDisabled={disabled || batchBusy}
                  onClick={() => setBatchOpen(true)}
                />
              </SelectionBar>
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
                <Text as="p" type="body" role="status">
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
            </VStack>
            <WorkspaceDrawer
              open={Boolean(active)}
              label={active?.name ?? ''}
              onClose={() => library.setActiveId('')}
              footer={
                active && (
                  <LibraryDetailsFooter
                    item={active}
                    busy={disabled || editor.opening || editor.busy}
                    onAction={library.action}
                    onOpen={open}
                  />
                )
              }
            >
              {active && (
                <PanelSections>
                  <LibraryDetails item={active} disabled={disabled} />
                  <LibraryAssetBrowser
                    key={active.id}
                    item={active}
                    disabled={disabled || editor.opening || editor.busy}
                    onOpen={open}
                  />
                </PanelSections>
              )}
            </WorkspaceDrawer>
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
      </WorkspaceTabPanel>
      <WorkspaceTabPanel id="downloads-panel" tabId="downloads-tab" active={tab === 'downloads'}>
        {tab === 'downloads' && <DownloadsWorkspace />}
      </WorkspaceTabPanel>
    </WorkspaceFrame>
  );
}
