import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SidePanel } from '../design-system/SidePanel';
import { BatchPanel, BatchQueueFooter } from '../features/batch/BatchPanel';
import type { useBatchQueue } from '../features/batch/useBatchQueue';

export function JobsTray({
  queue,
  isOpen,
  onClose,
}: {
  queue: ReturnType<typeof useBatchQueue>;
  isOpen: boolean;
  onClose(): void;
}) {
  const { t } = useTranslation();

  // The tray keeps focus only while the queue has a control to press, so Escape is caught
  // window-wide; a dialog that already handled the key sets defaultPrevented.
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  return (
    <SidePanel
      open={isOpen}
      id="shared-jobs-tray"
      label={t('batchTitle')}
      className="jobs-panel"
      onClose={onClose}
      footer={queue.snapshot && <BatchQueueFooter queue={queue} />}
    >
      <BatchPanel queue={queue} />
    </SidePanel>
  );
}
