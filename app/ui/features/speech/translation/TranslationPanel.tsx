import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  TranslationLanguage,
  TranslationRule,
  TranslationSource,
} from '../../../../core/speech/translation/rules';
import { getTextLayer } from '../../../../core/subtitles/layers/document';
import { useEditor } from '../../editor/EditorContext';
import { translationErrorKey } from './i18n';
import { TranslationReview } from './TranslationReview';
import { TranslationRules } from './TranslationRules';
import { useTranslationJob } from './useTranslationJob';

export function TranslationPanel() {
  const { t } = useTranslation(),
    editor = useEditor();
  const job = useTranslationJob({
    documentId: editor.documentId,
    revision: editor.revision,
    snapshot: editor.textSnapshot,
    opening: editor.opening,
  });
  const [sourceLayer, setSourceLayer] = useState<TranslationSource>('transcript');
  const [from, setFrom] = useState<TranslationLanguage>('en'),
    [to, setTo] = useState<TranslationLanguage>('vi');
  const [rules, setRules] = useState<TranslationRule[]>([]);
  const busy = Boolean(job.active) || job.settingUp;
  const source = getTextLayer(editor.textSnapshot, sourceLayer);
  const pairAvailable =
    job.models?.available &&
    job.models.source_language === from &&
    job.models.target_language === to;
  const languageMismatch = source.language !== null && source.language !== from;
  const languages = (['en', 'vi', 'zh'] as const).map((value) => ({
    value,
    label: t(`visionLanguage_${value}`),
  }));
  return (
    <Section
      variant="transparent"
      padding={0}
      className="vision-panel"
      aria-label={t('translationTitle')}
    >
      <div className="action-row">
        <h2>{t('translationTitle')}</h2>
        <Button
          label={t('visionRefresh')}
          isDisabled={busy || job.checking}
          onClick={() => void job.refresh()}
        />
      </div>
      <p>{t('translationIntro')}</p>
      <p className="field-help">{t('translationLimits')}</p>
      <p role="status">
        {job.checking
          ? t('visionChecking')
          : job.models?.available
            ? t('translationReady')
            : t(translationErrorKey(job.models?.code || 'MODEL_MISSING'))}
      </p>
      <Collapsible trigger={t('translationSetup')} defaultIsOpen={false}>
        <p>{t('translationSetupHelp')}</p>
        <Button
          label={t('speechChooseManifest')}
          isDisabled={busy}
          onClick={() => void job.configure()}
        />
        {job.models?.model_id && (
          <p>
            {t('speechModelId')} <code>{job.models.model_id}</code>
          </p>
        )}
      </Collapsible>
      {job.settingUp && (
        <div className="action-row" role="status">
          <ProgressBar label={t('speechVerifying')} isIndeterminate />
          <Button label={t('cancel')} onClick={() => void job.cancelSetup()} />
        </div>
      )}
      <div className="business-toolbar">
        <Selector
          label={t('translationSource')}
          value={sourceLayer}
          isDisabled={busy}
          options={(['transcript', 'displayed'] as const).map((value) => ({
            value,
            label: t(`textLayer_${value}`),
          }))}
          onChange={(value) => {
            if (value === 'transcript' || value === 'displayed') setSourceLayer(value);
          }}
        />
        <Selector
          label={t('translationFrom')}
          value={from}
          options={languages}
          isDisabled={busy}
          onChange={(value) => {
            if (value === 'en' || value === 'vi' || value === 'zh') setFrom(value);
          }}
        />
        <Selector
          label={t('translationTo')}
          value={to}
          options={languages}
          isDisabled={busy}
          onChange={(value) => {
            if (value === 'en' || value === 'vi' || value === 'zh') setTo(value);
          }}
        />
      </div>
      {job.models?.available && !pairAvailable && (
        <p role="status">{t('translationPairMissing')}</p>
      )}
      {!source.cues.length && <p role="status">{t('textLayerEmpty')}</p>}
      {source.stale && <Banner status="warning" title={t('textLayerStale')} />}
      {languageMismatch && <Banner status="warning" title={t('translationLanguageMismatch')} />}
      <TranslationRules rules={rules} onChange={setRules} disabled={busy} />
      <Button
        label={t('translationStart')}
        variant="primary"
        isDisabled={
          busy ||
          editor.opening ||
          !pairAvailable ||
          languageMismatch ||
          source.stale ||
          !source.cues.length
        }
        onClick={() =>
          void job.start({
            source_layer: sourceLayer,
            source_language: from,
            target_language: to,
            rules,
          })
        }
      />
      {job.active && (
        <div className="action-row" role="status">
          <ProgressBar
            label={t(job.active.phase)}
            max={1}
            value={job.active.fraction ?? undefined}
            isIndeterminate={job.active.fraction === null}
          />
          <Button
            label={t('cancel')}
            isDisabled={job.active.phase === 'cancelling'}
            onClick={() => void job.cancel()}
          />
        </div>
      )}
      {job.error && (
        <Banner
          status="error"
          title={t(translationErrorKey(job.error))}
          description={<code>{job.error}</code>}
        />
      )}
      {job.draft && (
        <TranslationReview
          key={job.draft.input.request_id}
          draft={job.draft}
          disabled={busy}
          onApplied={() => {
            if (job.draft) job.consume(job.draft);
          }}
        />
      )}
    </Section>
  );
}
