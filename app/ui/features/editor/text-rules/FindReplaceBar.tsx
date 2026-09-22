import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { ReviewGrid } from '../text-layers/ReviewGrid';
import type { useFindReplace } from './useFindReplace';

export function FindReplaceBar({
  find,
  hasSelection,
  state,
}: {
  find: string;
  hasSelection: boolean;
  state: ReturnType<typeof useFindReplace>;
}) {
  const { t } = useTranslation();
  return (
    <VStack gap={2}>
      <FormLayout direction="vertical">
        <TextInput label={t('replace')} value={state.replacement} onChange={state.setReplacement} />
        <Selector
          label={t('rulesScope')}
          value={state.scope}
          onChange={(value) => {
            if (value === 'all' || value === 'selected') state.setScope(value);
          }}
          options={['all', 'selected'].map((value) => ({
            value,
            label: t(`rulesScope_${value}`),
          }))}
        />
      </FormLayout>
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
            {t('rulesAdvanced')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <FormLayout direction="vertical">
          <Selector
            label={t('rulesMode')}
            value={state.mode}
            options={['literal', 'regex'].map((mode) => ({
              value: mode,
              label: t(`rulesMode_${mode}`),
            }))}
            onChange={(mode) => {
              if (mode === 'literal' || mode === 'regex') state.setMode(mode);
            }}
          />
          <CheckboxInput
            label={t('rulesCase')}
            value={state.caseSensitive}
            onChange={state.setCaseSensitive}
          />
        </FormLayout>
        {state.mode === 'regex' && (
          <Text as="p" type="supporting">
            {t('rulesRegexHelp')}
          </Text>
        )}
      </Collapsible>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button
          label={t('rulesPreview')}
          isDisabled={!state.canRun || (state.scope === 'selected' && !hasSelection)}
          onClick={state.run}
        />
        {state.busy && <Button label={t('cancel')} onClick={state.cancel} />}
      </HStack>
      {state.error && (
        <Banner
          status="error"
          title={t(state.error === 'TEXT_RULE_TIMEOUT' ? 'rulesTimeout' : 'rulesInvalid')}
          description={<code>{state.error}</code>}
        />
      )}
      {state.preview && (
        <>
          <Text type="body" role="status">
            {t('rulesResultCues', { count: state.preview.result.matched_cues })}
            {' · '}
            {t('rulesResultMatches', { count: state.preview.result.replacements })}
          </Text>
          {!state.applicable && (
            <Text as="p" type="body" role="status">
              {t('rulesStale')}
            </Text>
          )}
          <ReviewGrid
            ariaLabel={t('rulesComparison')}
            rowKey={(change) => change.id}
            rows={state.preview.result.changes}
            columns={[
              { key: 'before', header: t('rulesBefore'), render: (change) => change.before },
              { key: 'after', header: t('rulesAfter'), render: (change) => change.after },
            ]}
          />
          {state.preview.result.matched_cues > 25 && (
            <Text as="p" type="body">
              {t('rulesMore')}
            </Text>
          )}
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button label={t('rulesDiscard')} onClick={state.reset} />
            <Button
              label={t('rulesApply')}
              variant="primary"
              isDisabled={!state.applicable || !state.preview.result.matched_cues}
              onClick={state.apply}
            />
          </HStack>
        </>
      )}
      {!find && (
        <Text as="p" type="body" role="status">
          {t('rulesFindEmpty')}
        </Text>
      )}
    </VStack>
  );
}
