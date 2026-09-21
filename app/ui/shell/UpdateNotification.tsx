import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationsProvider';

export function UpdateNotification() {
  const { t } = useTranslation();
  const { raise } = useNotifications();
  useEffect(
    () =>
      window.reupmatic.onUpdateDownloaded(({ version }) => {
        raise(t('updateReady', { version }), {
          uniqueID: 'app-update',
          actions: [
            {
              label: t('updateRestart'),
              variant: 'primary',
              onClick: () => void window.reupmatic.appInstallUpdate(),
            },
          ],
        });
      }),
    [raise, t],
  );
  return null;
}
