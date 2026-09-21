import { Button } from '@astryxdesign/core/Button';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { OriginalImportOptions } from '../../../core/library/library-contracts';
import { registerMenuCommand } from '../../shell/menuCommands';

interface Props {
  busy: boolean;
  onImport(options: OriginalImportOptions): Promise<void>;
}

// D-50: the only options this UI ever sends now.
const IMPORT_OPTIONS: OriginalImportOptions = { mode: 'reference', duplicates: 'reuse' };

export function LibraryImport({ busy, onImport }: Props) {
  const { t } = useTranslation();

  // Native Sources-menu "Import Local File…" triggers the same import the
  // toolbar button below triggers, gated the same way (isDisabled).
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
