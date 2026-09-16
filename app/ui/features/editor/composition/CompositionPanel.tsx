import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompositionCommand } from '../../../../core/editing/composition/commands';
import {
  type CompositionClip,
  compositionSpans,
  MAX_CLIPS,
} from '../../../../core/editing/composition/document';
import { unwrap } from '../../../bridge/client';
import { useConfirmation } from '../../../design-system/ConfirmationProvider';
import { useEditor } from '../EditorContext';

export function CompositionPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const confirm = useConfirmation();
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<CompositionClip | null>(null);
  const [baseline, setBaseline] = useState('');
  const [captured, setCaptured] = useState(editor.revision);
  const [error, setError] = useState('');
  const composition = editor.composition;
  const spans = composition ? compositionSpans(composition) : [];
  const current = composition?.clips.find((clip) => clip.id === draft?.id);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const stale = captured !== editor.revision;
  const disabled = picking || editor.opening || editor.busy;

  const select = useCallback(
    (clip: CompositionClip | undefined) => {
      setDraft(clip ? structuredClone(clip) : null);
      setBaseline(JSON.stringify(clip ?? null));
      setCaptured(editor.rev.current);
      setError('');
    },
    [editor.rev],
  );
  useEffect(() => {
    if (!dirty) select(current ?? composition?.clips[0]);
  }, [composition, dirty, select, current]);

  async function choose(clip: CompositionClip) {
    const revision = editor.rev.current;
    if (dirty && !(await confirm(t('compositionDiscard')))) return;
    if (revision !== editor.rev.current) {
      setError('STALE_OPERATION');
      return;
    }
    select(clip);
    const span = spans.find((value) => value.clip.id === clip.id);
    if (span) editor.seek(span.start_ms);
  }

  async function pick() {
    const revision = editor.rev.current;
    try {
      setPicking(true);
      setError('');
      if (!composition && editor.media) {
        editor.applyComposition(
          await unwrap(window.reupmatic.compositionStart(editor.media.asset_id)),
          revision,
        );
      } else {
        const clips = await unwrap(window.reupmatic.compositionPick());
        if (clips?.length)
          editor.applyComposition(
            clips.map((clip) => ({ kind: 'append', clip })),
            revision,
          );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'INVALID_COMPOSITION');
    } finally {
      setPicking(false);
    }
  }

  function apply(command: CompositionCommand, revision = editor.rev.current) {
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
    const revision = editor.rev.current,
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
    <Collapsible trigger={t('compositionTitle')} defaultIsOpen={false}>
      <p>{t('compositionHelp')}</p>
      <div className="action-row">
        <Button
          label={t(composition ? 'compositionAppend' : 'compositionStart')}
          isDisabled={disabled || dirty || spans.length >= MAX_CLIPS}
          onClick={() => void pick()}
        />
        {picking && <span role="status">{t('compositionPicking')}</span>}
        {composition && (
          <span>
            {t('compositionSummary', {
              count: spans.length,
              seconds: (editor.duration / 1000).toFixed(3),
              width: composition.canvas.width,
              height: composition.canvas.height,
            })}
          </span>
        )}
      </div>
      {composition && (
        <>
          <div className="cue-list">
            <Table density="compact" aria-label={t('compositionTitle')}>
              <TableHeader>
                <TableRow isHeaderRow>
                  <TableHeaderCell scope="col">#</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('compositionFile')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('compositionSourceRange')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('compositionTimelineRange')}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spans.map((span, order) => (
                  <TableRow key={span.clip.id}>
                    <TableCell>
                      <Button
                        label={String(order + 1)}
                        variant={span.clip.id === draft?.id ? 'primary' : 'ghost'}
                        aria-label={`${t('compositionSelect')} ${order + 1}`}
                        isDisabled={disabled}
                        aria-current={span.clip.id === draft?.id ? 'true' : undefined}
                        onClick={() => void choose(span.clip)}
                      />
                    </TableCell>
                    <TableCell>{span.clip.source.name}</TableCell>
                    <TableCell>
                      {(span.clip.start_ms / 1000).toFixed(3)}–
                      {(span.clip.end_ms / 1000).toFixed(3)} s · {span.clip.speed}×
                    </TableCell>
                    <TableCell>
                      {(span.start_ms / 1000).toFixed(3)}–{(span.end_ms / 1000).toFixed(3)} s
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {draft && (
            <>
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
              <p className="field-help">{t('compositionJoinHelp')}</p>
            </>
          )}
          {dirty && <p role="status">{t('compositionDraft')}</p>}
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
    </Collapsible>
  );
}
