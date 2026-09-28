import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type Cue,
  mergeNext,
  setCueText,
  setCueTime,
  splitCue,
} from '../../../../core/subtitles/cues';
import {
  getTextLayer,
  type TextLanguage,
  textLayerNames,
} from '../../../../core/subtitles/layers/document';
import { type CueSyncState, translatedCueSync } from '../../../../core/subtitles/layers/sync';
import { cueQcFlags } from '../../../../core/subtitles/qc';
import { PanelPair, PanelRows, PanelStatus } from '../../../design-system/Panel';
import { useEditor } from '../EditorContext';
import { TimeInput } from '../TimeInput';
import { DrawerActions } from '../ToolDrawer';
import { CopyLayerDialog } from '../text-layers/CopyLayerDialog';
import { FindReplaceBar } from '../text-rules/FindReplaceBar';
import { ShiftTimingDialog } from '../text-rules/ShiftTimingDialog';
import { useFindReplace } from '../text-rules/useFindReplace';

type Dialog = 'copy' | 'shift' | null;
const LANGUAGES = ['unknown', 'en', 'vi', 'zh'] as const;
const SYNC_LABEL_KEY: Record<CueSyncState, string | null> = {
  linked: null,
  deviated: 'cueSyncDeviated',
  detached: 'cueSyncDetached',
  unlinked: 'cueSyncUnlinked',
};

/** Captions › Cues: the active layer's cues, searched and edited in place. */
export function CuesView({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const { selected, setSelected, media, busy, activeLayer, activeTextLayer } = editor;
  const cues = activeLayer.cues;
  const change = editor.changeLayerCues;
  const caret = useRef(0);
  const [query, setQuery] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const findReplace = useFindReplace(editor, query);
  const [dialog, setDialog] = useState<Dialog>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? cues.filter((cue) => cue.text.toLowerCase().includes(needle)) : cues;
  }, [cues, query]);
  const indexById = useMemo(() => new Map(cues.map((cue, index) => [cue.id, index])), [cues]);
  // A translated line's drift from its source is deliberate, so it is surfaced, never corrected.
  const cueSync = useMemo(() => {
    if (activeTextLayer !== 'translated') return new Map<string, CueSyncState>();
    return new Map(translatedCueSync(editor.textSnapshot).map((entry) => [entry.id, entry.state]));
  }, [activeTextLayer, editor.textSnapshot]);
  if (!isActive) return null;

  function updateText(id: string, text: string) {
    change(cues.map((cue) => (cue.id === id ? setCueText(cue, text) : cue)));
  }

  function updateTime(id: string, start_ms: number, end_ms: number) {
    change(cues.map((cue) => (cue.id === id ? setCueTime(cue, start_ms, end_ms) : cue)));
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

  function open(cue: Cue) {
    setSelected(cue.id);
    editor.seek(cue.start_ms);
  }

  function closeReplace() {
    setReplaceOpen(false);
    findReplace.reset();
  }

  function flags(cue: Cue) {
    const labels = cueQcFlags(cue, editor.lineLengthThresholds(cue.text)).map((flag) =>
      t(`qc_${flag}`),
    );
    const sync = SYNC_LABEL_KEY[cueSync.get(cue.id) ?? 'linked'];
    return sync ? [...labels, t(sync)] : labels;
  }

  return (
    <VStack gap={3}>
      <DrawerActions>
        <IconButton
          label={t('add')}
          tooltip={t('add')}
          variant="ghost"
          size="sm"
          isDisabled={!media}
          icon={<Icon icon={Plus} size="sm" />}
          onClick={add}
        />
        <MoreMenu
          label={t('moreCueActions')}
          size="sm"
          items={[
            {
              label: t('rulesToggle'),
              isDisabled: !media || replaceOpen,
              onClick: () => setReplaceOpen(true),
            },
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
      </DrawerActions>
      <PanelRows>
        <Selector
          label={t('textEditingLayer')}
          value={activeTextLayer}
          isDisabled={!media}
          options={textLayerNames.map((value) => ({
            value,
            label: `${t(`textLayer_${value}`)} (${getTextLayer(editor.textSnapshot, value).cues.length})`,
          }))}
          onChange={(value) => {
            const layer = textLayerNames.find((name) => name === value);
            if (layer) editor.selectTextLayer(layer);
          }}
        />
        <Selector
          label={t('textLayerLanguage')}
          value={activeLayer.language ?? 'unknown'}
          isDisabled={!media}
          options={LANGUAGES.map((value) => ({
            value,
            label: value === 'unknown' ? t('textLanguageUnknown') : t(`visionLanguage_${value}`),
          }))}
          onChange={(value) => {
            if ((LANGUAGES as readonly string[]).includes(value))
              change(activeLayer.cues, activeTextLayer, {
                language: value === 'unknown' ? null : (value as TextLanguage),
              });
          }}
        />
      </PanelRows>
      {activeLayer.stale && <PanelStatus tone="warning" text={t('textLayerStale')} />}
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
      {replaceOpen && (
        <FindReplaceBar
          find={query}
          cues={cues}
          hasSelection={Boolean(selected)}
          state={findReplace}
          onClose={closeReplace}
        />
      )}
      {!findReplace.preview &&
        (!media ? (
          <EmptyState isCompact title={t('noSubtitlesYet')} />
        ) : !cues.length ? (
          <EmptyState isCompact title={t('noCues')} />
        ) : !filtered.length ? (
          <EmptyState isCompact title={t('noCueMatches')} />
        ) : (
          <List density="compact" hasDividers aria-label={t(`textLayer_${activeTextLayer}`)}>
            {filtered.map((cue) => {
              const index = indexById.get(cue.id) ?? 0;
              const isSelected = cue.id === selected;
              const warnings = flags(cue);
              const time = `${formatTime(cue.start_ms)}–${formatTime(cue.end_ms)}`;
              const status = warnings.length > 0 && (
                <StatusDot
                  variant="warning"
                  label={warnings.join(' · ')}
                  tooltip={warnings.join(' · ')}
                />
              );
              if (!isSelected) {
                return (
                  <ListItem
                    key={cue.id}
                    label={time}
                    description={
                      <Text type="body" maxLines={2}>
                        {cue.text || t('cueEmptyText')}
                      </Text>
                    }
                    endContent={status || undefined}
                    onClick={() => open(cue)}
                  />
                );
              }
              return (
                <ListItem
                  key={cue.id}
                  label={time}
                  isSelected
                  endContent={
                    <HStack gap={1} vAlign="center">
                      {status}
                      <MoreMenu
                        label={t('moreRowActions', { index: index + 1 })}
                        size="sm"
                        items={[
                          { label: t('split'), onClick: () => split(cue.id) },
                          {
                            label: t('merge'),
                            isDisabled: index + 1 >= cues.length,
                            onClick: () => merge(cue.id),
                          },
                          {
                            label: t('remove'),
                            variant: 'destructive',
                            onClick: () => remove(cue.id),
                          },
                        ]}
                      />
                    </HStack>
                  }
                  description={
                    <VStack gap={2} paddingBlock={1}>
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
                        onChange={(text) => updateText(cue.id, text)}
                      />
                      <PanelPair>
                        <TimeInput
                          label={`${t('start')} ${index + 1}`}
                          value={cue.start_ms}
                          onFocus={() => setSelected(cue.id)}
                          onCommit={(value) => updateTime(cue.id, value, cue.end_ms)}
                        />
                        <TimeInput
                          label={`${t('end')} ${index + 1}`}
                          value={cue.end_ms}
                          onFocus={() => setSelected(cue.id)}
                          onCommit={(value) => updateTime(cue.id, cue.start_ms, value)}
                        />
                      </PanelPair>
                    </VStack>
                  }
                />
              );
            })}
          </List>
        ))}
      <CopyLayerDialog isOpen={dialog === 'copy'} onClose={() => setDialog(null)} />
      <ShiftTimingDialog isOpen={dialog === 'shift'} onClose={() => setDialog(null)} />
    </VStack>
  );
}

function formatTime(milliseconds: number): string {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}
