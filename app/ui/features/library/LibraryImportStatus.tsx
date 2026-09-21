import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  OriginalImportProgress,
  OriginalImportResult,
} from '../../../core/library/library-contracts';
import { unwrap } from '../../bridge/client';
import { libraryErrorKey } from './error-message';

const CLEAN_RESULT_TIMEOUT_MS = 6000;

interface Props {
  progress: OriginalImportProgress | null;
  result: OriginalImportResult | null;
  onError(reason: unknown): void;
}

// Transient import feedback: its own row under the toolbar, never beside the
// primary Import action. A clean result clears itself after a few seconds;
// a result with failures stays until the user acts on it (Safety: one
// failing batch item stays visible and actionable).
export function LibraryImportStatus({ progress, result, onError }: Props) {
  const { t } = useTranslation();
  const [cancelling, setCancelling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setCancelling(false);
    if (!result || result.rejected.length > 0) return;
    const timer = setTimeout(() => setDismissed(true), CLEAN_RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function cancel() {
    setCancelling(true);
    try {
      await unwrap(window.reupmatic.libraryCancelImport());
    } catch (error) {
      setCancelling(false);
      onError(error);
    }
  }

  if (progress?.phase === 'importing') {
    return (
      <div className="library-import-status action-row" role="status">
        <ProgressBar
          label={t('libraryImporting', { ...progress })}
          value={progress.completed}
          max={progress.total}
        />
        <Button
          label={t(cancelling ? 'cancelling' : 'cancel')}
          isDisabled={cancelling}
          onClick={() => void cancel()}
        />
      </div>
    );
  }

  if (!result || dismissed) return null;

  return (
    <div className="library-import-status">
      <Text as="p" type="body" role="status">
        {t('libraryImportSummary', {
          added: result.items.filter((item) => !item.reused).length,
          reused: result.items.filter((item) => item.reused).length,
          failed: result.rejected.length,
        })}{' '}
        {result.cancelled && t('libraryImportCancelled')}
      </Text>
      {result.rejected.length > 0 && (
        <Banner status="warning" title={t('libraryFailedImports')}>
          {result.rejected.map((item) => (
            <Text as="p" type="body" key={`${item.name}-${item.code}`}>
              {item.name}: {t(libraryErrorKey(item.code))} <code>{item.code}</code>
            </Text>
          ))}
        </Banner>
      )}
    </div>
  );
}
