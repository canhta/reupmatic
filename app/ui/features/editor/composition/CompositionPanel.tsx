import { Button } from '@astryxdesign/core/Button';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompositionCommand } from '../../../../core/editing/composition/commands';
import {
  type CompositionClip,
  compositionSpans,
} from '../../../../core/editing/composition/document';
import { useConfirmation } from '../../../design-system/ConfirmationProvider';
import { PanelPair, PanelSection, PanelStatus } from '../../../design-system/Panel';
import { useEditor } from '../EditorContext';

export function CompositionPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const confirm = useConfirmation();
  const [draft, setDraft] = useState<CompositionClip | null>(null);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const composition = editor.composition;
  // Only a composition change invalidates a draft; unrelated edits keep the panel usable.
  const compositionKey = JSON.stringify(composition ?? null);
  const compositionRef = useRef(compositionKey);
  compositionRef.current = compositionKey;
  const [captured, setCaptured] = useState(compositionKey);
  // The clip to keep selected after a command applies, so the list does not jump to the first.
  const keepId = useRef<string | null>(null);
  const spans = composition ? compositionSpans(composition) : [];
  const current = composition?.clips.find((clip) => clip.id === draft?.id);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const stale = captured !== compositionKey;
  const disabled = editor.opening || editor.busy;

  const select = useCallback((clip: CompositionClip | undefined) => {
    keepId.current = null;
    setDraft(clip ? structuredClone(clip) : null);
    setBaseline(JSON.stringify(clip ?? null));
    setCaptured(compositionRef.current);
    setError('');
  }, []);
  useEffect(() => {
    if (dirty) return;
    const preferred = keepId.current
      ? composition?.clips.find((clip) => clip.id === keepId.current)
      : undefined;
    keepId.current = null;
    select(preferred ?? current ?? composition?.clips[0]);
  }, [composition, dirty, select, current]);

  async function choose(clip: CompositionClip) {
    const key = compositionRef.current;
    if (
      dirty &&
      !(await confirm(t('compositionDiscard'), {
        title: t('confirmDiscardTitle'),
        confirmLabel: t('confirmDiscardAction'),
        destructive: true,
      }))
    )
      return;
    if (key !== compositionRef.current) {
      setError('STALE_OPERATION');
      return;
    }
    select(clip);
    const span = spans.find((value) => value.clip.id === clip.id);
    if (span) editor.seek(span.start_ms);
  }

  function apply(command: CompositionCommand) {
    try {
      keepId.current = draft?.id ?? null;
      editor.applyComposition([command], editor.getRevision());
      setDraft(null);
      setBaseline('null');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'INVALID_COMPOSITION');
    }
  }
  async function remove() {
    if (!draft) return;
    const key = compositionRef.current,
      id = draft.id;
    if (
      !(await confirm(t('compositionRemoveConfirm'), {
        title: t('confirmRemoveTitle'),
        confirmLabel: t('confirmRemoveAction'),
        destructive: true,
      }))
    )
      return;
    if (key !== compositionRef.current) {
      setError('STALE_OPERATION');
      return;
    }
    apply({ kind: 'remove', id });
  }
  const index = composition?.clips.findIndex((clip) => clip.id === draft?.id) ?? -1;
  const next = composition?.clips[index + 1];
  const canJoin =
    current &&
    next &&
    current.source.path === next.source.path &&
    current.source.sha256 === next.source.sha256 &&
    current.end_ms === next.start_ms &&
    current.speed === next.speed;
  const commandDisabled = disabled || dirty || stale || !draft;

  const status = error
    ? t(error === 'COMPOSITION_CUE_LIMIT' ? 'compositionCueLimit' : 'compositionInvalid')
    : stale && dirty
      ? t('compositionStale')
      : dirty
        ? t('compositionDraft')
        : '';

  return (
    <PanelSection title={t('compositionTitle')}>
      {composition && (
        <Text type="body" maxLines={1}>
          {t('compositionSummary', {
            count: spans.length,
            seconds: (editor.duration / 1000).toFixed(1),
            width: composition.canvas.width,
            height: composition.canvas.height,
          })}
        </Text>
      )}
      {composition && (
        <List density="compact" hasDividers aria-label={t('compositionTitle')}>
          {spans.map((span, order) => {
            const clip = span.clip;
            const range = `${(clip.start_ms / 1000).toFixed(1)}–${(clip.end_ms / 1000).toFixed(1)} s · ${clip.speed}×`;
            const selectedClip = draft && clip.id === draft.id ? draft : null;
            if (!selectedClip) {
              return (
                <ListItem
                  key={clip.id}
                  label={clip.source.name}
                  description={range}
                  isDisabled={disabled}
                  startContent={
                    <Text as="span" type="label" hasTabularNumbers>
                      {String(order + 1)}
                    </Text>
                  }
                  onClick={() => void choose(clip)}
                />
              );
            }
            return (
              <ListItem
                key={clip.id}
                label={clip.source.name}
                isSelected
                startContent={
                  <Text as="span" type="label" hasTabularNumbers>
                    {String(order + 1)}
                  </Text>
                }
                endContent={
                  <MoreMenu
                    label={t('compositionMore')}
                    size="sm"
                    isDisabled={commandDisabled}
                    items={
                      [
                        {
                          label: t('compositionEarlier'),
                          isDisabled: index <= 0,
                          onClick: () =>
                            apply({ kind: 'move', id: selectedClip.id, direction: -1 }),
                        },
                        {
                          label: t('compositionLater'),
                          isDisabled: index >= spans.length - 1,
                          onClick: () => apply({ kind: 'move', id: selectedClip.id, direction: 1 }),
                        },
                        {
                          label: t('compositionSplit'),
                          onClick: () =>
                            apply({
                              kind: 'split',
                              id: selectedClip.id,
                              at_ms: editor.clock,
                              new_id: crypto.randomUUID(),
                            }),
                        },
                        {
                          label: t('compositionJoin'),
                          isDisabled: !canJoin,
                          onClick: () => apply({ kind: 'join', id: selectedClip.id }),
                        },
                        {
                          label: t('compositionRemove'),
                          variant: 'destructive',
                          isDisabled: spans.length <= 1,
                          onClick: () => void remove(),
                        },
                      ] satisfies DropdownMenuOption[]
                    }
                  />
                }
                description={
                  <VStack gap={2} paddingBlock={1}>
                    <Text type="body">{range}</Text>
                    <PanelPair>
                      <NumberInput
                        label={t('compositionIn')}
                        isLabelHidden
                        units="s"
                        value={selectedClip.start_ms / 1000}
                        min={0}
                        max={selectedClip.source.duration_ms / 1000}
                        step={0.1}
                        isWheelEnabled={false}
                        isDisabled={disabled}
                        onChange={(value) =>
                          setDraft({ ...selectedClip, start_ms: Math.round(value * 1000) })
                        }
                      />
                      <NumberInput
                        label={t('compositionOut')}
                        isLabelHidden
                        units="s"
                        value={selectedClip.end_ms / 1000}
                        min={0}
                        max={selectedClip.source.duration_ms / 1000}
                        step={0.1}
                        isWheelEnabled={false}
                        isDisabled={disabled}
                        onChange={(value) =>
                          setDraft({ ...selectedClip, end_ms: Math.round(value * 1000) })
                        }
                      />
                    </PanelPair>
                    <NumberInput
                      label={t('compositionSpeed')}
                      isLabelHidden
                      units="×"
                      value={selectedClip.speed}
                      min={0.25}
                      max={4}
                      step={0.05}
                      isWheelEnabled={false}
                      isDisabled={disabled}
                      onChange={(speed) => setDraft({ ...selectedClip, speed })}
                    />
                    {(dirty || stale) && (
                      <HStack gap={2} vAlign="center" hAlign="end">
                        <Button
                          label={t('compositionReload')}
                          isDisabled={disabled}
                          onClick={() => select(current ?? composition.clips[0])}
                        />
                        <Button
                          label={t('compositionApply')}
                          variant="primary"
                          isDisabled={disabled || !dirty || stale}
                          onClick={() =>
                            apply({
                              kind: 'update',
                              id: selectedClip.id,
                              start_ms: selectedClip.start_ms,
                              end_ms: selectedClip.end_ms,
                              speed: selectedClip.speed,
                            })
                          }
                        />
                      </HStack>
                    )}
                  </VStack>
                }
              />
            );
          })}
        </List>
      )}
      {status && <PanelStatus tone={error || stale ? 'warning' : 'neutral'} text={status} />}
    </PanelSection>
  );
}
