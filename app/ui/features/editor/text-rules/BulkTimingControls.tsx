import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shiftCueTimes } from '../../../../core/subtitles/text-rules';
import { useEditor } from '../EditorContext';

export function BulkTimingControls() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [delta, setDelta] = useState(0);
  const [scope, setScope] = useState('all');
  const [error, setError] = useState(false);
  function apply() {
    if (!editor.media) return;
    try {
      editor.changeLayerCues(
        shiftCueTimes(
          editor.activeLayer.cues,
          delta,
          editor.duration,
          scope === 'selected' ? [editor.selected] : undefined,
        ),
      );
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <Collapsible trigger={t('timingBulk')} defaultIsOpen={false}>
      <div className="business-toolbar">
        <NumberInput
          label={t('timingDelta')}
          value={delta}
          min={-86400000}
          max={86400000}
          step={100}
          isIntegerOnly
          isWheelEnabled={false}
          onChange={setDelta}
        />
        <Selector
          label={t('rulesScope')}
          value={scope}
          onChange={setScope}
          options={['all', 'selected'].map((value) => ({ value, label: t(`rulesScope_${value}`) }))}
        />
        <Button
          label={t('timingApply')}
          isDisabled={
            !delta || !editor.activeLayer.cues.length || (scope === 'selected' && !editor.selected)
          }
          onClick={apply}
        />
      </div>
      <p className="field-help">{t('timingHelp')}</p>
      {error && <Banner status="error" title={t('timingRange')} />}
    </Collapsible>
  );
}
