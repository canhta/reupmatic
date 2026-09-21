import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ProcessingRecipe, sameProcessing } from '../../../core/processing/recipe';
import { applyProfileProcessing } from '../../../core/profiles/profile-document';
import { useCatalog } from '../catalog/CatalogProvider';
import { ProfileManager } from '../profiles/ProfileManager';
import { useEditor } from './EditorContext';

/**
 * One header "Profile ▾" selector, the ONLY profile picker in the window.
 * Applying a profile overwrites the live recipe in one undoable step, no
 * confirmation — the button label then reads "Profile: <name>" and gains
 * "· modified" once a later edit changes the document. "Save current as
 * profile…" captures the live recipe once, here; "Manage profiles…" opens
 * ProfileManager (rename/notes/archive only now) for everything after that
 * first save.
 */
export function EditorProfileSwitcher() {
  const { t } = useTranslation();
  const editor = useEditor();
  const catalog = useCatalog();
  const [manageOpen, setManageOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [appliedName, setAppliedName] = useState<string | null>(null);
  const appliedRecipe = useRef<ProcessingRecipe | undefined>(undefined);
  const locked = editor.busy || editor.opening;
  const profiles = catalog.snapshot?.profiles.filter((profile) => !profile.archived) ?? [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: documentId is a trigger only (reset "applied" state on a new document), not a value the effect body reads.
  useEffect(() => {
    setAppliedName(null);
    appliedRecipe.current = undefined;
  }, [editor.documentId]);

  function apply(id: string, name: string) {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    // Profiles never carry the logo (D-63); applying one keeps the project's own
    // placement rather than dropping it to a silent no-op.
    const recipe = applyProfileProcessing(profile.processing ?? null, editor.processing);
    editor.changeProcessing(recipe);
    setAppliedName(name);
    appliedRecipe.current = recipe;
  }

  async function saveCurrent() {
    if (!saveName.trim() || saving) return;
    setSaving(true);
    try {
      const result = await catalog.mutate(() =>
        window.reupmatic.profileSave({
          id: crypto.randomUUID(),
          expected_revision: null,
          name: saveName.trim(),
          notes: '',
          processing: structuredClone(editor.processing ?? null),
          archived: false,
        }),
      );
      if (result) {
        setAppliedName(saveName.trim());
        appliedRecipe.current = structuredClone(editor.processing ?? undefined);
        setSaveOpen(false);
        setSaveName('');
      }
    } finally {
      setSaving(false);
    }
  }

  const modified =
    Boolean(appliedName) && !sameProcessing(editor.processing, appliedRecipe.current);
  const label = appliedName
    ? t(modified ? 'profileAppliedModifiedLabel' : 'profileAppliedLabel', { name: appliedName })
    : t('profileSwitcherLabel');

  const items: DropdownMenuOption[] = [
    ...(profiles.length
      ? [
          {
            type: 'section' as const,
            title: t('applyProfileTitle'),
            items: profiles.map((profile) => ({
              id: profile.id,
              label: profile.name,
              isDisabled: locked,
              onClick: () => apply(profile.id, profile.name),
            })),
          },
          { type: 'divider' as const },
        ]
      : []),
    {
      label: t('saveCurrentAsProfile'),
      isDisabled: locked || !editor.media,
      onClick: () => setSaveOpen(true),
    },
    {
      label: t('manageProfilesMenu'),
      onClick: () => setManageOpen(true),
    },
  ];

  return (
    <>
      <DropdownMenu
        button={{
          label,
          variant: 'secondary',
          size: 'sm',
          isDisabled: locked,
        }}
        items={items}
        menuWidth={260}
      />
      <Dialog isOpen={saveOpen} onOpenChange={setSaveOpen} width={420} purpose="form">
        <DialogHeader title={t('saveCurrentAsProfile')} onOpenChange={setSaveOpen} />
        <div className="business-form">
          <TextInput
            label={t('catalogName')}
            value={saveName}
            isDisabled={saving}
            onChange={setSaveName}
          />
          <Button
            label={t('catalogSave')}
            variant="primary"
            isDisabled={saving || !saveName.trim()}
            onClick={() => void saveCurrent()}
          />
        </div>
      </Dialog>
      <Dialog isOpen={manageOpen} onOpenChange={setManageOpen} width={860} purpose="form">
        <DialogHeader title={t('profilesTitle')} onOpenChange={setManageOpen} />
        <ProfileManager />
      </Dialog>
    </>
  );
}
