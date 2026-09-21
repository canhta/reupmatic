import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import type { useBatchQueue } from '../features/batch/useBatchQueue';
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

  return (
    <section className="workspace-statusbar" aria-label={t('workspaceStatus')}>
      <div className="workspace-status-local">
        <StatusDot variant={queue.error ? 'error' : 'success'} label={t('localProcessing')} />
        <Text type="supporting">{t('localProcessing')}</Text>
      </div>
      {downloadStatus ? (
        <Text type="supporting" role="status">
          {downloadStatus}
        </Text>
      ) : null}
      <JobsButton queue={queue} statusLabel={queueStatus} isOpen={jobsOpen} onOpen={onOpenJobs} />
      <NotificationsButton />
    </section>
  );
}
