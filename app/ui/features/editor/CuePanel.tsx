import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type Cue, mergeNext, splitCue } from '../../../core/subtitles/cues';
import { useEditor } from './EditorContext';
import { SubtitleExportPanel } from './subtitle-styles/SubtitleExportPanel';
import { TimeInput } from './TimeInput';
import { TextLayerControls } from './text-layers/TextLayerControls';
import { TextRulePanel } from './text-rules/TextRulePanel';

export function CuePanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { selected, setSelected, history, media, cap, busy, activeLayer } = editor;
  const cues = activeLayer.cues,
    change = editor.changeLayerCues;
  const caret = useRef(0);

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

  function split() {
    try {
      change(splitCue(cues, selected, editor.clock, caret.current, crypto.randomUUID()));
    } catch (reason) {
      editor.report(reason);
    }
  }

  function merge() {
    try {
      change(mergeNext(cues, selected));
    } catch (reason) {
      editor.report(reason);
    }
  }

  return (
    <section className="cue-panel" aria-label={t('subtitle')}>
      <h2>{t('textWorkspaceTitle')}</h2>
      <TextLayerControls />
      <Toolbar
        label={t('cueActions')}
        size="sm"
        startContent={
          <div className="action-row">
            <Button
              label={t('import')}
              isDisabled={!cap?.pysubs2 || busy}
              onClick={() => void editor.importSubtitles()}
            />
            <Button label={t('add')} onClick={add} />
            <Button
              label={t('remove')}
              isDisabled={!selected}
              onClick={() => {
                change(cues.filter((cue) => cue.id !== selected));
                setSelected('');
              }}
            />
            <Button label={t('undo')} isDisabled={!history.past.length} onClick={editor.undo} />
            <Button label={t('redo')} isDisabled={!history.future.length} onClick={editor.redo} />
            <Button label={t('split')} isDisabled={!selected} onClick={split} />
            <Button
              label={t('merge')}
              isDisabled={!selected || cues.at(-1)?.id === selected}
              onClick={merge}
            />
          </div>
        }
      />
      <SubtitleExportPanel />
      <TextRulePanel />
      <div className="cue-list">
        {!cues.length ? (
          <EmptyState title={t('noCues')} />
        ) : (
          <Table
            density="compact"
            verticalAlign="top"
            aria-label={t(`textLayer_${editor.activeTextLayer}`)}
          >
            <TableHeader>
              <TableRow isHeaderRow>
                <TableHeaderCell scope="col">#</TableHeaderCell>
                <TableHeaderCell scope="col">{t('start')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('end')}</TableHeaderCell>
                <TableHeaderCell scope="col">{t('text')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cues.map((cue, index) => (
                <TableRow key={cue.id}>
                  <TableCell>
                    <Button
                      label={String(index + 1)}
                      variant={cue.id === selected ? 'primary' : 'ghost'}
                      aria-current={cue.id === selected ? 'true' : undefined}
                      onClick={() => {
                        setSelected(cue.id);
                        editor.seek(cue.start_ms);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <TimeInput
                      label={`${t('start')} ${index + 1}`}
                      value={cue.start_ms}
                      onFocus={() => setSelected(cue.id)}
                      onCommit={(value) => update(cue.id, { start_ms: value })}
                    />
                  </TableCell>
                  <TableCell>
                    <TimeInput
                      label={`${t('end')} ${index + 1}`}
                      value={cue.end_ms}
                      onFocus={() => setSelected(cue.id)}
                      onCommit={(value) => update(cue.id, { end_ms: value })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="cue-text">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
