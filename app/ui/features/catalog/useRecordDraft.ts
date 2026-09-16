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

  async function choose(next: T) {
    if (dirty && !await confirm(t('catalogDiscard'))) return false;
    replace(next);
    return true;
  }

  async function reset() {
    if (await confirm(t('catalogDiscard'))) replace(JSON.parse(baseline) as T);
  }

  return { value, setValue, dirty, replace, choose, reset };
}
