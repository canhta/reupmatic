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
      {}
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
      {}
      <div className="cue-search-row">
        {}
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
            {}
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
                      {}
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
