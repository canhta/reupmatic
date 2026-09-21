import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { useNotifications } from '../../shell/NotificationsProvider';
import { refreshRecoveryDrafts, useRecoveryDrafts } from '../projects/recovery/useRecoveryDrafts';
import { useEditor } from './EditorContext';

/**
 * Announces a recovered draft at launch, restoring the discard safeguard the deleted recovery
 * popup owned (owner). One notification at a time — the most recently updated draft —
 * carrying Open and Discard; discarding goes through the shared confirmation first. A draft found
 * while another is already announced waits its turn, so the list never floods with duplicates.
 */
export function RecoveryNotification() {
  const { t } = useTranslation();
  const editor = useEditor();
  const confirm = useConfirmation();
  const { raise, dismiss } = useNotifications();
  const drafts = useRecoveryDrafts();
  const announced = useRef<string | null>(null);

  // The header picker loads the same shared list; loading it here too keeps the launch announce
  // independent of whether the picker has ever been opened.
  useEffect(() => {
    void refreshRecoveryDrafts();
  }, []);

  useEffect(() => {
    const newest = drafts
      .filter((draft) => draft.id !== editor.documentId)
      .sort((a, b) => b.updated_at - a.updated_at)[0];
    if (!newest || newest.id === announced.current) return;
    announced.current = newest.id;
    let id = '';
    const open = () => {
      dismiss(id);
      void editor.openRecovery(newest.id, newest.revision);
    };
    const discard = async () => {
      if (!(await confirm(t('notificationsRecoveredConfirm')))) return;
      dismiss(id);
      await unwrap(
        window.reupmatic.recoveryDiscard({ id: newest.id, expected_revision: newest.revision }),
      );
      void refreshRecoveryDrafts();
    };
    id = raise(
      t('notificationsRecoveredDraft', { name: newest.source_name || t('recoveryDamaged') }),
      {
        uniqueID: `recovered-${newest.id}`,
        actions: [
          // A damaged draft cannot be opened (the picker disables it the same way); discarding it
          // is the one way to clear it, so it still announces.
          ...(newest.error
            ? []
            : [{ label: t('notificationsOpen'), onClick: open, variant: 'primary' as const }]),
          { label: t('notificationsDiscard'), onClick: () => void discard() },
        ],
      },
    );
  }, [drafts, editor, confirm, raise, dismiss, t]);

  return null;
}
