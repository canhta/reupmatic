import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../../editor/EditorContext';

export function EditorRecoveryNotice() {
  const { t, i18n } = useTranslation();
  const editor = useEditor();
  const outdated = editor.autosave.status.error === 'RECOVERY_VERSION';

  return (
    <>
      {editor.media && (
        <VisuallyHidden as="div" role="status">
          {t(editor.autosave.status.key)}
          {editor.autosave.status.updatedAt &&
            ` · ${new Date(editor.autosave.status.updatedAt).toLocaleTimeString(i18n.language)}`}
        </VisuallyHidden>
      )}
      {editor.autosave.status.error && (
        <Banner
          status="error"
          title={t('recoveryFailed')}
          description={t(outdated ? 'recoveryVersion' : 'recoveryFailureHelp')}
          endContent={
            // An outdated store refuses every save, so a retry would only fail again.
            !outdated && (
              <Button
                label={t('recoveryRetry')}
                onClick={() => void editor.autosave.flush().catch(editor.report)}
              />
            )
          }
        />
      )}
    </>
  );
}
