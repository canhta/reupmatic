import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { liveOutputClock, voiceCuesOutsideOutput } from '../../../../core/editing/live-mix';
import { engineTargetsDuration } from '../../../../core/speech/engine-capability';
import { assertSynthesisCurrent } from '../../../../core/speech/synthesis/review';
import { encodeWav, renderTimedVoice } from '../../../../core/speech/synthesis/timed-voice';
import {
  planVoiceTiming,
  SHIPPED_VOICE_TIMING_POLICY,
} from '../../../../core/speech/synthesis/timing';
import { applyVoiceResult } from '../../../../core/speech/synthesis/voice-track';
import { unwrap } from '../../../bridge/client';
import { CommandFooter } from '../../../design-system/Panel';
import { useEditor } from '../../editor/EditorContext';
import { DrawerFooter } from '../../editor/ToolDrawer';
import { engineName } from '../engine-name';
import { synthesisErrorKey } from './error-message';
import type { SynthesisDraft } from './useSynthesisJob';

export function SynthesisReview({
  draft,
  disabled,
  onBusy,
  generate,
  menu,
  hasFooter,
}: {
  draft: SynthesisDraft;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  /** Generating again replaces this draft; it rides in the footer's ⋯. */
  generate: { isDisabled: boolean; onClick: () => void };
  menu: DropdownMenuOption[];
  /** False while a new generation runs and its progress holds the footer. */
  hasFooter: boolean;
}) {
  const { t, i18n } = useTranslation(),
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
  // The player holds a rendered blob; drop it when it is replaced or the review closes.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
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
        const result = await unwrap(
          window.reupmatic.synthesisPreview(draft.result.artifact_id, draft.result.sha256),
        );
        assertCurrent();
        if (aborted.current) throw new Error('CANCELLED');
        if (result.url !== `media://local/synthesis-${draft.result.artifact_id}`)
          throw new Error('INVALID_WORKER_RESPONSE');
        const timed = await timedVoiceUrl(result.url);
        try {
          assertCurrent();
          if (aborted.current) throw new Error('CANCELLED');
        } catch (reason) {
          URL.revokeObjectURL(timed);
          throw reason;
        }
        setUrl(timed);
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
  /** The recording as the export plays it: sped lines at their planned rate, at their own pitch. */
  async function timedVoiceUrl(source: string): Promise<string> {
    const response = await fetch(source);
    if (!response.ok) throw new Error('SYNTHESIS_ARTIFACT_INVALID');
    // Decoding at the recording's own rate keeps the plan's frame spans exact.
    const decoded = await new OfflineAudioContext(1, 1, draft.result.sample_rate)
      .decodeAudioData(await response.arrayBuffer())
      .catch(() => {
        throw new Error('SYNTHESIS_ARTIFACT_INVALID');
      });
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) =>
      decoded.getChannelData(channel),
    );
    const timed = renderTimedVoice(channels, decoded.sampleRate, plan, draft.result.segments);
    return URL.createObjectURL(
      new Blob([encodeWav(timed, decoded.sampleRate)], { type: 'audio/wav' }),
    );
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
  // Fitted to each caption's slot in the exported file, at the speed the picture plays.
  const speed = editor.processing?.editing?.speed ?? 1;
  const plan = useMemo(
    () =>
      planVoiceTiming({
        cues: p.cues,
        segments: result.segments,
        sample_rate: result.sample_rate,
        engine_targets_duration: engineTargetsDuration(draft.engine),
        policy: SHIPPED_VOICE_TIMING_POLICY,
        speed,
      }),
    [p.cues, result.segments, result.sample_rate, draft.engine, speed],
  );
  const planned = new Map(plan.lines.map((entry) => [entry.cue_id, entry])),
    // UI-locale decimals: Vietnamese writes 1,12 where English writes 1.12.
    decimal = new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    seconds = (ms: number) => decimal.format(ms / 1000);
  // A long line is fixed on its caption: select it and move the playhead there, as the cue list does.
  function showLine(cueId: string) {
    const cue = p.cues.find((entry) => entry.id === cueId);
    if (!cue) return;
    editor.setSelected(cue.id);
    editor.seek(cue.start_ms);
  }
  // The export cuts lines outside the trim; they are neither played nor long.
  const cut = voiceCuesOutsideOutput(
    plan,
    liveOutputClock(editor.processing?.editing, editor.duration),
  );
  const longLines = plan.conflicts.filter((line) => !cut.has(line.cue_id));
  const firstConflict = longLines[0];
  const saveItems: DropdownMenuOption[] = [
    ...(firstConflict
      ? [
          {
            label: t('synthesisShowLongLine'),
            isDisabled: !fresh,
            onClick: () => showLine(firstConflict.cue_id),
          },
        ]
      : []),
    { label: t('synthesisStart'), isDisabled: generate.isDisabled, onClick: generate.onClick },
    {
      label: t('synthesisSaveWav'),
      isDisabled: !fresh || !heard || !reviewed || disabled || busy,
      onClick: () => void action('wav'),
    },
    {
      label: t('synthesisSaveReceipt'),
      isDisabled: !fresh || !heard || !reviewed || disabled || busy,
      onClick: () => void action('receipt'),
    },
    ...menu,
  ];
  return (
    <VStack gap={3}>
      <Text as="p" type="body">
        {t('synthesisCaptured', {
          language: t(`visionLanguage_${p.language}`),
          voice: p.voice_id,
          count: p.cues.length,
          duration: (result.duration_ms / 1000).toFixed(1),
          runtime: engineName(result.runtime),
        })}
      </Text>
      <List density="compact" hasDividers aria-label={t('synthesisComparison')}>
        {p.cues.map((cue) => {
          const entry = planned.get(cue.id);
          const outside = cut.has(cue.id);
          const overrun = outside ? 0 : (entry?.overrun_ms ?? 0);
          const fits = overrun <= 0;
          const status = outside
            ? 'synthesisTimingCut'
            : fits
              ? 'synthesisTimingFits'
              : 'synthesisTimingOverrun';
          return (
            <ListItem
              key={cue.id}
              label={cue.text}
              onClick={fits || !fresh ? undefined : () => showLine(cue.id)}
              startContent={
                <StatusDot
                  variant={outside ? 'neutral' : fits ? 'success' : 'warning'}
                  label={t(status)}
                  tooltip={t(status)}
                />
              }
              description={
                <Text type="body" hasTabularNumbers>
                  {`${t('synthesisSlot')} ${seconds((entry?.slot_ms ?? 0) / plan.speed)} · ${t('synthesisSpeech')} ${seconds(entry?.speech_ms ?? 0)}`}
                  {fits ? '' : ` · ${t('synthesisOverrun')} ${seconds(overrun)}`}
                  {fits && entry && entry.rate !== 1 ? ` · ${decimal.format(entry.rate)}×` : ''}
                </Text>
              }
            />
          );
        })}
      </List>
      {url && fresh ? (
        <audio
          controls
          preload="metadata"
          src={url}
          className="soundtrack-preview"
          aria-label={t('synthesisPlayer')}
          onPlay={() => setHeard(true)}
          onError={() => {
            setHeard(false);
            setReviewed(false);
            setError('SYNTHESIS_ARTIFACT_INVALID');
          }}
        />
      ) : (
        <HStack hAlign="end">
          <Button
            label={t('synthesisListen')}
            isDisabled={!fresh || disabled || busy}
            onClick={() => void action('listen')}
          />
        </HStack>
      )}
      <CheckboxInput
        label={t('synthesisReviewed')}
        value={reviewed}
        isDisabled={!heard || !fresh || busy || disabled}
        onChange={setReviewed}
      />
      {hasFooter && (
        <DrawerFooter>
          <CommandFooter
            status={
              error
                ? { tone: 'error', text: t(synthesisErrorKey(error)) }
                : !fresh
                  ? { tone: 'warning', text: t('synthesisStale') }
                  : applied
                    ? { tone: 'success', text: t('synthesisApplied') }
                    : saved
                      ? { tone: 'success', text: t('synthesisSaved', { name: saved }) }
                      : longLines.length > 0
                        ? {
                            tone: 'warning',
                            text: t('synthesisTimingConflicts', { count: longLines.length }),
                          }
                        : null
            }
            menu={saveItems}
            active={
              busy
                ? {
                    phase: stage === 'listen' ? 'synthesisVerifyingArtifact' : 'synthesisSaving',
                    fraction: null,
                  }
                : null
            }
            onCancel={() => {
              aborted.current = true;
              void window.reupmatic.synthesisCancelExport().catch(report);
            }}
          >
            <Button
              label={t('synthesisApply')}
              variant="primary"
              isDisabled={!fresh || !heard || !reviewed || disabled || busy}
              onClick={apply}
            />
          </CommandFooter>
        </DrawerFooter>
      )}
    </VStack>
  );
}
