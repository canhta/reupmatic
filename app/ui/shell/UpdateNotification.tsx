import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationsProvider';

/**
 * One notification when a downloaded update is ready (D-64, ticket 07): the host pushes
 * `update-downloaded`, this raises the app's one message with a restart action, and the update
 * otherwise installs on the next quit. Renders nothing.
 */
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
