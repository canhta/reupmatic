import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpeechLanguage } from '../../../core/speech/recognition';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { useEditor } from '../editor/EditorContext';
import { speechErrorKey } from './i18n';
import { useSpeechJob } from './useSpeechJob';

export function SpeechPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const media = editor.media;
  const job = useSpeechJob({ documentId: editor.documentId, assetId: media?.asset_id ?? '',
    revision: editor.revision, duration: media?.duration_ms ?? 0,
    start: editor.sampleStart, end: editor.sampleEnd, hasAudio: Boolean(media?.has_audio),
    composed: Boolean(editor.composition) });
  const [language, setLanguage] = useState<SpeechLanguage>('vi');
  const [scope, setScope] = useState<'sample' | 'full'>('sample');
  const busy = Boolean(job.active) || job.settingUp;
  const available = job.models?.available && job.models.languages.includes(language);
  const draft = job.draft;
  const fresh = draft?.revision === editor.revision && draft?.documentId === editor.documentId && !editor.composition;
  const before = getTextLayer(editor.textSnapshot, 'transcript').cues;
  return <Section variant="transparent" padding={0} className="vision-panel" aria-label={t('speechTitle')}>
    <div className="action-row"><h2>{t('speechTitle')}</h2>
      <Button label={t('visionRefresh')} isDisabled={job.checking || busy} onClick={() => void job.refresh()} /></div>
    <p>{t('speechIntro')}</p>
    <p className="field-help">{t('speechTimingHelp')}</p>
    {editor.composition ? <Banner status="warning" title={t('speechComposition')} />
      : !media?.has_audio && <Banner status="warning" title={t('speechNoAudio')} />}
    <p role="status">{job.checking ? t('visionChecking') : job.models?.available ? t('speechReady')
      : t(speechErrorKey(job.models?.code || 'MODEL_MISSING'))}</p>
    <Collapsible trigger={t('speechSetup')} defaultIsOpen={false}>
      <p>{t('speechSetupHelp')}</p>
      <Button label={t('speechChooseManifest')} isDisabled={busy} onClick={() => void job.configure()} />
      {job.models?.model_id && <p>{t('speechModelId')} <code>{job.models.model_id}</code></p>}
    </Collapsible>
    {job.settingUp && <div className="action-row" role="status">
      <ProgressBar label={t('speechVerifying')} isIndeterminate />
      <Button label={t('cancel')} onClick={() => void job.cancelSetup()} /></div>}
    <div className="business-toolbar">
      <Selector label={t('speechLanguage')} value={language} isDisabled={busy}
        options={(['en', 'vi', 'zh'] as const).map(value => ({ value, label: t(`visionLanguage_${value}`) }))}
        onChange={value => { if (value === 'en' || value === 'vi' || value === 'zh') setLanguage(value); }} />
      <Selector label={t('speechScope')} value={scope} isDisabled={busy}
        options={[{ value: 'sample', label: t('speechSample') }, { value: 'full', label: t('speechFull') }]}
        onChange={value => { if (value === 'sample' || value === 'full') setScope(value); }} />
      <Button label={t('speechStart')} variant="primary"
        isDisabled={busy || editor.opening || !available || !media?.has_audio || Boolean(editor.composition)}
        onClick={() => void job.start(language, scope)} />
    </div>
    {job.models?.available && !available && <p role="status">{t('visionLanguageMissing')}</p>}
    {job.active && <div className="action-row" role="status">
      <ProgressBar label={t(job.active.phase)} max={1} value={job.active.fraction ?? undefined}
        isIndeterminate={job.active.fraction === null} />
      <Button label={t('cancel')} isDisabled={job.active.phase === 'cancelling'} onClick={() => void job.cancel()} />
    </div>}
    {job.error && <Banner status="error" title={t(speechErrorKey(job.error))} description={<code>{job.error}</code>} />}
    {draft && <>
      <h3>{t('speechDraft')}</h3>
      <p>{t('speechReplaceHelp', { count: draft.data.cues.length })}</p>
      <p className="field-help">{t('speechResultInfo', { language: t(`visionLanguage_${draft.data.language}`),
        start: draft.data.start_ms / 1000, end: draft.data.end_ms / 1000, runtime: draft.data.runtime })}</p>
      {draft.data.cues.length === 0 ? <p role="status">{t('speechEmpty')}</p> : <>
        {!fresh && <Banner status="warning" title={t('rulesStale')} description={t('speechStaleHelp')} />}
        <Table density="compact" aria-label={t('speechDraft')}>
          <TableHeader><TableRow isHeaderRow><TableHeaderCell>{t('speechTime')}</TableHeaderCell>
            <TableHeaderCell>{t('rulesBefore')}</TableHeaderCell><TableHeaderCell>{t('rulesAfter')}</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{draft.data.cues.slice(0, 25).map((cue, index) => <TableRow key={cue.id}>
            <TableCell>{cue.start_ms / 1000}–{cue.end_ms / 1000}</TableCell>
            <TableCell><span className="rule-comparison-text">{before[index]?.text ?? '—'}</span></TableCell>
            <TableCell><span className="rule-comparison-text">{cue.text}</span></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {draft.data.cues.length > 25 && <p>{t('textFirst25')}</p>}
        <div className="action-row">
          {!fresh && <Button label={t('speechReview')} isDisabled={busy || editor.opening || Boolean(editor.composition)}
            onClick={() => job.review(draft)} />}
          <Button label={t('speechApply')} isDisabled={!fresh || busy || editor.opening} onClick={() => {
            try { if (editor.applySpeech(draft.data, draft.revision, draft.requestId)) job.consume(draft); }
            catch (reason) { job.report(reason); }
          }} />
        </div>
      </>}
    </>}
  </Section>;
}
