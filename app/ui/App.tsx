import { AppShell } from '@astryxdesign/core/AppShell';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BatchPanel } from './features/batch/BatchPanel';
import { useBatchQueue } from './features/batch/useBatchQueue';
import { EditorProvider } from './features/editor/EditorContext';
import { EditorHeader } from './features/editor/EditorHeader';
import { EditorWorkspace } from './features/editor/EditorWorkspace';
import { AutomationWorkspace } from './features/automation/AutomationWorkspace';
import { CatalogProvider } from './features/catalog/CatalogProvider';
import { CatalogStatus } from './features/catalog/CatalogStatus';
import { ChannelsWorkspace } from './features/distribution/ChannelsWorkspace';
import { SourcesWorkspace } from './features/library/SourcesWorkspace';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { LocaleSelect } from './shell/LocaleSelect';
import { WorkspaceNavigation, type WorkspaceArea } from './shell/WorkspaceNavigation';

export function App() {
  const { t, i18n } = useTranslation();
  const [area, setArea] = useState<WorkspaceArea>('editor');
  const [editorDirty, setEditorDirty] = useState(false);
  const [batchDirty, setBatchDirty] = useState(false);
  const [folderDirty, setFolderDirty] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const queue = useBatchQueue(setBatchDirty);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    localStorage.setItem('uiLocale', i18n.language);
    void window.reupmatic.dirty(editorDirty || batchDirty || folderDirty || catalogDirty, i18n.language);
  }, [editorDirty, batchDirty, folderDirty, catalogDirty, i18n.language]);

  const descriptions = { sources: 'libraryIntro', settings: 'settingsIntro', automation: 'automationIntro', channels: 'channelsIntro' } as const;
  return (
    <CatalogProvider onDirty={setCatalogDirty}>
    <EditorProvider onDirty={setEditorDirty}>
      <AppShell variant="section" contentPadding={4}
        sideNav={<WorkspaceNavigation selected={area} onNavigate={setArea} />}>
        <div className="workspace-content">
          {area === 'editor' ? <EditorHeader /> : <header className="workspace-header">
            <div><h1>{t(area)}</h1><p>{t(descriptions[area])}</p></div>
            {area !== 'settings' && <LocaleSelect />}
          </header>}
          <CatalogStatus />
          <BatchPanel queue={queue} />
          <div hidden={area !== 'sources'}><SourcesWorkspace batchBusy={queue.busy}
            onBatch={queue.addLibraryItems} onEditor={() => setArea('editor')} /></div>
          <div hidden={area !== 'automation'}><AutomationWorkspace queue={queue} onFolderDirty={setFolderDirty} /></div>
          <div hidden={area !== 'channels'}><ChannelsWorkspace /></div>
          <div hidden={area !== 'editor'}><EditorWorkspace /></div>
          <div hidden={area !== 'settings'}><SettingsPanel /></div>
        </div>
      </AppShell>
    </EditorProvider>
    </CatalogProvider>
  );
}
