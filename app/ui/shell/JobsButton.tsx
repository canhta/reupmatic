import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import type { useBatchQueue } from '../features/batch/useBatchQueue';

// A quiet status-bar segment, not a labelled button: the visible content is
// the queue's own status text, and the whole segment opens the Jobs tray.
// The accessible name stays "Batch & jobs" for screen-reader users, since
// the status text alone ("2 queued · 1 running") doesn't say what clicking
// it does.
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
