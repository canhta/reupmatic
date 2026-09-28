import { Button } from '@astryxdesign/core/Button';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { OriginalImportOptions } from '../../../core/library/library-contracts';
import { registerMenuCommand } from '../../shell/menuCommands';

interface Props {
  busy: boolean;
  onImport(options: OriginalImportOptions): Promise<void>;
}

const IMPORT_OPTIONS: OriginalImportOptions = { mode: 'reference', duplicates: 'reuse' };

export function LibraryImport({ busy, onImport }: Props) {
  const { t } = useTranslation();

  useEffect(
    () =>
      registerMenuCommand('sources.importLocalFile', () => {
        if (!busy) void onImport(IMPORT_OPTIONS);
      }),
    [busy, onImport],
  );

  return (
    <Button
      label={t('libraryImport')}
      variant="primary"
      isDisabled={busy}
      onClick={() => void onImport(IMPORT_OPTIONS)}
    />
  );
}
