import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Selector } from '@astryxdesign/core/Selector';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../EditorContext';

export function SubtitleExportPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [format, setFormat] = useState<'srt' | 'ass'>('srt');
  const [timing, setTiming] = useState<'source' | 'output'>('source');
  const [saving, setSaving] = useState(false);
  const disabled = saving || editor.opening || !editor.cap?.pysubs2 || !editor.media;
  async function save() {
    if (saving) return;
    setSaving(true);
    try { await editor.saveSubtitles(timing, format); }
    finally { setSaving(false); }
  }
  return <Collapsible trigger={t('styleExportTitle')} defaultIsOpen={false}>
    <p>{t('textExportLayer', { layer: t(`textLayer_${editor.activeTextLayer}`) })}</p>
    <RadioList label={t('styleExportFormat')} value={format} isDisabled={disabled}
      onChange={value => { if (value === 'srt' || value === 'ass') setFormat(value); }}>
      <RadioListItem value="srt" label="SRT" description={t('styleExportSrtHelp')} />
      <RadioListItem value="ass" label="ASS" description={t('styleExportAssHelp')} />
    </RadioList>
    <Selector label={t('styleExportTiming')} value={timing} isDisabled={disabled}
      options={[{ value: 'source', label: t(editor.composition ? 'compositionTiming' : 'styleExportSource') }, { value: 'output', label: t('styleExportOutput') }]}
      onChange={value => { if (value === 'source' || value === 'output') setTiming(value); }} />
    <p className="field-help">{t(editor.composition ? 'compositionClock' : 'styleExportTimingHelp')}</p>
    <Button label={t('styleExportSave')} variant="primary" isDisabled={disabled} onClick={() => void save()} />
  </Collapsible>;
}
