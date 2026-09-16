import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../../core/subtitles/layers/document';
import type { SynthesisLanguage } from '../../../../core/speech/synthesis/contracts';
import { useEditor } from '../../editor/EditorContext';
import { synthesisErrorKey } from './i18n';
import { SynthesisReview } from './SynthesisReview';
import { useSynthesisJob } from './useSynthesisJob';

export function SynthesisPanel() {
  const { t } = useTranslation(), editor = useEditor();
  const source = getTextLayer(editor.textSnapshot, 'spoken');
  const job = useSynthesisJob({ documentId: editor.documentId, revision: editor.revision,
    snapshot: editor.textSnapshot, opening: editor.opening });
  const [language, setLanguage] = useState<SynthesisLanguage>(source.language === 'en' ? 'en' : 'vi');
  const [voice, setVoice] = useState(''), [scope, setScope] = useState<'all' | 'selected'>('selected');
  const [reviewBusy, setReviewBusy] = useState(false);
  const busy = Boolean(job.active) || job.settingUp || reviewBusy;
  const available = job.models?.available && job.models.languages.includes(language)
    && job.models.voices.some(value => value.id === voice);
  const languageMismatch = source.language !== null && source.language !== language;
  const selectionValid = editor.activeTextLayer === 'spoken' && source.cues.some(cue => cue.id === editor.selected);
  return <Section variant="transparent" padding={0} className="vision-panel" aria-label={t('synthesisTitle')}>
    <div className="action-row"><h2>{t('synthesisTitle')}</h2>
      <Button label={t('visionRefresh')} isDisabled={busy || job.checking} onClick={() => void job.refresh()} /></div>
    <p>{t('synthesisIntro')}</p><p className="field-help">{t('synthesisLimits')}</p>
    <p role="status">{job.checking ? t('visionChecking') : job.models?.available ? t('synthesisReady')
      : t(synthesisErrorKey(job.models?.code || 'MODEL_MISSING'))}</p>
    <Collapsible trigger={t('synthesisSetup')} defaultIsOpen={false}>
      <p>{t('synthesisSetupHelp')}</p>
      <Button label={t('speechChooseManifest')} isDisabled={busy} onClick={() => void job.configure()} />
      {job.models?.model_id && <p>{t('speechModelId')} <code>{job.models.model_id}</code></p>}
    </Collapsible>
    {job.settingUp && <div className="action-row" role="status">
      <ProgressBar label={t('speechVerifying')} isIndeterminate />
      <Button label={t('cancel')} onClick={() => void job.cancelSetup()} /></div>}
    <div className="business-toolbar">
      <Selector label={t('synthesisLanguage')} value={language} isDisabled={busy}
        options={(['vi', 'en'] as const).map(value => ({ value, label: t(`visionLanguage_${value}`) }))}
        onChange={value => { if (value === 'en' || value === 'vi') setLanguage(value); }} />
      <Selector label={t('synthesisVoice')} value={voice} isDisabled={busy}
        options={[{ value: '', label: t('synthesisChooseVoice') }, ...(job.models?.voices ?? []).map(v => ({ value: v.id, label: v.label }))]}
        onChange={setVoice} />
      <Selector label={t('synthesisScope')} value={scope} isDisabled={busy}
        options={[{ value: 'selected', label: t('synthesisSelected') }, { value: 'all', label: t('synthesisAll') }]}
        onChange={value => { if (value === 'all' || value === 'selected') setScope(value); }} />
    </div>
    <p className="field-help">{t('synthesisLanguageHelp')}</p>
    {!available && job.models?.available && <p role="status">{t('synthesisVoiceMissing')}</p>}
    {scope === 'selected' && !selectionValid && <p role="status">{t('synthesisSelectionHelp')}</p>}
    {!source.cues.length && <p role="status">{t('textLayerEmpty')}</p>}
    {source.stale && <Banner status="warning" title={t('textLayerStale')} />}
    {languageMismatch && <Banner status="warning" title={t('synthesisLanguageMismatch')} />}
    <Button label={t('synthesisStart')} variant="primary"
      isDisabled={busy || editor.opening || !available || languageMismatch || source.stale || !source.cues.length || (scope === 'selected' && !selectionValid)}
      onClick={() => void job.start({ language, voice_id: voice, ...(scope === 'selected' ? { cue_ids: [editor.selected] } : {}) })} />
    {job.active && <div className="action-row" role="status">
      <ProgressBar label={t(job.active.phase)} max={1} value={job.active.fraction ?? undefined} isIndeterminate={job.active.fraction === null} />
      <Button label={t('cancel')} isDisabled={job.active.phase === 'cancelling'} onClick={() => void job.cancel()} /></div>}
    {job.error && <Banner status="error" title={t(synthesisErrorKey(job.error))} description={<code>{job.error}</code>} />}
    {job.draft && <SynthesisReview key={job.draft.input.request_id} draft={job.draft}
      disabled={Boolean(job.active) || job.settingUp} onBusy={setReviewBusy} />}
  </Section>;
}
