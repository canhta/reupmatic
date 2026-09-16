import { Button } from '@astryxdesign/core/Button';
import { useTranslation } from 'react-i18next';
import { LocaleSelect } from '../../shell/LocaleSelect';
import { useEditor } from './EditorContext';

export function EditorHeader() {
  const { t } = useTranslation();
  const editor = useEditor();
  const locked = editor.busy || editor.savingProject || editor.opening;
  return (
    <header className="workspace-header">
      <div><h1>{editor.media?.name || t('title')}</h1><p>{t('exercise')}</p></div>
      <LocaleSelect />
      <Button label={t('open')} variant="primary" isDisabled={locked}
        onClick={() => void editor.open()} />
      <Button label={t('openProject')} isDisabled={locked}
        onClick={() => void editor.openProject()} />
      <Button label={t('saveProject')} isDisabled={!editor.media || editor.savingProject || editor.opening}
        onClick={() => void editor.saveCurrentProject()} />
    </header>
  );
}
