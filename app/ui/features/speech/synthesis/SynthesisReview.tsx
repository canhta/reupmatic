import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assertSynthesisCurrent } from '../../../../core/speech/synthesis/review';
import { unwrap } from '../../../bridge/client';
import { useEditor } from '../../editor/EditorContext';
import { synthesisErrorKey } from './i18n';
import type { SynthesisDraft } from './useSynthesisJob';

export function SynthesisReview({ draft, disabled, onBusy }: {
  draft: SynthesisDraft; disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const { t } = useTranslation(), editor = useEditor();
  const current = useRef(editor), alive = useRef(true), working = useRef(false), aborted = useRef(false);
  current.current = editor;
  const [url, setUrl] = useState(''), [reviewed, setReviewed] = useState(false), [heard, setHeard] = useState(false);
  const [stage, setStage] = useState<'listen' | 'wav' | 'receipt'>('listen');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(''), [page, setPage] = useState(0);
  function assertCurrent() {
    if (!alive.current || current.current.opening || current.current.documentId !== draft.documentId) throw new Error('STALE_OPERATION');
    assertSynthesisCurrent(current.current.textSnapshot, draft.input);
  }
  let fresh = true;
  try { assertCurrent(); } catch { fresh = false; }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; aborted.current = true;
      if (working.current) void window.reupmatic.synthesisCancelExport().catch(() => undefined);
      onBusy(false);
    };
  }, [onBusy]);
  useEffect(() => {
    if (!fresh) {
      aborted.current = true;
      setReviewed(false); setUrl(''); setHeard(false);
      if (working.current) void window.reupmatic.synthesisCancelExport().catch(() => undefined);
    }
  }, [fresh]);
  const report = (reason: unknown) => { if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE'); };
  async function action(kind: 'listen' | 'wav' | 'receipt') {
    if (working.current || disabled) return;
    working.current = true; aborted.current = false; setStage(kind); setBusy(true); onBusy(true); setError(''); setSaved('');
    try {
      assertCurrent();
      if (kind === 'listen') {
        const result = await unwrap(window.reupmatic.synthesisPreview(draft.result.artifact_id));
        assertCurrent();
        if (aborted.current) throw new Error('CANCELLED');
        if (result.url !== `media://local/synthesis-${draft.result.artifact_id}`) throw new Error('INVALID_WORKER_RESPONSE');
        setUrl(result.url); setHeard(false); setReviewed(false);
      } else {
        if (!reviewed || !heard) throw new Error('STALE_OPERATION');
        const choice = await unwrap(window.reupmatic.synthesisChooseExport(draft.result.artifact_id, kind));
        if (!choice) return;
        assertCurrent(); // The native dialog may have stayed open while the source changed.
        if (aborted.current) throw new Error('CANCELLED');
        const result = await unwrap(window.reupmatic.synthesisSave(choice.choice_id, draft.result.artifact_id));
        if (alive.current) setSaved(result.name);
      }
    } catch (reason) {
      void window.reupmatic.synthesisCancelExport().catch(() => undefined);
      report(reason);
    } finally {
      working.current = false;
      if (alive.current) { setBusy(false); onBusy(false); }
    }
  }
  const p = draft.input.params, result = draft.result;
  return <div className="business-form">
    <h3>{t('synthesisDraft')}</h3>
    <p>{t('synthesisCaptured', { language: t(`visionLanguage_${p.language}`), voice: p.voice_id,
      count: p.cues.length, duration: (result.duration_ms / 1000).toFixed(3), runtime: result.runtime })}</p>
    <p>{t('speechModelId')} <code>{p.model_id}</code></p>
    <p className="field-help">{t('synthesisSession')}</p>
    {!fresh && <Banner status="warning" title={t('synthesisStale')} />}
    <Table density="compact" aria-label={t('synthesisComparison')}>
      <TableHeader><TableRow isHeaderRow>
        <TableHeaderCell>{t('synthesisWords')}</TableHeaderCell><TableHeaderCell>{t('synthesisSourceTime')}</TableHeaderCell>
        <TableHeaderCell>{t('synthesisActualTime')}</TableHeaderCell><TableHeaderCell>{t('synthesisDuration')}</TableHeaderCell>
      </TableRow></TableHeader>
      <TableBody>{p.cues.slice(page * 25, (page + 1) * 25).map((cue, index) => {
        const span = result.segments[page * 25 + index];
        return <TableRow key={cue.id}>
          <TableCell><span className="rule-comparison-text">{cue.text}</span></TableCell>
          <TableCell>{cue.start_ms / 1000}–{cue.end_ms / 1000}</TableCell>
          <TableCell>{(span.start_frame / 48000).toFixed(3)}–{(span.end_frame / 48000).toFixed(3)}</TableCell>
          <TableCell>{((span.end_frame - span.start_frame) / 48000).toFixed(3)} / {((cue.end_ms - cue.start_ms) / 1000).toFixed(3)}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
    <div className="action-row">
      <Button label={t('translationPrevious')} isDisabled={page === 0} onClick={() => setPage(page - 1)} />
      <span>{t('translationPage', { page: page + 1, total: Math.ceil(p.cues.length / 25) })}</span>
      <Button label={t('translationNext')} isDisabled={(page + 1) * 25 >= p.cues.length} onClick={() => setPage(page + 1)} />
    </div>
    <Button label={t('synthesisListen')} isDisabled={!fresh || disabled || busy} onClick={() => void action('listen')} />
    {url && fresh && <audio controls preload="metadata" src={url} aria-label={t('synthesisPlayer')}
      onPlay={() => setHeard(true)} onError={() => { setHeard(false); setReviewed(false); setError('SYNTHESIS_ARTIFACT_INVALID'); }} />}
    <CheckboxInput label={t('synthesisReviewed')} value={reviewed} isDisabled={!heard || !fresh || busy || disabled} onChange={setReviewed} />
    <p className="field-help">{t('synthesisReceiptHelp')}</p>
    <div className="action-row">
      <Button label={t('synthesisSaveWav')} isDisabled={!fresh || !heard || !reviewed || disabled || busy} onClick={() => void action('wav')} />
      <Button label={t('synthesisSaveReceipt')} isDisabled={!fresh || !heard || !reviewed || disabled || busy} onClick={() => void action('receipt')} />
      {busy && <Button label={t('cancel')} onClick={() => { aborted.current = true; void window.reupmatic.synthesisCancelExport().catch(report); }} />}
    </div>
    {busy && <p role="status">{t(stage === 'listen' ? 'synthesisVerifyingArtifact' : 'synthesisSaving')}</p>}
    {saved && <p role="status">{t('synthesisSaved', { name: saved })}</p>}
    {error && <Banner status="error" title={t(synthesisErrorKey(error))} description={<code>{error}</code>} />}
  </div>;
}
