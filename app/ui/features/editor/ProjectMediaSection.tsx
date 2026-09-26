import { Button } from '@astryxdesign/core/Button';
import { ContextMenu } from '@astryxdesign/core/ContextMenu';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { VStack } from '@astryxdesign/core/VStack';
import { Captions, Film, Image as ImageIcon, Music, Plus } from 'lucide-react';
import { type DragEvent, type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectMedia } from '../../../core/editing/project-media';
import { getTextLayer, type TextLayerName } from '../../../core/subtitles/layers/document';
import { useEditor } from './EditorContext';
import { MEDIA_DRAG_TYPE } from './media-drag';

type Kind = 'video' | 'audio' | 'subtitle' | 'image';
interface Row {
  key: string;
  kind: Kind;
  name: string;
  duration_ms?: number;
  used: boolean;
  missing: boolean;
  importedLayer?: TextLayerName;
  stored?: ProjectMedia;
}

const KIND_ICON = { video: Film, audio: Music, subtitle: Captions, image: ImageIcon } as const;

export function ProjectMediaSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [targetKey, setTargetKey] = useState<string | null>(null);

  const rows: Row[] = [];
  if (editor.media) {
    rows.push({
      key: 'source',
      kind: 'video',
      name: editor.media.name,
      duration_ms: editor.media.duration_ms,
      used:
        !editor.composition ||
        editor.composition.clips.some((clip) => clip.source.name === editor.media?.name),
      missing: false,
    });
  }
  const placed = new Set<string>();
  for (const clip of editor.composition?.clips ?? []) {
    const identity = `${clip.source.path}\0${clip.source.sha256}`;
    if (placed.has(identity) || clip.source.name === editor.media?.name) continue;
    placed.add(identity);
    rows.push({
      key: `clip-${identity}`,
      kind: 'video',
      name: clip.source.name,
      duration_ms: clip.source.duration_ms,
      used: true,
      missing: false,
    });
  }
  if (editor.soundtrack) {
    rows.push({
      key: 'soundtrack',
      kind: 'audio',
      name: editor.soundtrack.source.name,
      duration_ms: editor.soundtrack.source.duration_ms,
      used: true,
      missing: false,
    });
  }
  for (const item of editor.projectMedia) {
    if (item.kind === 'video' && placed.has(`${item.path}\0${item.sha256}`)) continue;
    const importedLayer = item.kind === 'subtitle' ? item.imported_layer : undefined;
    rows.push({
      key: item.id,
      kind: item.kind,
      name: item.name,
      duration_ms: item.duration_ms,
      used:
        item.kind === 'image'
          ? editor.processing?.editing?.logo?.media_id === item.id
          : importedLayer != null &&
            getTextLayer(editor.textSnapshot, importedLayer).origin.kind === 'srt',
      missing: editor.mediaMissing.includes(item.id),
      importedLayer,
      stored: item,
    });
  }

  function usedLabel(row: Row): string {
    if (row.kind === 'image') return t('mediaUsedLogo');
    return row.importedLayer
      ? t('mediaImportedInto', { layer: t(`textLayer_${row.importedLayer}`) })
      : t('mediaUsed');
  }

  function placeable(stored: ProjectMedia | undefined, used: boolean, missing: boolean): boolean {
    return Boolean(stored && stored.kind === 'video' && !used && !missing);
  }

  function rowActions(row: Row): DropdownMenuOption[] {
    const stored = row.stored;
    if (!stored) return [];
    const actions: DropdownMenuOption[] = [];
    if (placeable(stored, row.used, row.missing))
      actions.push({
        label: t('mediaAddToTimeline'),
        onClick: () => void editor.placeMedia(stored, 'end'),
      });
    if (stored.kind === 'subtitle' && !row.missing && row.used)
      actions.push({
        label: t('mediaImportInto'),
        onClick: () => void editor.importSubtitleFile(stored),
      });
    if (!row.used)
      actions.push({
        label: t('mediaRemove'),
        variant: 'destructive',
        onClick: () => editor.removeMedia(row.key),
      });
    return actions;
  }

  function startDrag(event: DragEvent<HTMLLIElement>, row: Row) {
    if (!placeable(row.stored, row.used, row.missing)) return;
    event.dataTransfer.setData(MEDIA_DRAG_TYPE, row.key);
    event.dataTransfer.effectAllowed = 'copy';
  }

  const target = rows.find((row) => row.key === targetKey);
  const contextItems: DropdownMenuOption[] = target ? rowActions(target) : [];

  function capture(event: MouseEvent<HTMLDivElement>) {
    const marker = (event.target as HTMLElement | null)?.closest('[data-media-key]');
    setTargetKey(marker?.getAttribute('data-media-key') ?? null);
  }

  return (
    <VStack gap={2} className="project-media" onContextMenuCapture={capture}>
      {}
      <Button
        label={t('mediaAdd')}
        size="sm"
        icon={<Icon icon={Plus} size="sm" />}
        width="100%"
        isDisabled={editor.busy || editor.savingProject || editor.opening}
        onClick={() => void editor.importMedia()}
      />
      {!rows.length ? (
        <EmptyState title={t('mediaEmpty')} />
      ) : (
        <ContextMenu label={t('projectMedia')} presentation="adaptive" items={contextItems}>
          <List density="compact" hasDividers>
            {rows.map((row) => {
              const stored = row.stored;
              const description = row.missing
                ? t('mediaMissing')
                : row.used && row.importedLayer
                  ? usedLabel(row)
                  : row.duration_ms
                    ? formatTime(row.duration_ms)
                    : undefined;
              const actions = rowActions(row);
              const canPlace = placeable(stored, row.used, row.missing);
              return (
                <ListItem
                  key={row.key}
                  data-media-key={row.key}
                  label={row.name}
                  description={description}
                  draggable={canPlace}
                  onDragStart={(event) => startDrag(event, row)}
                  startContent={<Icon icon={KIND_ICON[row.kind]} size="sm" color="secondary" />}
                  endContent={
                    <HStack as="span" gap={2} vAlign="center" paddingInlineStart={2}>
                      {row.missing && (
                        <Button
                          label={t('mediaRelink')}
                          size="sm"
                          onClick={() => void editor.relinkMedia(row.key)}
                        />
                      )}
                      {canPlace && (
                        <IconButton
                          label={t('mediaAddToTimeline')}
                          tooltip={t('mediaAddToTimeline')}
                          variant="ghost"
                          size="sm"
                          icon={<Icon icon={Plus} size="sm" />}
                          onClick={() => stored && void editor.placeMedia(stored, 'end')}
                        />
                      )}
                      {stored?.kind === 'subtitle' && !row.used && !row.missing && (
                        <Button
                          label={t('mediaImportInto')}
                          size="sm"
                          onClick={() => void editor.importSubtitleFile(stored)}
                        />
                      )}
                      {row.used && (
                        <StatusDot
                          variant="neutral"
                          label={usedLabel(row)}
                          tooltip={usedLabel(row)}
                        />
                      )}
                      {actions.length > 0 && (
                        <MoreMenu
                          label={t('mediaRowActions', { name: row.name })}
                          size="sm"
                          items={actions}
                        />
                      )}
                    </HStack>
                  }
                />
              );
            })}
          </List>
        </ContextMenu>
      )}
    </VStack>
  );
}

function formatTime(milliseconds: number): string {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}
