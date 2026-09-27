import { Item } from '@astryxdesign/core/Item';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { defaultSubtitleStyle, type SubtitleStyle } from '../../../../core/subtitles/style';
import {
  applySubtitleTemplate,
  matchingSubtitleTemplate,
  type SubtitleTemplate,
  subtitleTemplates,
} from '../../../../core/subtitles/templates';

/**
 * Each row animates a sample line as a selection hint. The monitor above renders the real ASS,
 * so the chosen template is seen exactly as it will burn.
 */
function TemplateSample({ template }: { template: SubtitleTemplate }) {
  return (
    <Text
      as="span"
      type="body"
      weight="semibold"
      className={`template-sample template-sample--${template.id}`}
    >
      {template.uppercase ? 'BOLD' : 'Aa'}
    </Text>
  );
}

export function SubtitleTemplates({
  value,
  disabled,
  onChange,
}: {
  value?: SubtitleStyle;
  disabled: boolean;
  onChange(style: SubtitleStyle): void;
}) {
  const { t } = useTranslation();
  const effective = value ?? defaultSubtitleStyle;
  const current = matchingSubtitleTemplate(effective)?.id;
  return (
    <VStack gap={1}>
      <Text as="p" type="label" weight="semibold">
        {t('styleTemplate')}
      </Text>
      {subtitleTemplates.map((template) => (
        <Item
          key={template.id}
          align="center"
          density="compact"
          isDisabled={disabled}
          aria-current={current === template.id ? 'true' : undefined}
          label={<TemplateSample template={template} />}
          description={t(`styleTemplate_${template.id}`)}
          onClick={() => {
            if (!disabled) onChange(applySubtitleTemplate(effective, template));
          }}
        />
      ))}
    </VStack>
  );
}
