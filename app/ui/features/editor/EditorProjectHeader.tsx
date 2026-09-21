import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import type { DropdownMenuItemData, DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { refreshRecentItems, useRecentItems } from '../projects/recent/useRecentItems';
import { refreshRecoveryDrafts, useRecoveryDrafts } from '../projects/recovery/useRecoveryDrafts';
import { useEditor } from './EditorContext';

/**
 * The header title IS the project (D-63). It shows one control at a time
 * (owner): with no project open, the picker — Recent projects
 * (recovered drafts marked "Recovered"), Open project… and New project, never a
 * video or file; with one open, the project's own name, renamed in place by
 * clicking it. Switching projects then lives in the File menu, which already
 * mirrors every one of those commands (menu.ts). Save carries its own state —
 * Save · Saving… · Saved — instead of a second label beside it.
 */
export function EditorProjectHeader() {
  const { t, i18n } = useTranslation();
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameInvalid, setNameInvalid] = useState(false);
  const drafts = useRecoveryDrafts();
  const recentItems = useRecentItems();
  const locked = editor.busy || editor.savingProject || editor.opening;
  const displayName = editor.projectName || t('untitledProject');
  const saved = editor.projectPath !== null && !editor.dirty;
  const saveLabel = editor.savingProject
    ? t('projectSaving')
    : saved
      ? t('saved')
      : t('projectSave');

  // Recovered drafts are listed in the picker itself, so the list has to be
  // loaded before it is ever opened.
  useEffect(() => {
    void refreshRecoveryDrafts();
  }, []);
  useEffect(() => {
    if (isOpen) {
      void refreshRecoveryDrafts();
      void refreshRecentItems();
    }
  }, [isOpen]);

  function beginRename() {
    setDraft(editor.projectName);
    setNameInvalid(false);
    setRenaming(true);
  }

  function commitRename() {
    if (!editor.renameProject(draft)) {
      setNameInvalid(true);
      return;
    }
    setRenaming(false);
  }

  // Leaving the field ends the rename either way — committing what is there, or
  // dropping an empty name rather than trapping the header in edit mode
  // (owner: renaming "stuck ở đó luôn").
  function endRename() {
    if (!editor.renameProject(draft)) setNameInvalid(false);
    setRenaming(false);
  }

  const recentDrafts = drafts.filter((draft) => draft.id !== editor.documentId);
  // The switcher lists projects only (D-63): a recovered draft is another row
  // marked "Recovered", not a second list, and a plain video is never here.
  type RecentRow = { key: string; opened_at: number; option: DropdownMenuItemData };
  const recentRows: RecentRow[] = [
    ...recentDrafts.map((draft) => ({
      key: `draft-${draft.id}`,
      opened_at: draft.updated_at,
      option: {
        id: draft.id,
        label: draft.source_name || t('recoveryDamaged'),
        description: new Date(draft.updated_at).toLocaleString(i18n.language),
        endContent: <Badge label={t('recoveredBadge')} />,
        isDisabled: locked || Boolean(draft.error),
        onClick: () => void editor.openRecovery(draft.id, draft.revision),
      },
    })),
    ...recentItems
      .filter((item) => item.kind === 'project')
      .map((item) => ({
        key: `project-${item.id}`,
        opened_at: item.opened_at,
        option: {
          id: `project-${item.id}`,
          label: item.name,
          description: new Date(item.opened_at).toLocaleString(i18n.language),
          isDisabled: locked,
          onClick: () => void editor.openProjectPath(item.path),
        },
      })),
  ].sort((a, b) => b.opened_at - a.opened_at);

  const items: DropdownMenuOption[] = [
    ...(recentRows.length
      ? [
          {
            type: 'section' as const,
            title: t('recentTitle'),
            // Open only — discarding a draft is the recovery indicator's job,
            // not a permanent destructive row here.
            items: recentRows.map((row) => row.option),
          },
          { type: 'divider' as const },
        ]
      : []),
    {
      label: t('openProjectMenu'),
      isDisabled: locked,
      onClick: () => void editor.openProject(),
    },
    {
      label: t('newProjectMenu'),
      isDisabled: locked,
      onClick: () => void editor.newProject(),
    },
  ];

  return (
    <div
      className="workspace-title editor-project-header"
      ref={(node) => {
        editor.titleRef.current = node;
      }}
      tabIndex={-1}
    >
      <span className="workspace-title-content">
        {renaming ? (
          <TextInput
            label={t('projectNameLabel')}
            isLabelHidden
            size="sm"
            width={220}
            value={draft}
            hasAutoFocus
            isDisabled={locked}
            status={nameInvalid ? { type: 'error', message: t('projectNameEmpty') } : undefined}
            onChange={(value) => {
              setDraft(value);
              setNameInvalid(false);
            }}
            onEnter={commitRename}
            onBlur={endRename}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setRenaming(false);
              }
            }}
          />
        ) : editor.media ? (
          // A project is open: the title is the name, and clicking it renames.
          <Button
            label={displayName}
            variant="ghost"
            size="sm"
            isDisabled={locked}
            onClick={beginRename}
          />
        ) : (
          <DropdownMenu
            button={{
              label: displayName,
              variant: 'ghost',
              size: 'sm',
              isDisabled: locked,
            }}
            items={items}
            isMenuOpen={isOpen}
            onOpenChange={setIsOpen}
            menuWidth={320}
          />
        )}
      </span>
      {/* The button is the state (owner): a project never written
          to disk, or one with edits since, reads "Save"; it reads "Saving…"
          while the write runs and "Saved" once there is nothing left to write,
          returning to "Save" the moment the project is dirty again. */}
      <Button
        label={saveLabel}
        data-project-save="true"
        size="sm"
        isLoading={editor.savingProject}
        isDisabled={!editor.media || locked || saved}
        onClick={() => void editor.saveCurrentProject()}
      />
    </div>
  );
}
