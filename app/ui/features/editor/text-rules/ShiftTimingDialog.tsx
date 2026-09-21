import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shiftCueTimes } from '../../../../core/subtitles/text-rules';
import { useEditor } from '../EditorContext';

export function ShiftTimingDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
      onClose();
    } catch {
      setError(true);
    }
  }
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} purpose="form" width={480}>
      <DialogHeader title={t('timingBulk')} onOpenChange={(open) => !open && onClose()} />
      <div className="business-form">
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
            options={['all', 'selected'].map((value) => ({
              value,
              label: t(`rulesScope_${value}`),
            }))}
          />
        </div>
        <Text as="p" type="supporting">
          {t('timingHelp')}
        </Text>
        {error && <Banner status="error" title={t('timingRange')} />}
        <div className="action-row">
          <Button
            label={t('timingApply')}
            variant="primary"
            isDisabled={
              !delta ||
              !editor.activeLayer.cues.length ||
              (scope === 'selected' && !editor.selected)
            }
            onClick={apply}
          />
          <Button label={t('cancel')} onClick={onClose} />
        </div>
      </div>
    </Dialog>
  );
}
