import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { engineTargetsDuration } from '../../../../core/speech/engine-capability';
import { assertSynthesisCurrent } from '../../../../core/speech/synthesis/review';
import {
  planVoiceTiming,
  SHIPPED_VOICE_TIMING_POLICY,
} from '../../../../core/speech/synthesis/timing';
import { applyVoiceResult } from '../../../../core/speech/synthesis/voice-track';
import { unwrap } from '../../../bridge/client';
import { useEditor } from '../../editor/EditorContext';
import { ReviewGrid } from '../../editor/text-layers/ReviewGrid';
import { engineName } from '../engine-name';
import { synthesisErrorKey } from './error-message';
import type { SynthesisDraft } from './useSynthesisJob';

export function SynthesisReview({
  draft,
  disabled,
  onBusy,
}: {
  draft: SynthesisDraft;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { t } = useTranslation(),
    editor = useEditor();
  const current = useRef(editor),
    alive = useRef(true),
    working = useRef(false),
    aborted = useRef(false);
  current.current = editor;
  const [url, setUrl] = useState(''),
    [reviewed, setReviewed] = useState(false),
    [heard, setHeard] = useState(false);
  const [stage, setStage] = useState<'listen' | 'wav' | 'receipt'>('listen');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(''),
    [applied, setApplied] = useState(false);
  function assertCurrent() {
    if (
      !alive.current ||
      current.current.opening ||
      current.current.documentId !== draft.documentId
    )
      throw new Error('STALE_OPERATION');
    assertSynthesisCurrent(current.current.textSnapshot, draft.input);
  }
  let fresh = true;
  try {
    assertCurrent();
  } catch {
    fresh = false;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      aborted.current = true;
      if (working.current) void window.reupmatic.synthesisCancelExport().catch(() => undefined);
      onBusy(false);
    };
  }, [onBusy]);
  useEffect(() => {
    if (!fresh) {
      aborted.current = true;
      setReviewed(false);
      setUrl('');
      setHeard(false);
      setApplied(false);
      if (working.current) void window.reupmatic.synthesisCancelExport().catch(() => undefined);
    }
  }, [fresh]);
  const report = (reason: unknown) => {
    if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
  };
  async function action(kind: 'listen' | 'wav' | 'receipt') {
    if (working.current || disabled) return;
    working.current = true;
    aborted.current = false;
    setStage(kind);
    setBusy(true);
    onBusy(true);
    setError('');
    setSaved('');
    setApplied(false);
    try {
      assertCurrent();
      if (kind === 'listen') {
        const result = await unwrap(window.reupmatic.synthesisPreview(draft.result.artifact_id));
        assertCurrent();
        if (aborted.current) throw new Error('CANCELLED');
        if (result.url !== `media://local/synthesis-${draft.result.artifact_id}`)
          throw new Error('INVALID_WORKER_RESPONSE');
        setUrl(result.url);
        setHeard(false);
        setReviewed(false);
      } else {
        if (!reviewed || !heard) throw new Error('STALE_OPERATION');
        const choice = await unwrap(
          window.reupmatic.synthesisChooseExport(draft.result.artifact_id, kind),
        );
        if (!choice) return;
        assertCurrent();
        if (aborted.current) throw new Error('CANCELLED');
        const result = await unwrap(
          window.reupmatic.synthesisSave(choice.choice_id, draft.result.artifact_id),
        );
        if (alive.current) setSaved(result.name);
      }
    } catch (reason) {
      void window.reupmatic.synthesisCancelExport().catch(() => undefined);
      report(reason);
    } finally {
      working.current = false;
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  function apply() {
    if (!fresh || !heard || !reviewed || disabled || busy) return;
    setError('');
    setSaved('');
    try {
      const next = applyVoiceResult(current.current.textSnapshot, draft.input, draft.result, plan, {
        engine: draft.engine,
        mode: 'mix',
        gain_db: 0,
        fade_in_ms: 0,
        fade_out_ms: 0,
      });
      current.current.changeVoiceTrack(next.voice_track);
      if (alive.current) setApplied(true);
    } catch (reason) {
      if (alive.current) setApplied(false);
      report(reason);
    }
  }
  const p = draft.input.params,
    result = draft.result;
  const plan = useMemo(
    () =>
      planVoiceTiming({
        cues: p.cues,
        segments: result.segments,
        sample_rate: result.sample_rate,
        engine_targets_duration: engineTargetsDuration(draft.engine),
        policy: SHIPPED_VOICE_TIMING_POLICY,
      }),
    [p.cues, result.segments, result.sample_rate, draft.engine],
  );
  const planned = new Map(plan.lines.map((entry) => [entry.cue_id, entry])),
    texts = new Map(p.cues.map((entry) => [entry.id, entry.text])),
    seconds = (ms: number) => (ms / 1000).toFixed(3),
    compressed = (rate: number) => `${((1 - 1 / rate) * 100).toFixed(1)}%`;
  return (
    <VStack gap={3}>
      <Heading level={5}>{t('synthesisDraft')}</Heading>
      <Text as="p" type="body">
        {t('synthesisCaptured', {
          language: t(`visionLanguage_${p.language}`),
          voice: p.voice_id,
          count: p.cues.length,
          duration: (result.duration_ms / 1000).toFixed(3),
          runtime: engineName(result.runtime),
        })}
      </Text>
      <Text as="p" type="supporting">
        {t('synthesisSession')}
      </Text>
      <Text as="p" type="supporting">
        {t(plan.engine_targets_duration ? 'synthesisEngineFits' : 'synthesisEngineNatural')}
      </Text>
      {!fresh && <Banner status="warning" title={t('synthesisStale')} />}
      <ReviewGrid
        ariaLabel={t('synthesisComparison')}
        rowKey={(cue) => cue.id}
        rows={p.cues}
        columns={[
          {
            key: 'words',
            header: t('synthesisWords'),
            width: proportional(1, { minWidth: 200 }),
            render: (cue) => cue.text,
          },
          {
            key: 'slot',
            header: t('synthesisSlot'),
            width: pixel(180),
            render: (cue) => seconds(planned.get(cue.id)?.slot_ms ?? 0),
          },
          {
            key: 'speech',
            header: t('synthesisSpeech'),
            width: pixel(120),
            render: (cue) => seconds(planned.get(cue.id)?.speech_ms ?? 0),
          },
          {
            key: 'compressed',
            header: t('synthesisCompressed'),
            width: pixel(150),
            render: (cue) => compressed(planned.get(cue.id)?.rate ?? 1),
          },
          {
            key: 'overrun',
            header: t('synthesisOverrun'),
            width: pixel(110),
            render: (cue) => seconds(planned.get(cue.id)?.overrun_ms ?? 0),
          },
        ]}
      />
      {plan.conflicts.length > 0 && (
        <Banner
          status="warning"
          title={t('synthesisTimingConflicts')}
          description={plan.conflicts.map((conflict) => (
            <Text as="p" type="body" key={conflict.cue_id}>
              {t('synthesisTimingConflictLine', {
                line: texts.get(conflict.cue_id) ?? conflict.cue_id,
                slot: seconds(conflict.slot_ms),
                speech: seconds(conflict.speech_ms),
                overrun: seconds(conflict.overrun_ms),
              })}
            </Text>
          ))}
        />
      )}
      <Button
        label={t('synthesisListen')}
        isDisabled={!fresh || disabled || busy}
        onClick={() => void action('listen')}
      />
      {url && fresh && (
        <audio
          controls
          preload="metadata"
          src={url}
          aria-label={t('synthesisPlayer')}
          onPlay={() => setHeard(true)}
          onError={() => {
            setHeard(false);
            setReviewed(false);
            setError('SYNTHESIS_ARTIFACT_INVALID');
          }}
        />
      )}
      <CheckboxInput
        label={t('synthesisReviewed')}
        value={reviewed}
        isDisabled={!heard || !fresh || busy || disabled}
        onChange={setReviewed}
      />
      <Text as="p" type="supporting">
        {t('synthesisApplyHelp')}
      </Text>
      <Text as="p" type="supporting">
        {t('synthesisReceiptHelp')}
      </Text>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button
          label={t('synthesisApply')}
          variant="primary"
          isDisabled={!fresh || !heard || !reviewed || disabled || busy}
          onClick={apply}
        />
        <Button
          label={t('synthesisSaveWav')}
          isDisabled={!fresh || !heard || !reviewed || disabled || busy}
          onClick={() => void action('wav')}
        />
        <Button
          label={t('synthesisSaveReceipt')}
          isDisabled={!fresh || !heard || !reviewed || disabled || busy}
          onClick={() => void action('receipt')}
        />
        {busy && (
          <Button
            label={t('cancel')}
            onClick={() => {
              aborted.current = true;
              void window.reupmatic.synthesisCancelExport().catch(report);
            }}
          />
        )}
      </HStack>
      {busy && (
        <Text as="p" type="body" role="status">
          {t(stage === 'listen' ? 'synthesisVerifyingArtifact' : 'synthesisSaving')}
        </Text>
      )}
      {saved && (
        <Text as="p" type="body" role="status">
          {t('synthesisSaved', { name: saved })}
        </Text>
      )}
      {applied && (
        <Text as="p" type="body" role="status">
          {t('synthesisApplied')}
        </Text>
      )}
      {error && (
        <Banner
          status="error"
          title={t(synthesisErrorKey(error))}
          description={<code>{error}</code>}
        />
      )}
    </VStack>
  );
}
