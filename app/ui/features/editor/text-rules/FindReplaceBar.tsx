import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { Cue } from '../../../../core/subtitles/cues';
import { CommandFooter, PanelRow, PanelRows } from '../../../design-system/Panel';
import { DrawerFooter } from '../ToolDrawer';
import { ReviewRows } from '../text-layers/ReviewRows';
import type { useFindReplace } from './useFindReplace';

/** Find & replace over the search text: its fields in the body, preview and apply in the footer. */
export function FindReplaceBar({
  find,
  cues,
  hasSelection,
  state,
  onClose,
}: {
  find: string;
  cues: Cue[];
  hasSelection: boolean;
  state: ReturnType<typeof useFindReplace>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const preview = state.preview;
  const times = new Map(cues.map((cue) => [cue.id, cue]));
  return (
    <VStack gap={3}>
      <PanelRows>
        <TextInput label={t('replace')} value={state.replacement} onChange={state.setReplacement} />
        <PanelRow label={t('rulesScope')}>
          <SegmentedControl
            label={t('rulesScope')}
            value={state.scope}
            size="sm"
            layout="fill"
            onChange={(value) => {
              if (value === 'all' || value === 'selected') state.setScope(value);
            }}
          >
            <SegmentedControlItem value="all" label={t('rulesScope_all')} />
            <SegmentedControlItem value="selected" label={t('rulesScope_selected')} />
          </SegmentedControl>
        </PanelRow>
        <PanelRow label={t('rulesMode')}>
          <SegmentedControl
            label={t('rulesMode')}
            value={state.mode}
            size="sm"
            layout="fill"
            onChange={(mode) => {
              if (mode === 'literal' || mode === 'regex') state.setMode(mode);
            }}
          >
            <SegmentedControlItem value="literal" label={t('rulesMode_literal')} />
            <SegmentedControlItem value="regex" label={t('rulesMode_regex')} />
          </SegmentedControl>
        </PanelRow>
      </PanelRows>
      <CheckboxInput
        label={t('rulesCase')}
        value={state.caseSensitive}
        onChange={state.setCaseSensitive}
      />
      {preview && (
        <>
          <Text type="body" role="status">
            {t('rulesResultCues', { count: preview.result.matched_cues })}
            {' · '}
            {t('rulesResultMatches', { count: preview.result.replacements })}
          </Text>
          <ReviewRows
            ariaLabel={t('rulesComparison')}
            entries={preview.result.changes.map((change) => {
              const cue = times.get(change.id);
              return {
                key: change.id,
                time: cue ? `${cue.start_ms / 1000}–${cue.end_ms / 1000}` : '—',
                blocks: [
                  { key: 'before', label: t('rulesBefore'), text: change.before },
                  { key: 'after', label: t('rulesAfter'), text: change.after, isPrimary: true },
                ],
              };
            })}
          />
          {preview.result.matched_cues > preview.result.changes.length && (
            <Text as="p" type="body">
              {t('rulesMore', { count: preview.result.changes.length })}
            </Text>
          )}
        </>
      )}
      <DrawerFooter>
        <CommandFooter
          status={
            state.error
              ? {
                  tone: 'error',
                  text: t(state.error === 'TEXT_RULE_TIMEOUT' ? 'rulesTimeout' : 'rulesInvalid'),
                }
              : preview && !state.applicable
                ? { tone: 'warning', text: t('rulesStale') }
                : null
          }
          active={state.busy ? { phase: 'running', fraction: null } : null}
          onCancel={state.cancel}
        >
          {preview ? (
            <>
              <Button label={t('draftDiscard')} onClick={state.reset} />
              <Button
                label={t('draftApply')}
                variant="primary"
                isDisabled={!state.applicable || !preview.result.matched_cues}
                onClick={state.apply}
              />
            </>
          ) : (
            <>
              <Button label={t('close')} onClick={onClose} />
              <Button
                label={t('rulesPreview')}
                variant="primary"
                isDisabled={!state.canRun || (state.scope === 'selected' && !hasSelection)}
                tooltip={!find ? t('rulesFindEmpty') : undefined}
                onClick={state.run}
              />
            </>
          )}
        </CommandFooter>
      </DrawerFooter>
    </VStack>
  );
}
