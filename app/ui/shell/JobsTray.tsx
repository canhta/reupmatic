import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BatchPanel } from '../features/batch/BatchPanel';
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
  const tray = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      requestAnimationFrame(() => tray.current?.querySelector<HTMLElement>('button')?.focus());
      return;
    }
    if (wasOpen.current) {
      document.querySelector<HTMLElement>('#shared-jobs-trigger')?.focus();
      wasOpen.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <aside id="shared-jobs-tray" ref={tray} className="jobs-tray" aria-label={t('batchTitle')}>
      <header className="jobs-tray-header">
        <Heading level={5}>{t('batchTitle')}</Heading>
        <IconButton
          label={t('closeJobs')}
          tooltip={t('closeJobs')}
          variant="ghost"
          size="sm"
          icon={<Icon icon="close" size="sm" />}
          onClick={onClose}
        />
      </header>
      <div className="jobs-tray-scroll">
        <BatchPanel queue={queue} alwaysOpen />
      </div>
    </aside>
  );
}
