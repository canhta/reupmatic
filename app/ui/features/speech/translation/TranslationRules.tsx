import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { Trash2 } from 'lucide-react';
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
        <Text type="body" weight="semibold">
          {t('translationRules')}
        </Text>
      }
      defaultIsOpen={false}
    >
      <VStack gap={3} paddingBlock={2}>
        <Text as="p" type="body">
          {t('translationRulesHelp')}
        </Text>
        {rules.map((rule, index) => (
          <HStack
            gap={2}
            vAlign="end"
            // biome-ignore lint/suspicious/noArrayIndexKey: rules have no stable id; inputs are fully controlled by props so a shifted index only affects focus, not shown values
            key={index}
          >
            <Text as="span" type="label" weight="semibold" aria-hidden="true">
              {index + 1}
            </Text>
            <StackItem size="fill">
              <Grid columns={2} gap={2}>
                <TextInput
                  label={t('translationRuleFind')}
                  value={rule.find}
                  isDisabled={disabled}
                  onChange={(find) =>
                    onChange(rules.map((value, i) => (i === index ? { ...value, find } : value)))
                  }
                />
                <TextInput
                  label={t('translationRuleReplace')}
                  value={rule.replace}
                  isDisabled={disabled}
                  onChange={(replace) =>
                    onChange(rules.map((value, i) => (i === index ? { ...value, replace } : value)))
                  }
                />
              </Grid>
            </StackItem>
            <IconButton
              label={t('translationRuleRemove', { number: index + 1 })}
              tooltip={t('translationRuleRemove', { number: index + 1 })}
              size="sm"
              variant="ghost"
              isDisabled={disabled}
              icon={<Icon icon={Trash2} size="sm" />}
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
