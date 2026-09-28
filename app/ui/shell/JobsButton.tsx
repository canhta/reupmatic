import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';

export function JobsButton({
  statusLabel,
  isOpen,
  onOpen,
}: {
  statusLabel: string;
  isOpen: boolean;
  onOpen(): void;
}) {
  const { t } = useTranslation();
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
      <Text type="supporting" className="workspace-status-queue">
        {statusLabel}
      </Text>
    </button>
  );
}
