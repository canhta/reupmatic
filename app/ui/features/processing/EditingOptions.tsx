import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../core/editing/edit-recipe';
import { AudioTools } from '../editor/audio-tools/AudioTools';
import { VideoTools } from '../editor/video-tools/VideoTools';

export function EditingOptions({
  value,
  disabled,
  onChange,
}: {
  value?: EditingRecipe;
  disabled: boolean;
  onChange(value: EditingRecipe | undefined): void;
}) {
  const { t } = useTranslation();
  function update(patch: Partial<EditingRecipe>) {
    const next = { ...value, ...patch };
    for (const key of Object.keys(next) as (keyof EditingRecipe)[]) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(Object.keys(next).length ? next : undefined);
  }
  return (
    <div className="business-form">
      <Collapsible trigger={t('editVideoTitle')} defaultIsOpen={false}>
        <VideoTools value={value ?? {}} disabled={disabled} onChange={update} />
      </Collapsible>
      <Collapsible trigger={t('editAudioTitle')} defaultIsOpen={false}>
        <AudioTools value={value ?? {}} disabled={disabled} onChange={update} />
      </Collapsible>
      {value && (
        <Button label={t('editReset')} isDisabled={disabled} onClick={() => onChange(undefined)} />
      )}
    </div>
  );
}
