import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import type { useBatchQueue } from '../features/batch/useBatchQueue';

export function JobsButton({
  queue,
  statusLabel,
  isOpen,
  onOpen,
}: {
  queue: ReturnType<typeof useBatchQueue>;
  statusLabel: string;
  isOpen: boolean;
  onOpen(): void;
}) {
  const { t } = useTranslation();
  const live =
    queue.snapshot?.items.filter((item) =>
      ['queued', 'running', 'cancelling', 'interrupted'].includes(item.state),
    ).length ?? 0;
  return (
    <button
      type="button"
      id="shared-jobs-trigger"
      className="workspace-status-jobs"
      aria-label={t('batchTitle')}
      aria-controls="shared-jobs-tray"
      aria-expanded={isOpen}
      onClick={onOpen}
    >
      {live > 0 && <StatusDot variant="accent" label={t('batchRunning')} isPulsing />}
      <Text type="supporting" className="workspace-status-queue">
        {statusLabel}
      </Text>
    </button>
  );
}
