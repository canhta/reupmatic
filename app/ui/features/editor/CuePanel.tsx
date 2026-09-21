import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, TableBody, TableCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Cue, mergeNext, splitCue } from '../../../core/subtitles/cues';
import {
  getTextLayer,
  type TextLanguage,
  textLayerNames,
} from '../../../core/subtitles/layers/document';
import { cueQcFlags, type QcFlag } from '../../../core/subtitles/qc';
import { SpeechReview } from '../speech/SpeechGenerator';
import { TranslateReview } from '../speech/translation/TranslateGenerator';
import { OcrReview } from '../vision/OcrExtractGenerator';
import { useEditor } from './EditorContext';
import { useEditorGenerators } from './EditorGeneratorContext';
import { TimeInput } from './TimeInput';
import { CopyLayerDialog } from './text-layers/CopyLayerDialog';
import { FindReplaceBar } from './text-rules/FindReplaceBar';
import { ShiftTimingDialog } from './text-rules/ShiftTimingDialog';
import { useFindReplace } from './text-rules/useFindReplace';

type Dialog = 'copy' | 'shift' | null;

/**
 * The primary working surface: a narrow, permanent list of compact rows
 * (index · start–end · a clamped preview). Only the selected row expands
 * into edit fields — timing stays secondary to dragging on the timeline
 * (L5/D8).
 * Recognition, extraction and translation are set up in their tool panels
 * (ED-P01, ticket 02); while one has a result to review, its component
 * replaces this list in the same column instead of opening a second editor.
 *
 * Children mode (not data-driven), unlike most other tables in this app:
 * a data-driven header row is unavoidable (no `hasHeader` prop exists —
 * UI-CC04 gap below), and this list's own compact rows/selected-row
 * expansion already identify each column without repeating "#"/"Time"/
 * "Text" above them, so the header row is pure overhead here. The index
 * column's width is a fixed-width inner element rather than a `Table`
 * `width` (documented, data-driven-only — same pre-existing children-mode
 * gap), since children mode is the only way to drop the header.
 */
export function CuePanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { selected, setSelected, media, busy, activeLayer, activeTextLayer } = editor;
  const cues = activeLayer.cues,
    change = editor.changeLayerCues;
  const caret = useRef(0);
  const [query, setQuery] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const findReplace = useFindReplace(editor, query);
  const { review } = useEditorGenerators();
  const [dialog, setDialog] = useState<Dialog>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? cues.filter((cue) => cue.text.toLowerCase().includes(needle)) : cues;
  }, [cues, query]);

  function update(id: string, patch: Partial<Cue>) {
    change(cues.map((cue) => (cue.id === id ? { ...cue, ...patch } : cue)));
  }

  function add() {
    if (!media) return;
    const start = Math.min(editor.clock, Math.max(0, editor.duration - 1));
    const cue = {
      id: crypto.randomUUID(),
      start_ms: start,
      end_ms: Math.min(start + 2000, editor.duration),
      text: '',
    };
    change([...cues, cue]);
    setSelected(cue.id);
  }

  function remove(id: string) {
    change(cues.filter((cue) => cue.id !== id));
    setSelected('');
  }

  function split(id: string) {
    try {
      change(splitCue(cues, id, editor.clock, caret.current, crypto.randomUUID()));
    } catch (reason) {
      editor.report(reason);
    }
  }

  function merge(id: string) {
    try {
      change(mergeNext(cues, id));
    } catch (reason) {
      editor.report(reason);
    }
  }

  const layerOptions = textLayerNames.map((value) => ({
    value,
    label: `${t(`textLayer_${value}`)} (${getTextLayer(editor.textSnapshot, value).cues.length})`,
  }));
  const languageOptions = ['unknown', 'en', 'vi', 'zh'].map((value) => ({
    value,
    label: value === 'unknown' ? t('textLanguageUnknown') : t(`visionLanguage_${value}`),
  }));

  const indexById = useMemo(() => new Map(cues.map((cue, index) => [cue.id, index])), [cues]);

  if (review) {
    return (
      <section className="cue-panel" aria-label={t('subtitle')}>
        {review === 'speech' && <SpeechReview />}
        {review === 'ocr' && <OcrReview />}
        {review === 'translate' && <TranslateReview />}
      </section>
    );
  }

  function open(cue: Cue) {
    setSelected(cue.id);
    editor.seek(cue.start_ms);
  }

  return (
    <section className="cue-panel" aria-label={t('subtitle')}>
      {/* Stacked, not side by side: two Selectors sharing one ≈300px-wide
        row each truncated their common values ("Phụ đề hiể…", "Chưa
        khai…"). `.cue-panel-layer` stacks them full width instead. */}
      <div className="cue-panel-layer">
        <Selector
          label={t('textEditingLayer')}
          size="sm"
          value={activeTextLayer}
          isDisabled={!media}
          options={layerOptions}
          width="100%"
          onChange={(value) => {
            if (textLayerNames.includes(value as (typeof textLayerNames)[number]))
              editor.selectTextLayer(value as (typeof textLayerNames)[number]);
          }}
        />
        <Selector
          label={t('textLayerLanguage')}
          size="sm"
          value={activeLayer.language ?? 'unknown'}
          isDisabled={!media}
          options={languageOptions}
          width="100%"
          onChange={(value) => {
            if (['unknown', 'en', 'vi', 'zh'].includes(value))
              editor.changeLayerCues(activeLayer.cues, activeTextLayer, {
                language: value === 'unknown' ? null : (value as TextLanguage),
              });
          }}
        />
      </div>
      {activeLayer.stale && (
        <Banner
          status="warning"
          title={t('textLayerStale')}
          description={t('textLayerStaleHelp')}
        />
      )}
      {/* One ⌕ bar: the same query filters the visible rows and, once
        Replace is open, becomes the find pattern `FindReplaceBar` runs
        against the whole layer — not a second, separate find field. */}
      <div className="cue-search-row">
        {/* TextInput's own `className` lands inside its rendered structure, not
          on the flex item `.cue-search-row` actually lays out — this wrapper
          is the real flex child, so `min-width: 0` (editor.css) can let the
          field shrink below its content's intrinsic width instead of
          pushing the Replace toggle past the row's own edge. */}
        <div className="cue-search-field">
          <TextInput
            label={t('cueSearch')}
            isLabelHidden
            placeholder={t('cueSearch')}
            startIcon="search"
            hasClear
            width="100%"
            value={query}
            onChange={setQuery}
          />
        </div>
        <ToggleButton
          label={t('rulesToggle')}
          size="sm"
          isPressed={replaceOpen}
          isDisabled={!media}
          onPressedChange={(pressed) => {
            setReplaceOpen(pressed);
            if (!pressed) findReplace.reset();
          }}
        />
      </div>
      {replaceOpen && (
        <FindReplaceBar find={query} hasSelection={Boolean(selected)} state={findReplace} />
      )}
      <Toolbar
        label={t('cueActions')}
        size="sm"
        startContent={
          <div className="action-row">
            <Button label={t('add')} size="sm" isDisabled={!media} onClick={add} />
            {/* One home per command (ED-P01, ticket 03): recognition,
              extraction and translation live in the Transcribe and Translate
              tool panels, and the subtitle-file import path moved to the
              Project media section above this list. */}
            <MoreMenu
              label={t('moreCueActions')}
              size="sm"
              items={[
                {
                  label: t('textCopyTitle'),
                  isDisabled: !media || busy,
                  onClick: () => setDialog('copy'),
                },
                {
                  label: t('timingBulk'),
                  isDisabled: !media || busy || !cues.length,
                  onClick: () => setDialog('shift'),
                },
              ]}
            />
          </div>
        }
      />
      {!findReplace.preview && (
        <div className="cue-list">
          {!media ? (
            <EmptyState title={t('noSubtitlesYet')} />
          ) : !cues.length ? (
            <EmptyState title={t('noCues')} />
          ) : !filtered.length ? (
            <EmptyState title={t('noCueMatches')} />
          ) : (
            <Table
              density="compact"
              verticalAlign="top"
              aria-label={t(`textLayer_${activeTextLayer}`)}
            >
              <TableBody>
                {filtered.map((cue) => {
                  const index = indexById.get(cue.id) ?? 0;
                  const isSelected = cue.id === selected;
                  const flags = cueQcFlags(cue);
                  return (
                    <TableRow key={cue.id}>
                      {/* One column, not two: Table's children mode can't give
                      a narrow index column a real fixed width (UI-CC04 gap
                      below) — `table-layout: fixed` (Table's own default)
                      only ever splits unwidthed columns equally, and every
                      width/min-width/max-width override this lane tried on
                      the `<td>` itself was overridden back down. The index
                      badge and QC dot sit inline with the row's own
                      content instead, in the one cell every row already
                      has. */}
                      <TableCell>
                        <div className="cue-row">
                          <div className="cue-row-index">
                            <Button
                              label={String(index + 1)}
                              size="sm"
                              variant={isSelected ? 'primary' : 'ghost'}
                              aria-current={isSelected ? 'true' : undefined}
                              onClick={() => open(cue)}
                            />
                            {flags.length > 0 && (
                              <StatusDot
                                variant="warning"
                                label={qcLabel(t, flags)}
                                tooltip={qcLabel(t, flags)}
                              />
                            )}
                          </div>
                          {isSelected ? (
                            <div className="cue-row-expanded">
                              <TextArea
                                label={`${t('text')} ${index + 1}`}
                                isLabelHidden
                                rows={2}
                                width="100%"
                                value={cue.text}
                                onFocus={() => setSelected(cue.id)}
                                onSelect={(event) => {
                                  if (event.target instanceof HTMLTextAreaElement) {
                                    caret.current = event.target.selectionStart;
                                  }
                                }}
                                onChange={(text) => update(cue.id, { text })}
                              />
                              <div className="cue-row-timing">
                                <TimeInput
                                  label={`${t('start')} ${index + 1}`}
                                  value={cue.start_ms}
                                  onFocus={() => setSelected(cue.id)}
                                  onCommit={(value) => update(cue.id, { start_ms: value })}
                                />
                                <TimeInput
                                  label={`${t('end')} ${index + 1}`}
                                  value={cue.end_ms}
                                  onFocus={() => setSelected(cue.id)}
                                  onCommit={(value) => update(cue.id, { end_ms: value })}
                                />
                                <MoreMenu
                                  label={t('moreRowActions', { index: index + 1 })}
                                  size="sm"
                                  items={[
                                    {
                                      label: t('remove'),
                                      variant: 'destructive',
                                      onClick: () => remove(cue.id),
                                    },
                                    {
                                      label: t('split'),
                                      onClick: () => split(cue.id),
                                    },
                                    {
                                      label: t('merge'),
                                      isDisabled: index + 1 >= cues.length,
                                      onClick: () => merge(cue.id),
                                    },
                                  ]}
                                />
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="cue-row-preview"
                              // The accessible name is the cue's own text, same as
                              // before this row's redesign — the time range is
                              // real, visible content but stays out of the name
                              // (aria-hidden) so it doesn't get prefixed onto
                              // every row's name.
                              aria-label={cue.text || t('cueEmptyText')}
                              onClick={() => open(cue)}
                            >
                              <Text
                                as="span"
                                type="supporting"
                                size="xsm"
                                hasTabularNumbers
                                aria-hidden="true"
                              >
                                {formatTime(cue.start_ms)}–{formatTime(cue.end_ms)}
                              </Text>
                              <Text type="body" maxLines={2}>
                                {cue.text || t('cueEmptyText')}
                              </Text>
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
      <CopyLayerDialog isOpen={dialog === 'copy'} onClose={() => setDialog(null)} />
      <ShiftTimingDialog isOpen={dialog === 'shift'} onClose={() => setDialog(null)} />
    </section>
  );
}

function qcLabel(t: (key: string, options?: Record<string, unknown>) => string, flags: QcFlag[]) {
  return flags.map((flag) => t(`qc_${flag}`)).join(' · ');
}

function formatTime(milliseconds: number): string {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}
