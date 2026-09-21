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

  function endRename() {
    if (!editor.renameProject(draft)) setNameInvalid(false);
    setRenaming(false);
  }

  const recentDrafts = drafts.filter((draft) => draft.id !== editor.documentId);
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
      {}
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
