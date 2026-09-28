import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { StackItem } from '@astryxdesign/core/Stack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TranslationRule } from '../../../../core/speech/translation/rules';
import { PanelPair, PanelSection } from '../../../design-system/Panel';

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
    <PanelSection
      title={t('translationRules')}
      actions={
        <IconButton
          label={t('translationRuleAdd')}
          tooltip={t('translationRuleAdd')}
          variant="ghost"
          size="sm"
          isDisabled={disabled || rules.length >= 50}
          icon={<Icon icon={Plus} size="sm" />}
          onClick={() => onChange([...rules, { find: '', replace: '' }])}
        />
      }
    >
      {rules.length > 0 && (
        <VStack gap={2}>
          {rules.map((rule, index) => (
            <HStack
              gap={1}
              vAlign="center"
              // biome-ignore lint/suspicious/noArrayIndexKey: rules have no stable id; inputs are fully controlled by props so a shifted index only affects focus, not shown values
              key={index}
            >
              <StackItem size="fill">
                <PanelPair>
                  <TextInput
                    label={`${t('translationRuleFind')} ${index + 1}`}
                    isLabelHidden
                    placeholder={t('translationRuleFind')}
                    value={rule.find}
                    isDisabled={disabled}
                    onChange={(find) =>
                      onChange(rules.map((value, i) => (i === index ? { ...value, find } : value)))
                    }
                  />
                  <TextInput
                    label={`${t('translationRuleReplace')} ${index + 1}`}
                    isLabelHidden
                    placeholder={t('translationRuleReplace')}
                    value={rule.replace}
                    isDisabled={disabled}
                    onChange={(replace) =>
                      onChange(
                        rules.map((value, i) => (i === index ? { ...value, replace } : value)),
                      )
                    }
                  />
                </PanelPair>
              </StackItem>
              <MoreMenu
                label={t('translationRuleActions', { number: index + 1 })}
                size="sm"
                isDisabled={disabled}
                items={[
                  {
                    label: t('translationRuleRemove'),
                    variant: 'destructive',
                    onClick: () => onChange(rules.filter((_, i) => i !== index)),
                  },
                ]}
              />
            </HStack>
          ))}
        </VStack>
      )}
    </PanelSection>
  );
}
