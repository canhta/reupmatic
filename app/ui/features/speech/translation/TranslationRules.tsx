import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { TranslationRule } from '../../../../core/speech/translation/rules';

export function TranslationRules({
  rules,
  onChange,
  disabled,
}: {
  rules: TranslationRule[];
  onChange: (rules: TranslationRule[]) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Collapsible
      trigger={
        <Text type="label" weight="semibold">
          {t('translationRules')}
        </Text>
      }
      defaultIsOpen={false}
    >
      <VStack gap={3}>
        <Text as="p" type="supporting">
          {t('translationRulesHelp')}
        </Text>
        {rules.map((rule, index) => (
          <HStack
            gap={2}
            vAlign="end"
            wrap="wrap"
            // biome-ignore lint/suspicious/noArrayIndexKey: rules have no stable id; inputs are fully controlled by props so a shifted index only affects focus, not shown values
            key={index}
          >
            <TextInput
              label={t('translationRuleFind', { number: index + 1 })}
              value={rule.find}
              isDisabled={disabled}
              onChange={(find) =>
                onChange(rules.map((value, i) => (i === index ? { ...value, find } : value)))
              }
            />
            <TextInput
              label={t('translationRuleReplace', { number: index + 1 })}
              value={rule.replace}
              isDisabled={disabled}
              onChange={(replace) =>
                onChange(rules.map((value, i) => (i === index ? { ...value, replace } : value)))
              }
            />
            <Button
              label={t('translationRuleRemove', { number: index + 1 })}
              isDisabled={disabled}
              onClick={() => onChange(rules.filter((_, i) => i !== index))}
            />
          </HStack>
        ))}
        <Button
          label={t('translationRuleAdd')}
          isDisabled={disabled || rules.length >= 50}
          onClick={() => onChange([...rules, { find: '', replace: '' }])}
        />
      </VStack>
    </Collapsible>
  );
}
