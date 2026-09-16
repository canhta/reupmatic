import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  LibraryImportOptions,
  LibraryImportProgress,
  LibraryImportResult,
} from '../../../core/library/library-types';
import { unwrap } from '../../bridge/client';
import { libraryErrorKey } from './i18n';

interface Props {
  busy: boolean;
  progress: LibraryImportProgress | null;
  result: LibraryImportResult | null;
  onImport(options: LibraryImportOptions): Promise<void>;
  onError(reason: unknown): void;
}

export function LibraryImport({ busy, progress, result, onImport, onError }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<LibraryImportOptions['mode']>('reference');
  const [duplicates, setDuplicates] = useState<LibraryImportOptions['duplicates']>('reuse');
  const [cancelling, setCancelling] = useState(false);

  async function cancel() {
    setCancelling(true);
    try {
      await unwrap(window.reupmatic.libraryCancelImport());
    } catch (error) {
      setCancelling(false);
      onError(error);
    }
  }

  return (
    <div className="library-import">
      <div className="library-import-options">
        <RadioList
          label={t('libraryMode')}
          value={mode}
          isDisabled={busy}
          onChange={(value) => {
            if (value === 'reference' || value === 'copy') setMode(value);
          }}
        >
          <RadioListItem value="reference" label={t('libraryReference')} />
          <RadioListItem value="copy" label={t('libraryCopy')} />
        </RadioList>
        <RadioList
          label={t('libraryDuplicates')}
          value={duplicates}
          isDisabled={busy}
          onChange={(value) => {
            if (value === 'reuse' || value === 'separate') setDuplicates(value);
          }}
        >
          <RadioListItem value="reuse" label={t('libraryReuse')} />
          <RadioListItem value="separate" label={t('librarySeparate')} />
        </RadioList>
      </div>
      <p className="field-help">{t('libraryCopyHelp')}</p>
      <Button
        label={t('libraryImport')}
        variant="primary"
        isDisabled={busy}
        onClick={() => {
          setCancelling(false);
          void onImport({ mode, duplicates });
        }}
      />
      {progress?.phase === 'importing' && (
        <div className="action-row" role="status">
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
      )}
      {result && (
        <p role="status">
          {t('libraryImportSummary', {
            added: result.items.filter((item) => !item.reused).length,
            reused: result.items.filter((item) => item.reused).length,
            failed: result.rejected.length,
          })}{' '}
          {result.cancelled && t('libraryImportCancelled')}
        </p>
      )}
      {result && result.rejected.length > 0 && (
        <Banner status="warning" title={t('libraryFailedImports')}>
          {result.rejected.map((item) => (
            <p key={`${item.name}-${item.code}`}>
              {item.name}: {t(libraryErrorKey(item.code))} <code>{item.code}</code>
            </p>
          ))}
        </Banner>
      )}
    </div>
  );
}
