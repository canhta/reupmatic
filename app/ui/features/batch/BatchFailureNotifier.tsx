import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../shell/NotificationsProvider';
import type { useBatchQueue } from './useBatchQueue';

export function BatchFailureNotifier({ queue }: { queue: ReturnType<typeof useBatchQueue> }) {
  const { t } = useTranslation();
  const { raiseError } = useNotifications();
  const reported = useRef<Set<string> | null>(null);

  useEffect(() => {
    const snapshot = queue.snapshot;
    if (!snapshot) return;
    if (reported.current === null) {
      reported.current = new Set(
        snapshot.items.filter((item) => item.state === 'failed').map((item) => item.id),
      );
      return;
    }
    for (const item of snapshot.items) {
      if (item.state !== 'failed') {
        reported.current.delete(item.id);
        continue;
      }
      if (reported.current.has(item.id)) continue;
      reported.current.add(item.id);
      raiseError(
        t('notificationsJobFailed', { name: item.name }),
        `batch-failed-${item.id}-${item.attempt}`,
      );
    }
  }, [queue.snapshot, raiseError, t]);

  return null;
}
