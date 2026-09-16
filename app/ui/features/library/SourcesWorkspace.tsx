import { LibraryAssetBrowser, type AssetContent } from './assets/LibraryAssetBrowser';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Section } from '@astryxdesign/core/Section';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../editor/EditorContext';
import { libraryErrorKey } from './i18n';
import { LibraryDetails } from './LibraryDetails';
import { LibraryImport } from './LibraryImport';
import { LibraryTable } from './LibraryTable';
import { useLibrary } from './useLibrary';
import { ContentLabels } from '../taxonomy/ContentLabels';
import { LabelManager } from '../taxonomy/LabelManager';

interface Props {
  batchBusy: boolean;
  onBatch(ids: string[]): Promise<boolean>;
  onEditor(): void;
}

export function SourcesWorkspace({ batchBusy, onBatch, onEditor }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('library');
  const [assetContent, setAssetContent] = useState<AssetContent>();
  const library = useLibrary();
  const editor = useEditor();
  const { page, selected, loading, busy } = library;
  const disabled = busy || loading;

  async function open(id: string, projectId?: string) {
    if (await editor.openLibrary(id, projectId)) onEditor();
  }

  async function prepareBatch() {
    await library.action(async () => {
      if (await onBatch([...selected])) library.clearSelection();
    });
  }

  return <Section variant="transparent" padding={0} className="sources-workspace">
    <TabList value={tab} onChange={setTab} role="tablist" aria-label={t('sources')}>
      <Tab value="library" label={t('libraryTab')} id="library-tab" panelId="library-panel" />
      <Tab value="assets" label={t('assetTab')} id="assets-tab" panelId="assets-panel" />
      <Tab value="labels" label={t('catalogLabels')} id="labels-tab" panelId="labels-panel" />
      <Tab value="downloads" label={t('downloadsTab')} id="downloads-tab" panelId="downloads-panel" />
    </TabList>
    <div id="library-panel" role="tabpanel" aria-labelledby="library-tab" hidden={tab !== 'library'}>
      <p>{t('libraryIntro')}</p>
      <LibraryImport busy={busy || !page} progress={library.progress} result={library.imported}
        onImport={library.importFiles} onError={library.report} />
      <Divider />
      {library.error && <Banner status="error" title={t(libraryErrorKey(library.error))}
        description={<code>{library.error}</code>}
        endContent={<Button label={t('retryLoad')} isDisabled={busy}
          onClick={() => void library.action(library.reload)} />} />}
      <div className="library-toolbar">
        <TextInput label={t('librarySearch')} value={library.search} isDisabled={busy}
          onChange={library.changeSearch} />
        <Button label={t('libraryRefresh')} isDisabled={busy || loading}
          onClick={() => void library.action(library.reload)} />
        <Button label={t('libraryProcess', { count: selected.size })}
          isDisabled={disabled || batchBusy || !selected.size} onClick={() => void prepareBatch()} />
      </div>
      <p className="field-help">{t('libraryBatchHint')}</p>
      <p role="status">{t('librarySelection', { count: selected.size })}</p>
      {loading && <p role="status">{t('libraryLoading')}</p>}
      {!loading && page?.items.length === 0 && <EmptyState
        title={t(library.search ? 'libraryNoMatches' : 'libraryEmpty')}
        description={t(library.search ? 'libraryNoMatchesHelp' : 'libraryEmptyHelp')} />}
      {page && page.items.length > 0 && <div className="library-grid" aria-busy={loading}>
        <div className="library-main">
          <LibraryTable items={page.items} selected={selected} disabled={disabled}
            onToggle={library.toggle} onSelectPage={library.selectPage} onDetails={library.setActiveId} />
          <div className="action-row library-pagination">
            <span>{t('libraryPage', { from: page.offset + 1,
              to: page.offset + page.items.length, total: page.total })}</span>
            <Button label={t('libraryPrevious')} isDisabled={disabled || page.offset === 0}
              onClick={() => library.changePage(page.offset - page.limit)} />
            <Button label={t('libraryNext')} isDisabled={disabled || page.offset + page.limit >= page.total}
              onClick={() => library.changePage(page.offset + page.limit)} />
          </div>
        </div>
        <LibraryDetails item={library.active} busy={disabled || editor.opening || editor.busy}
          onAction={library.action} onOpen={open} onAssets={item => { setAssetContent({ id: item.id, name: item.name }); setTab('assets'); }} />
      </div>}
      <ContentLabels item={library.active} disabled={disabled} />
    </div>
    <div id="assets-panel" role="tabpanel" aria-labelledby="assets-tab" hidden={tab !== 'assets'}>
      {tab === 'assets' && <LibraryAssetBrowser key={assetContent?.id ?? 'all'} content={assetContent}
        disabled={disabled || editor.opening || editor.busy} onFocus={setAssetContent} onOpen={open} />}
    </div>
    <div id="labels-panel" role="tabpanel" aria-labelledby="labels-tab" hidden={tab !== 'labels'}>
      <LabelManager />
    </div>
    <div id="downloads-panel" role="tabpanel" aria-labelledby="downloads-tab" hidden={tab !== 'downloads'}>
      <EmptyState title={t('downloadsUnavailable')} description={t('downloadsUnavailableHelp')}
        actions={<Button label={t('libraryTab')} onClick={() => setTab('library')} />} />
    </div>
  </Section>;
}
