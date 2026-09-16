import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canApplyOcr } from '../../../core/vision/ocr-draft';
import type { InpaintResult, OcrResult } from '../../../core/vision/vision';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import type { Captured } from './useVisionJob';

interface Props {
  assetId: string;
  revision: number;
  busy: boolean;
  draft: Captured<OcrResult> | null;
  output: Captured<InpaintResult> | null;
  onApply: (result: OcrResult, revision: number) => boolean;
  onConsumed: (draft: Captured<OcrResult>) => void;
  onError: (reason: unknown) => void;
}

export function VisionResults(props: Props) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const current = useRef(props);
  current.current = props;
  const { draft, output, assetId, revision, busy } = props;
  const [savedArtifact, setSavedArtifact] = useState('');
  const [savedDraft, setSavedDraft] = useState('');
  const draftCurrent = Boolean(draft && canApplyOcr(draft.data, draft.revision, assetId, revision));

  async function apply() {
    if (!draft || !draftCurrent || busy) return;
    if (!(await confirm(t('visionApplyConfirm')))) return;
    const latest = current.current;
    if (
      latest.busy ||
      latest.draft !== draft ||
      !canApplyOcr(draft.data, draft.revision, latest.assetId, latest.revision)
    )
      return;
    if (latest.onApply(draft.data, draft.revision)) latest.onConsumed(draft);
  }

  async function exportText() {
    if (!draft) return;
    try {
      const result = await unwrap<{ saved: boolean; library_linked?: boolean } | null>(
        window.reupmatic.saveSubtitles({
          asset_id: draft.data.asset_id,
          cues: draft.data.cues,
          timing: 'source',
        }),
      );
      if (result?.saved) setSavedDraft(draft.data.analysis_id);
      if (result?.saved && result.library_linked === false)
        props.onError(new Error('LIBRARY_LINK_FAILED'));
    } catch (reason) {
      props.onError(reason);
    }
  }

  async function save() {
    if (!output) return;
    try {
      const result = await unwrap<{ saved: boolean } | null>(
        window.reupmatic.saveVideo(output.data.artifact_id),
      );
      if (result?.saved) setSavedArtifact(output.data.artifact_id);
    } catch (reason) {
      props.onError(reason);
    }
  }

  return (
    <>
      {draft && (
        <div className="vision-draft">
          <div className="action-row">
            <h3>{t('visionDraft', { count: draft.data.cues.length })}</h3>
            <Button
              label={t('visionApply')}
              isDisabled={!draftCurrent || !draft.data.cues.length || busy}
              onClick={() => void apply()}
            />
            <Button
              label={t('visionExportSrt')}
              isDisabled={!draft.data.cues.length || busy}
              onClick={() => void exportText()}
            />
          </div>
          {savedDraft === draft.data.analysis_id && <p role="status">{t('visionSrtSaved')}</p>}
          {draft.data.scope === 'full-source' && (
            <p>{t('visionExtractEvidence', { count: draft.data.evidence?.observation_count })}</p>
          )}
          {!draftCurrent && <Banner status="warning" title={t('visionDraftStale')} />}
          {!draft.data.cues.length && <EmptyState isCompact title={t('visionNoText')} />}
          <Collapsible trigger={t('visionEvidence')} defaultIsOpen={false}>
            <p>{t('visionEvidenceLimit')}</p>
            <div className="vision-evidence">
              {draft.data.observations.slice(0, 20).map((item) => (
                <p key={item.start_ms}>
                  <span className="numeric">{(item.start_ms / 1000).toFixed(2)} s</span>
                  {' · '}
                  {item.detections.map((detection) => detection.text).join('\n') || '—'}
                </p>
              ))}
            </div>
          </Collapsible>
        </div>
      )}
      {output && (
        <div className="vision-output">
          <h3>{t('visionOutput')}</h3>
          {output.revision !== revision && <Banner status="warning" title={t('stale')} />}
          <video src={output.data.url} controls aria-label={t('visionOutput')} />
          <Button label={t('saveVideo')} onClick={() => void save()} />
          {savedArtifact === output.data.artifact_id && <p role="status">{t('visionSaved')}</p>}
        </div>
      )}
    </>
  );
}
