import { AppShell } from '@astryxdesign/core/AppShell';
import { Heading } from '@astryxdesign/core/Heading';
import { SideNavCollapseButton } from '@astryxdesign/core/SideNav';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutomationWorkspace } from './features/automation/AutomationWorkspace';
import { BatchFailureNotifier } from './features/batch/BatchFailureNotifier';
import { useBatchQueue } from './features/batch/useBatchQueue';
import { CatalogProvider } from './features/catalog/CatalogProvider';
import { CatalogStatus } from './features/catalog/CatalogStatus';
import { ChannelsWorkspace } from './features/distribution/ChannelsWorkspace';
import { EditorProvider } from './features/editor/EditorContext';
import { EditorToolbarActions, EditorToolbarTitle } from './features/editor/EditorToolbar';
import { EditorWorkspace } from './features/editor/EditorWorkspace';
import { RecoveryNotification } from './features/editor/RecoveryNotification';
import { SourcesWorkspace } from './features/library/SourcesWorkspace';
import { DouyinDownloadsProvider } from './features/library/sources/DouyinDownloadsContext';
import type { SettingsCategory } from './features/settings/SettingsPanel';
import { SettingsWorkspace } from './features/settings/SettingsWorkspace';
import { JobsTray } from './shell/JobsTray';
import { dispatchMenuCommand } from './shell/menuCommands';
import { NotificationsProvider } from './shell/NotificationsProvider';
import { UpdateNotification } from './shell/UpdateNotification';
import { useSessionLifecycle } from './shell/useSessionLifecycle';
import { WindowTitleSync } from './shell/WindowTitleSync';
import { type WorkspaceArea, WorkspaceNavigation } from './shell/WorkspaceNavigation';
import { WorkspaceStatusBar } from './shell/WorkspaceStatusBar';

export function App() {
  const { t } = useTranslation();
  const [area, setArea] = useState<WorkspaceArea>('editor');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('general');
  const [jobsOpen, setJobsOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const { registerDirty } = useSessionLifecycle();
  const queue = useBatchQueue((dirty) => registerDirty('batch', dirty));

  useEffect(
    () =>
      window.reupmatic.onMenuCommand(({ command, area: target, data }) => {
        if (target) setArea(target);
        if (command === 'app.openJobs') {
          setJobsOpen(true);
          return;
        }
        dispatchMenuCommand(command, data);
      }),
    [],
  );

  return (
    <CatalogProvider onDirty={(dirty) => registerDirty('catalog', dirty)}>
      <EditorProvider
        onDirty={(dirty) => registerDirty('editor', dirty)}
        onOpenSettings={(tab) => {
          setArea('settings');
          if (tab) setSettingsCategory(tab);
        }}
      >
        <NotificationsProvider>
          <DouyinDownloadsProvider>
            <WindowTitleSync area={area} />
            <UpdateNotification />
            <AppShell
              variant="section"
              contentPadding={0}
              topNav={
                <TopNav
                  label={t('workspaceTitleBar')}
                  heading={
                    navigationCollapsed ? undefined : (
                      <Text as="span" weight="semibold" size="sm" className="workspace-brand">
                        Reupmatic
                      </Text>
                    )
                  }
                  startContent={
                    <>
                      <span className="workspace-toolbar-control">
                        <SideNavCollapseButton
                          collapsible={{
                            isCollapsed: navigationCollapsed,
                            onCollapsedChange: setNavigationCollapsed,
                          }}
                          label={t(navigationCollapsed ? 'expandNavigation' : 'collapseNavigation')}
                        />
                      </span>
                      {area === 'editor' ? (
                        <EditorToolbarTitle />
                      ) : (
                        <div className="workspace-title">
                          <span className="workspace-title-content">
                            <Heading level={4} weight="semibold" maxLines={1}>
                              {t(area)}
                            </Heading>
                          </span>
                        </div>
                      )}
                    </>
                  }
                  endContent={area === 'editor' ? <EditorToolbarActions /> : undefined}
                />
              }
              sideNav={
                <WorkspaceNavigation
                  selected={area}
                  isCollapsed={navigationCollapsed}
                  onCollapsedChange={setNavigationCollapsed}
                  onNavigate={setArea}
                />
              }
            >
              <div className="workspace-content">
                <div
                  className={`workspace-scroll-region${area === 'editor' ? ' workspace-scroll-region--editor' : ''}${area === 'channels' || area === 'sources' || area === 'automation' ? ' workspace-scroll-region--filled' : ''}`}
                >
                  <CatalogStatus />
                  <div hidden={area !== 'sources'}>
                    <SourcesWorkspace
                      batchBusy={queue.busy}
                      onBatch={queue.addLibraryItems}
                      onEditor={() => setArea('editor')}
                    />
                  </div>
                  <div hidden={area !== 'automation'}>
                    <AutomationWorkspace
                      queue={queue}
                      onFolderDirty={(dirty) => registerDirty('folder', dirty)}
                    />
                  </div>
                  <div hidden={area !== 'channels'}>
                    <ChannelsWorkspace />
                  </div>
                  <div hidden={area !== 'editor'}>
                    <EditorWorkspace />
                  </div>
                  <div hidden={area !== 'settings'}>
                    <SettingsWorkspace
                      category={settingsCategory}
                      onCategoryChange={setSettingsCategory}
                    />
                  </div>
                </div>
                <RecoveryNotification />
                <BatchFailureNotifier queue={queue} />
                <WorkspaceStatusBar
                  queue={queue}
                  jobsOpen={jobsOpen}
                  onOpenJobs={() => setJobsOpen(true)}
                />
                <JobsTray queue={queue} isOpen={jobsOpen} onClose={() => setJobsOpen(false)} />
              </div>
            </AppShell>
          </DouyinDownloadsProvider>
        </NotificationsProvider>
      </EditorProvider>
    </CatalogProvider>
  );
}
