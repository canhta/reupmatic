import { Tab, TabList } from '@astryxdesign/core/TabList';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { registerMenuCommand } from '../../shell/menuCommands';
import { WorkspaceFrame, WorkspaceTabPanel } from '../../shell/WorkspaceFrame';
import type { useBatchQueue } from '../batch/useBatchQueue';
import { FolderAutomation } from '../folders/FolderAutomation';
import { RunHistory } from './RunHistory';
import { WorkflowManager } from './WorkflowManager';

export function AutomationWorkspace({
  queue,
  onFolderDirty,
}: {
  queue: ReturnType<typeof useBatchQueue>;
  onFolderDirty(value: boolean): void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('workflows');
  const [runId, setRunId] = useState('');

  useEffect(() => registerMenuCommand('automation.viewRunHistory', () => setTab('runs')), []);

  return (
    <WorkspaceFrame>
      <TabList value={tab} onChange={setTab} role="tablist" aria-label={t('automation')}>
        <Tab
          value="workflows"
          label={t('workflowsTitle')}
          id="workflows-tab"
          panelId="workflows-panel"
        />
        <Tab value="runs" label={t('workflowRuns')} id="runs-tab" panelId="runs-panel" />
        <Tab
          value="folders"
          label={t('workflowFolders')}
          id="workflow-folders-tab"
          panelId="workflow-folders-panel"
        />
      </TabList>
      <WorkspaceTabPanel id="workflows-panel" tabId="workflows-tab" active={tab === 'workflows'}>
        <WorkflowManager
          queuePaused={queue.snapshot?.paused ?? true}
          jobs={queue.snapshot?.items ?? []}
          onRun={(id) => {
            setRunId(id);
            setTab('runs');
          }}
        />
      </WorkspaceTabPanel>
      <WorkspaceTabPanel id="runs-panel" tabId="runs-tab" active={tab === 'runs'}>
        <RunHistory queue={queue} selected={runId} onSelect={setRunId} />
      </WorkspaceTabPanel>
      <WorkspaceTabPanel
        id="workflow-folders-panel"
        tabId="workflow-folders-tab"
        active={tab === 'folders'}
      >
        <FolderAutomation onDirty={onFolderDirty} />
      </WorkspaceTabPanel>
    </WorkspaceFrame>
  );
}
