import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { previewLayerCopy, type LayerCopyPreview } from '../../../../core/subtitles/layers/commands';
import { getTextLayer, textLayerNames, type TextLanguage, type TextLayerName } from '../../../../core/subtitles/layers/document';
import { useEditor } from '../EditorContext';

export function TextLayerControls() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [from, setFrom] = useState<TextLayerName>('transcript');
  const [preview, setPreview] = useState<{ value: LayerCopyPreview; revision: number } | null>(null);
  const [error, setError] = useState('');
  const { activeTextLayer: to, activeLayer: layer } = editor;
  const applicable = preview && preview.revision === editor.revision && preview.value.from === from && preview.value.to === to;
  const options = textLayerNames.map(value => ({ value,
    label: `${t(`textLayer_${value}`)} (${getTextLayer(editor.textSnapshot, value).cues.length})` }));

  const previousCues = preview ? getTextLayer(editor.textSnapshot, preview.value.to).cues : [];

  function prepare() {
    setPreview(null);
    try {
      setPreview({ value: previewLayerCopy(editor.textSnapshot, from, to), revision: editor.rev.current });
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'INVALID_TEXT_LAYERS'); }
  }

  return <div className="business-form">
    <div className="business-toolbar">
      <Selector label={t('textEditingLayer')} value={to} options={options}
        onChange={value => { if (textLayerNames.includes(value as TextLayerName)) editor.selectTextLayer(value as TextLayerName); }} />
      <Selector label={t('textLayerLanguage')} value={layer.language ?? 'unknown'}
        options={['unknown', 'en', 'vi', 'zh'].map(value => ({ value,
          label: value === 'unknown' ? t('textLanguageUnknown') : t(`visionLanguage_${value}`) }))}
        onChange={value => {
          if (['unknown', 'en', 'vi', 'zh'].includes(value)) editor.changeLayerCues(layer.cues, to,
            { language: value === 'unknown' ? null : value as TextLanguage });
        }} />
    </div>
    <p className="field-help">{t('textLayersHelp')}</p>
    <p role="status">{t('textLayerOrigin', { origin: t(`textOrigin_${layer.origin.kind}`) })}
      {layer.edited ? ` · ${t('textManuallyEdited')}` : ''}</p>
    {layer.stale && <Banner status="warning" title={t('textLayerStale')}
      description={t('textLayerStaleHelp')} />}
    {(to === 'spoken' || to === 'translated') && <p className="field-help">{t('textServicesUnavailable')}</p>}
    <Collapsible trigger={t('textCopyTitle')} defaultIsOpen={false}>
      <p>{t('textCopyHelp', { target: t(`textLayer_${to}`) })}</p>
      <div className="business-toolbar">
        <Selector label={t('textCopyFrom')} value={from} options={options}
          onChange={value => { if (textLayerNames.includes(value as TextLayerName)) setFrom(value as TextLayerName); }} />
        <Button label={t('textCopyPreview')} isDisabled={from === to || editor.opening}
          onClick={prepare} />
      </div>
      {error && <Banner status="error" title={t(error === 'TEXT_LAYER_STALE' ? 'textLayerStale'
        : error === 'TEXT_LAYER_EMPTY' ? 'textLayerEmpty'
        : error === 'TRANSLATION_LANGUAGE_MISMATCH' ? 'translationLanguageMismatch' : 'textLayerInvalid')} description={<code>{error}</code>} />}
      {preview && <>
        <p role="status">{t('textCopyCount', { count: preview.value.cues.length, target: t(`textLayer_${preview.value.to}`) })}</p>
        {!applicable && <p role="status">{t('rulesStale')}</p>}
        <Table density="compact" aria-label={t('rulesComparison')}>
          <TableHeader><TableRow isHeaderRow><TableHeaderCell>{t('rulesBefore')}</TableHeaderCell>
            <TableHeaderCell>{t('rulesAfter')}</TableHeaderCell></TableRow></TableHeader>
          <TableBody>{preview.value.cues.slice(0, 25).map((cue, index) => <TableRow key={cue.id}>
            <TableCell><span className="rule-comparison-text">{previousCues[index]?.text ?? '—'}</span></TableCell>
            <TableCell><span className="rule-comparison-text">{cue.text}</span></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {preview.value.cues.length > 25 && <p>{t('textFirst25')}</p>}
        {layer.stale && (layer.origin.kind === 'copy' || layer.origin.kind === 'translation') && layer.origin.layer === from && <>
          <p>{t('textKeepReviewedHelp')}</p>
          <Button label={t('textKeepReviewed')} isDisabled={!applicable || editor.opening} onClick={() => {
            try { editor.reviewLayerSource(preview.value, preview.revision); setPreview(null); setError(''); }
            catch (reason) { editor.report(reason); }
          }} />
        </>}
        <Button label={t('textCopyApply')} variant="primary" isDisabled={!applicable || editor.opening}
          onClick={() => {
            try { editor.applyLayerCopy(preview.value, preview.revision); setPreview(null); setError(''); }
            catch (reason) { editor.report(reason); }
          }} />
      </>}
    </Collapsible>
  </div>;
}
