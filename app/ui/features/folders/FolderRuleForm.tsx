import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Section } from '@astryxdesign/core/Section';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderSnapshot } from '../../../core/folders/folder-contracts';
import { type ProcessingRecipe, parseProcessingRecipe } from '../../../core/processing/recipe';
import { unwrap } from '../../bridge/client';
import {
  CommandFooter,
  type CommandStatus,
  PanelRow,
  PanelRows,
  PanelSection,
  PanelSections,
  PanelToggleProvider,
  ToggleRow,
} from '../../design-system/Panel';
import { PathRow } from '../../design-system/PanelControls';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { ProfilePicker } from '../profiles/ProfilePicker';
import { folderErrorKey } from './errors';

type PickedFolder = { directory_id: string; name: string };
interface Props {
  enabled: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (snapshot: FolderSnapshot) => void;
}

export function FolderRuleForm({ enabled, onDirty, onSaved }: Props) {
  const { t } = useTranslation();
  const [processing, setProcessing] = useState<ProcessingRecipe>();
  const [source, setSource] = useState<PickedFolder | null>(null);
  const [output, setOutput] = useState<PickedFolder | null>(null);
  const [scope, setScope] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const idle = busy || !enabled;

  useEffect(() => {
    onDirty(Boolean(source || output || scope || recursive || processing));
  }, [source, output, scope, recursive, processing, onDirty]);

  async function action(work: () => Promise<void>) {
    if (locked.current || !enabled) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await work();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WATCH_FAILED');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!source || !output || !scope) return;
    await action(async () => {
      if (processing) parseProcessingRecipe(processing);
      const snapshot = await unwrap(
        window.reupmatic.folderCreate({
          source_id: source.directory_id,
          output_id: output.directory_id,
          include_existing: scope === 'all',
          recursive,
          ...(processing ? { processing } : {}),
        }),
      );
      onSaved(snapshot);
      setSource(null);
      setOutput(null);
      setScope('');
      setRecursive(false);
      setProcessing(undefined);
      setSaved(true);
    });
  }

  const status: CommandStatus | null = error
    ? { tone: 'error', text: t(folderErrorKey(error)) }
    : saved
      ? { tone: 'success', text: t('folderSaved') }
      : null;

  return (
    <Section
      variant="transparent"
      padding={0}
      className="folder-rule-form"
      aria-label={t('folderNew')}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <PanelToggleProvider value={CheckboxInput}>
          <PanelSections>
            <PanelSection
              key="rule"
              title={t('folderNew')}
              status={{ tone: 'neutral', text: t('folderRenderScope') }}
            >
              <PanelRows>
                <PathRow
                  label={t('folderSource')}
                  value={source?.name}
                  chooseLabel={t('folderPickSource')}
                  isDisabled={idle}
                  onChoose={() =>
                    void action(async () => {
                      const picked = await unwrap(window.reupmatic.folderPickSource());
                      if (picked) setSource(picked);
                    })
                  }
                />
                <PathRow
                  label={t('folderOutput')}
                  value={output?.name}
                  chooseLabel={t('folderPickOutput')}
                  isDisabled={idle}
                  onChoose={() =>
                    void action(async () => {
                      const picked = await unwrap(window.reupmatic.folderPickOutput());
                      if (picked) setOutput(picked);
                    })
                  }
                />
                <PanelRow label={t('folderFirstRun')}>
                  <SegmentedControl
                    label={t('folderFirstRun')}
                    layout="fill"
                    size="sm"
                    value={scope}
                    onChange={setScope}
                    isDisabled={idle}
                  >
                    <SegmentedControlItem value="new" label={t('folderNewOnly')} />
                    <SegmentedControlItem value="all" label={t('folderAllExisting')} />
                  </SegmentedControl>
                </PanelRow>
                <ToggleRow
                  label={t('folderRecursive')}
                  value={recursive}
                  isDisabled={idle}
                  onChange={setRecursive}
                />
              </PanelRows>
            </PanelSection>
            <VStack key="recipe" gap={3}>
              <ProfilePicker onApply={setProcessing} disabled={idle} />
              <ProcessingOptions value={processing} onChange={setProcessing} disabled={idle} />
            </VStack>
            <CommandFooter key="save" status={status}>
              <Button
                label={t('folderSave')}
                variant="primary"
                type="submit"
                isDisabled={idle || !source || !output || !scope}
              />
            </CommandFooter>
          </PanelSections>
        </PanelToggleProvider>
      </form>
    </Section>
  );
}
