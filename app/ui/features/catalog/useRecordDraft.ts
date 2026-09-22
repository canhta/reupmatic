import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { useUnsavedCatalogDraft } from './CatalogProvider';

export function useRecordDraft<T>(initial: () => T) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(value));
  const dirty = JSON.stringify(value) !== baseline;
  useUnsavedCatalogDraft(dirty);

  function replace(next: T) {
    setValue(next);
    setBaseline(JSON.stringify(next));
  }

  const discardOptions = {
    title: t('confirmDiscardTitle'),
    confirmLabel: t('confirmDiscardAction'),
    destructive: true,
  };

  async function choose(next: T) {
    if (dirty && !(await confirm(t('catalogDiscard'), discardOptions))) return false;
    replace(next);
    return true;
  }

  async function reset() {
    if (await confirm(t('catalogDiscard'), discardOptions)) replace(JSON.parse(baseline) as T);
  }

  async function discard() {
    if (!dirty) return true;
    if (!(await confirm(t('catalogDiscard'), discardOptions))) return false;
    replace(JSON.parse(baseline) as T);
    return true;
  }

  return { value, setValue, dirty, replace, choose, reset, discard };
}
