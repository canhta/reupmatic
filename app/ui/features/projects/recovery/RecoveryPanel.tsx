import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoverySummary } from '../../../../core/projects/recovery/recovery-types';
import { unwrap } from '../../../bridge/client';
import { useConfirmation } from '../../../design-system/ConfirmationProvider';
import { useEditor } from '../../editor/EditorContext';

export function RecoveryPanel() {
  const { t, i18n } = useTranslation();
  const editor = useEditor();
  const confirm = useConfirmation();
  const [drafts, setDrafts] = useState<RecoverySummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setDrafts(await unwrap(window.reupmatic.recoveryList()));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'RECOVERY_UNAVAILABLE');
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const visible = drafts.filter((draft) => draft.id !== editor.documentId);
  async function discard(draft: RecoverySummary) {
    if (!(await confirm(t('recoveryDiscardConfirm')))) return;
    setBusy(true);
    try {
      await unwrap(
        window.reupmatic.recoveryDiscard({ id: draft.id, expected_revision: draft.revision }),
      );
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'RECOVERY_UNAVAILABLE');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="business-form">
      {editor.media && (
        <span role="status">
          {t(editor.autosave.status.key)}
          {editor.autosave.status.updatedAt &&
            ` · ${new Date(editor.autosave.status.updatedAt).toLocaleTimeString(i18n.language)}`}
        </span>
      )}
      {editor.autosave.status.error && (
        <Banner
          status="error"
          title={t('recoveryFailed')}
          description={t('recoveryFailureHelp')}
          endContent={
            <Button
              label={t('recoveryRetry')}
              onClick={() => void editor.autosave.flush().catch(editor.report)}
            />
          }
        />
      )}
      <Collapsible trigger={t('recoveryTitle', { count: visible.length })} defaultIsOpen={false}>
        <p className="field-help">{t('recoveryHelp')}</p>
        <Button label={t('recoveryRefresh')} isDisabled={busy} onClick={() => void refresh()} />
        {error && (
          <Banner
            status="error"
            title={t('recoveryUnavailable')}
            description={<code>{error}</code>}
          />
        )}
        {!visible.length && !busy && <p>{t('recoveryEmpty')}</p>}
        {visible.length > 0 && (
          <Table density="compact" aria-label={t('recoveryRecords')}>
            <TableHeader>
              <TableRow isHeaderRow>
                <TableHeaderCell>{t('recoverySource')}</TableHeaderCell>
                <TableHeaderCell>{t('recoveryUpdated')}</TableHeaderCell>
                <TableHeaderCell>{t('recoveryActions')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((draft) => (
                <TableRow key={draft.id}>
                  <TableCell>
                    {draft.source_name || t('recoveryDamaged')}
                    <small> · {draft.id.slice(0, 8)}</small>
                  </TableCell>
                  <TableCell>{new Date(draft.updated_at).toLocaleString(i18n.language)}</TableCell>
                  <TableCell>
                    <div className="business-toolbar">
                      <Button
                        label={t('recoveryOpen')}
                        isDisabled={busy || editor.opening || editor.busy || Boolean(draft.error)}
                        onClick={() => void editor.openRecovery(draft.id, draft.revision)}
                      />
                      <Button
                        label={t('recoveryDiscard')}
                        isDisabled={busy}
                        onClick={() => void discard(draft)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Collapsible>
    </div>
  );
}
