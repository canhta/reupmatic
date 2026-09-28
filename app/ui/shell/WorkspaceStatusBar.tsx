import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import { batchActivity, joinActivity } from '../../core/batch/batch-activity';
import { editorActivity } from '../../core/editing/editor-activity';
import { batchPhaseKey } from '../features/batch/phase';
import type { useBatchQueue } from '../features/batch/useBatchQueue';
import { useEditor } from '../features/editor/EditorContext';
import { useEditorGenerators } from '../features/editor/EditorGeneratorContext';
import { useDouyinDownloads } from '../features/library/sources/DouyinDownloadsContext';
import { JobsButton } from './JobsButton';
import { NotificationsButton } from './NotificationsButton';

export function WorkspaceStatusBar({
  queue,
  jobsOpen,
  onOpenJobs,
}: {
  queue: ReturnType<typeof useBatchQueue>;
  jobsOpen: boolean;
  onOpenJobs(): void;
}) {
  const { t } = useTranslation();
  const downloads = useDouyinDownloads();
  const editor = useEditor();
  const generators = useEditorGenerators();
  const live =
    queue.snapshot?.items.filter((item) =>
      ['queued', 'running', 'cancelling', 'interrupted'].includes(item.state),
    ).length ?? 0;
  const queueStatus = queue.error
    ? t('queueUnavailable')
    : live > 0
      ? t('jobsActive', { count: live })
      : t('queueIdle');
  const downloadSnapshot = downloads.snapshot;
  const downloadActive =
    downloadSnapshot?.items.filter((item) => item.state === 'queued' || item.state === 'running')
      .length ?? 0;
  const downloadStatus = downloadSnapshot
    ? downloadActive > 0
      ? t('douyinDownloadActive', { count: downloadActive })
      : t('douyinDownloadSummary', {
          completed: downloadSnapshot.completed,
          reused: downloadSnapshot.reused,
          failed: downloadSnapshot.failed,
        })
    : '';

  const activity = batchActivity(queue.snapshot);
  // The jobs button already reports an unavailable queue.
  const batchLabel = queue.error
    ? ''
    : activity.kind === 'running'
      ? [
          activity.name,
          activity.phase ? t(batchPhaseKey(activity.phase)) : '',
          activity.percent == null ? '' : `${activity.percent}%`,
        ]
          .filter(Boolean)
          .join(' · ')
      : activity.kind === 'paused'
        ? t('batchPaused')
        : '';
  const operation = editorActivity({
    export: editor.job ? { phase: editor.job.phase, fraction: null } : null,
    speech: generators.speech.active,
    ocr: generators.vision.active,
    translate: generators.translation.active,
    voiceover: generators.synthesis.active,
  });
  const editorLabel = operation
    ? [
        t(`editorOperation_${operation.kind}`),
        t(operation.phase),
        operation.percent == null ? '' : `${operation.percent}%`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const activityLabel = joinActivity(batchLabel, editorLabel);
  const running = activity.kind === 'running' || Boolean(operation);

  return (
    <section className="workspace-statusbar" aria-label={t('workspaceStatus')}>
      {activityLabel ? (
        <div className="workspace-status-activity" role="status">
          <StatusDot
            variant={running ? 'accent' : 'warning'}
            label={activityLabel}
            isPulsing={running}
          />
          <Text type="supporting" className="workspace-status-queue">
            {activityLabel}
          </Text>
        </div>
      ) : null}
      {downloadStatus ? (
        <Text type="supporting" role="status">
          {downloadStatus}
        </Text>
      ) : null}
      <JobsButton statusLabel={queueStatus} isOpen={jobsOpen} onOpen={onOpenJobs} />
      <NotificationsButton />
    </section>
  );
}
