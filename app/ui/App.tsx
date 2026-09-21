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
  // Lifted here, not local to SettingsWorkspace, so a generator's "Set up…" link
  // (useEditorSession.openSettings, via EditorProvider's onOpenSettings below) can land on a
  // specific category from anywhere — the same reason `area` itself is lifted.
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('general');
  const [jobsOpen, setJobsOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const { registerDirty } = useSessionLifecycle();
  const queue = useBatchQueue((dirty) => registerDirty('batch', dirty));

  useEffect(
    () =>
      window.reupmatic.onMenuCommand(({ command, area: target, data }) => {
        if (target) setArea(target);
        // No per-feature handler to register: the shared jobs tray is owned here already, same
        // as JobsButton's onOpen. 'app.openSettings' (⌘,/Ctrl+, and the app menu's Settings…
        // command, see app/electron/menu.ts) needs no handler either — it arrives with
        // `area: 'settings'` above, which is all navigating to the destination requires (O5:
        // the shortcut/menu command now just selects the sidebar item it names, same as every
        // other peer area's menu command; no reference documents this, so this is this ticket's
        // own smallest-reversible answer, not a settled convention).
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
                // ONE unified toolbar band for the whole window: traffic lights,
                // brand, nav toggle, then the current area/document title, then
                // (right-aligned via TopNav's endContent) that area's contextual
                // actions. Previously the area title and its actions lived in a
                // second, content-column-only header row (.workspace-commandbar)
                // stacked under this one; folding them into TopNav's own slots
                // is what collapses that to a single band — see workspace.css
                // and the Shell section.
                <TopNav
                  label={t('workspaceTitleBar')}
                  // Hidden while collapsed: at the ~48px rail width there is no
                  // room for the wordmark beside the toggle, so the toggle takes
                  // the leading position the brand vacates instead of the two
                  // fighting for space.
                  // Plain text, not TopNavHeading: that component's heading span
                  // is fixed at Astryx's "large" product-heading scale, well
                  // past the 14-15px area-title scale this header band uses.
                  heading={
                    navigationCollapsed ? undefined : (
                      // Text, not a raw <span>, per UI-CC06/Astryx's own "Don't use raw HTML
                      // tags... for text" rule; weight/size match the area-title scale below
                      // it (UI-T02) since a brand mark isn't its own type role in this app.
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
                        // Heading level={4}, not a raw <h1>, per UI-CC06/UI-T02: the
                        // area/document title is a themed 14-15px semibold role, not the
                        // page's own h1 (AppShell's own docs reserve that for `children`).
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
