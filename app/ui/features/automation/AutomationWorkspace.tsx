import { Tab, TabList } from '@astryxdesign/core/TabList';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { registerMenuCommand } from '../../shell/menuCommands';
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

  // Native Automation-menu "View Run History" switches tabs the
  // same way clicking the Run history tab does.
  useEffect(() => registerMenuCommand('automation.viewRunHistory', () => setTab('runs')), []);

  return (
    <div className="business-area">
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
      <div
        role="tabpanel"
        id="workflows-panel"
        aria-labelledby="workflows-tab"
        hidden={tab !== 'workflows'}
      >
        <WorkflowManager
          queuePaused={queue.snapshot?.paused ?? true}
          jobs={queue.snapshot?.items ?? []}
          onRun={(id) => {
            setRunId(id);
            setTab('runs');
          }}
        />
      </div>
      <div role="tabpanel" id="runs-panel" aria-labelledby="runs-tab" hidden={tab !== 'runs'}>
        <RunHistory queue={queue} selected={runId} onSelect={setRunId} />
      </div>
      <div
        role="tabpanel"
        id="workflow-folders-panel"
        aria-labelledby="workflow-folders-tab"
        hidden={tab !== 'folders'}
      >
        <FolderAutomation onDirty={onFolderDirty} />
      </div>
    </div>
  );
}
