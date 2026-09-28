import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Stack, StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompositionCommand } from '../../../../core/editing/composition/commands';
import {
  type CompositionClip,
  compositionSpans,
} from '../../../../core/editing/composition/document';
import { useConfirmation } from '../../../design-system/ConfirmationProvider';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
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

  return (
    <InspectorPanelSection title={t('compositionTitle')}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          {composition && (
            <Text type="body">
              {t('compositionSummary', {
                count: spans.length,
                seconds: (editor.duration / 1000).toFixed(3),
                width: composition.canvas.width,
                height: composition.canvas.height,
              })}
            </Text>
          )}
        </HStack>
        {composition && (
          <>
            <StackItem size="fill" isScrollable className="cue-list">
              <List density="compact" hasDividers aria-label={t('compositionTitle')}>
                {spans.map((span, order) => (
                  <ListItem
                    key={span.clip.id}
                    label={span.clip.source.name}
                    isSelected={span.clip.id === draft?.id}
                    isDisabled={disabled}
                    startContent={
                      <Text as="span" type="label">
                        {String(order + 1)}
                      </Text>
                    }
                    description={
                      <Stack direction="vertical" gap={0}>
                        <Text as="span" type="supporting">
                          {t('compositionSourceRange')}: {(span.clip.start_ms / 1000).toFixed(3)}–
                          {(span.clip.end_ms / 1000).toFixed(3)} s · {span.clip.speed}×
                        </Text>
                        <Text as="span" type="supporting">
                          {t('compositionTimelineRange')}: {(span.start_ms / 1000).toFixed(3)}–
                          {(span.end_ms / 1000).toFixed(3)} s
                        </Text>
                      </Stack>
                    }
                    onClick={() => void choose(span.clip)}
                  />
                ))}
              </List>
            </StackItem>
            {draft && (
              <>
                <Grid columns={2} gap={3}>
                  <NumberInput
                    label={t('compositionIn')}
                    units="s"
                    width="100%"
                    value={draft.start_ms / 1000}
                    min={0}
                    max={draft.source.duration_ms / 1000}
                    step={0.1}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(value) => setDraft({ ...draft, start_ms: Math.round(value * 1000) })}
                  />
                  <NumberInput
                    label={t('compositionOut')}
                    units="s"
                    width="100%"
                    value={draft.end_ms / 1000}
                    min={0}
                    max={draft.source.duration_ms / 1000}
                    step={0.1}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(value) => setDraft({ ...draft, end_ms: Math.round(value * 1000) })}
                  />
                  <NumberInput
                    label={t('compositionSpeed')}
                    units="×"
                    width="100%"
                    value={draft.speed}
                    min={0.25}
                    max={4}
                    step={0.05}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(speed) => setDraft({ ...draft, speed })}
                  />
                </Grid>
                <div className="drawer-toolbar">
                  <Toolbar
                    label={t('compositionActions')}
                    size="sm"
                    startContent={
                      <>
                        <ButtonGroup label={t('compositionOrder')} size="sm">
                          <Button
                            label={t('compositionEarlier')}
                            isDisabled={commandDisabled || index <= 0}
                            onClick={() => apply({ kind: 'move', id: draft.id, direction: -1 })}
                          />
                          <Button
                            label={t('compositionLater')}
                            isDisabled={commandDisabled || index >= spans.length - 1}
                            onClick={() => apply({ kind: 'move', id: draft.id, direction: 1 })}
                          />
                        </ButtonGroup>
                        <Button
                          label={t('compositionSplit')}
                          isDisabled={commandDisabled}
                          onClick={() =>
                            apply({
                              kind: 'split',
                              id: draft.id,
                              at_ms: editor.clock,
                              new_id: crypto.randomUUID(),
                            })
                          }
                        />
                        <Button
                          label={t('compositionJoin')}
                          isDisabled={commandDisabled || !canJoin}
                          onClick={() => apply({ kind: 'join', id: draft.id })}
                        />
                      </>
                    }
                    endContent={
                      <MoreMenu
                        label={t('compositionMore')}
                        size="sm"
                        isDisabled={commandDisabled || spans.length <= 1}
                        items={
                          [
                            {
                              label: t('compositionRemove'),
                              variant: 'destructive',
                              onClick: () => void remove(),
                            },
                          ] satisfies DropdownMenuOption[]
                        }
                      />
                    }
                  />
                </div>
                <Text as="p" type="body">
                  {t('compositionJoinHelp')}
                </Text>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Button
                    label={t('compositionApply')}
                    variant="primary"
                    isDisabled={disabled || !dirty || stale}
                    onClick={() =>
                      apply({
                        kind: 'update',
                        id: draft.id,
                        start_ms: draft.start_ms,
                        end_ms: draft.end_ms,
                        speed: draft.speed,
                      })
                    }
                  />
                  <Button
                    label={t('compositionReload')}
                    isDisabled={disabled || (!dirty && !stale)}
                    onClick={() => select(current ?? composition.clips[0])}
                  />
                </HStack>
              </>
            )}
            {dirty && (
              <Text as="p" type="body" role="status">
                {t('compositionDraft')}
              </Text>
            )}
            {stale && dirty && <Banner status="warning" title={t('compositionStale')} />}
          </>
        )}
        {error && (
          <Banner
            status="error"
            title={t(
              error === 'COMPOSITION_CUE_LIMIT' ? 'compositionCueLimit' : 'compositionInvalid',
            )}
          />
        )}
      </VStack>
    </InspectorPanelSection>
  );
}
