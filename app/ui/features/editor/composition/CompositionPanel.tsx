import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useCallback, useEffect, useState } from 'react';
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
  const [captured, setCaptured] = useState(editor.revision);
  const [error, setError] = useState('');
  const composition = editor.composition;
  const spans = composition ? compositionSpans(composition) : [];
  const current = composition?.clips.find((clip) => clip.id === draft?.id);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const stale = captured !== editor.revision;
  const disabled = editor.opening || editor.busy;

  const select = useCallback(
    (clip: CompositionClip | undefined) => {
      setDraft(clip ? structuredClone(clip) : null);
      setBaseline(JSON.stringify(clip ?? null));
      setCaptured(editor.getRevision());
      setError('');
    },
    [editor.getRevision],
  );
  useEffect(() => {
    if (!dirty) select(current ?? composition?.clips[0]);
  }, [composition, dirty, select, current]);

  async function choose(clip: CompositionClip) {
    const revision = editor.getRevision();
    if (dirty && !(await confirm(t('compositionDiscard')))) return;
    if (revision !== editor.getRevision()) {
      setError('STALE_OPERATION');
      return;
    }
    select(clip);
    const span = spans.find((value) => value.clip.id === clip.id);
    if (span) editor.seek(span.start_ms);
  }

  function apply(command: CompositionCommand, revision = editor.getRevision()) {
    try {
      editor.applyComposition([command], revision);
      setDraft(null);
      setBaseline('null');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'INVALID_COMPOSITION');
    }
  }
  async function remove() {
    if (!draft) return;
    const revision = editor.getRevision(),
      id = draft.id;
    if (await confirm(t('compositionRemoveConfirm'))) apply({ kind: 'remove', id }, revision);
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
      <Text as="p" type="supporting">
        {t('compositionHelp')}
      </Text>
      <div className="action-row">
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
      </div>
      {composition && (
        <>
          <div className="cue-list">
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
          </div>
          {draft && (
            <>
              <Text as="p" type="supporting">
                {t('compositionClock')}
              </Text>
              <div className="business-toolbar">
                <NumberInput
                  label={t('compositionIn')}
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
                  value={draft.speed}
                  min={0.25}
                  max={4}
                  step={0.05}
                  isWheelEnabled={false}
                  isDisabled={disabled}
                  onChange={(speed) => setDraft({ ...draft, speed })}
                />
              </div>
              <div className="action-row">
                <Button
                  label={t('compositionApply')}
                  variant="primary"
                  isDisabled={disabled || !dirty || stale}
                  onClick={() =>
                    apply(
                      {
                        kind: 'update',
                        id: draft.id,
                        start_ms: draft.start_ms,
                        end_ms: draft.end_ms,
                        speed: draft.speed,
                      },
                      captured,
                    )
                  }
                />
                <Button
                  label={t('compositionReload')}
                  isDisabled={disabled || (!dirty && !stale)}
                  onClick={() => select(current ?? composition.clips[0])}
                />
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
                <Button
                  label={t('compositionRemove')}
                  isDisabled={commandDisabled || spans.length <= 1}
                  onClick={() => void remove()}
                />
              </div>
              <Text as="p" type="supporting">
                {t('compositionJoinHelp')}
              </Text>
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
          description={<code>{error}</code>}
        />
      )}
    </InspectorPanelSection>
  );
}
