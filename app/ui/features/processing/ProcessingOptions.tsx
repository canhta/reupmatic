import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import {
  type ProcessingLanguage,
  type ProcessingRecipe,
  parseProcessingRecipe,
} from '../../../core/processing/recipe';
import { SubtitleStyleForm } from '../editor/subtitle-styles/SubtitleStyleForm';
import { EditingOptions } from './EditingOptions';
import { processingErrorKey } from './message-key';

interface Props {
  value?: ProcessingRecipe;
  disabled: boolean;
  hasSubtitles?: boolean;
  showSubtitleStyle?: boolean;
  onChange(value: ProcessingRecipe | undefined): void;
}

export function ProcessingOptions({
  value,
  disabled,
  hasSubtitles = false,
  showSubtitleStyle = true,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const ocr = value?.ocr;
  const selectedLanguage = value?.ocr?.language ?? 'en';
  let error = '';
  try {
    if (value) parseProcessingRecipe(value, hasSubtitles);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : 'INVALID_PROCESSING';
  }

  function update(next: ProcessingRecipe) {
    const { ocr, editing, subtitle_style } = next;
    onChange(
      ocr || editing || subtitle_style
        ? {
            ...(ocr ? { ocr } : {}),
            ...(editing ? { editing } : {}),
            ...(subtitle_style ? { subtitle_style } : {}),
          }
        : undefined,
    );
  }
  function changeLanguage(language: ProcessingLanguage) {
    update({ ...(value ?? {}), ...(value?.ocr ? { ocr: { ...value.ocr, language } } : {}) });
  }

  return (
    <Section
      variant="transparent"
      padding={0}
      className="processing-options"
      aria-label={t('processingTitle')}
    >
      <Stack direction="vertical" gap={3}>
        <EditingOptions
          value={value?.editing}
          disabled={disabled}
          onChange={(editing) => update({ ...(value ?? {}), editing })}
        />
        {showSubtitleStyle && (
          <Collapsible
            trigger={
              <Text type="body" weight="semibold">
                {t('styleTitle')}
              </Text>
            }
            defaultIsOpen={false}
          >
            <SubtitleStyleForm
              value={value?.subtitle_style}
              disabled={disabled}
              coverToggle={CheckboxInput}
              onChange={(subtitle_style) => update({ ...(value ?? {}), subtitle_style })}
            />
          </Collapsible>
        )}
        <Heading level={4}>{t('processingTitle')}</Heading>
        <Text as="p" type="body">
          {t('processingExplicit')}
        </Text>
        <CheckboxInput
          label={t('processingOcrOption')}
          value={Boolean(value?.ocr)}
          isDisabled={disabled || (hasSubtitles && !value?.ocr)}
          onChange={(enabled) =>
            update({
              ...(value ?? {}),
              ocr: enabled
                ? { language: selectedLanguage, sample_ms: 500, min_confidence: 0.5 }
                : undefined,
            })
          }
        />
        {hasSubtitles && (
          <Text as="p" type="body">
            {t('processingSubtitleConflict')}
          </Text>
        )}
        {ocr && value && (
          <>
            <Text as="p" type="body">
              {t('processingModelsHint')}
            </Text>
            <Selector
              label={t('visionLanguage')}
              value={selectedLanguage}
              isDisabled={disabled}
              options={(['en', 'vi', 'zh'] as const).map((language) => ({
                value: language,
                label: t(`visionLanguage_${language}`),
              }))}
              onChange={(language) => {
                if (language === 'en' || language === 'vi' || language === 'zh')
                  changeLanguage(language);
              }}
            />
            <Collapsible
              trigger={
                <Text type="body" weight="semibold">
                  {t('visionOcrOptions')}
                </Text>
              }
              defaultIsOpen={false}
            >
              <Grid columns={2} gap={3}>
                <NumberInput
                  label={t('visionSample')}
                  units="ms"
                  min={100}
                  max={2000}
                  step={100}
                  width="100%"
                  value={ocr.sample_ms}
                  isIntegerOnly
                  isWheelEnabled={false}
                  isDisabled={disabled}
                  onChange={(sample_ms) => update({ ...value, ocr: { ...ocr, sample_ms } })}
                />
                <NumberInput
                  label={t('visionConfidence')}
                  min={0}
                  max={1}
                  step={0.05}
                  width="100%"
                  value={ocr.min_confidence}
                  isWheelEnabled={false}
                  isDisabled={disabled}
                  onChange={(min_confidence) =>
                    update({ ...value, ocr: { ...ocr, min_confidence } })
                  }
                />
              </Grid>
            </Collapsible>
          </>
        )}
        {error && (
          <Banner status="error" title={t(processingErrorKey(error) ?? 'processingInvalid')} />
        )}
      </Stack>
    </Section>
  );
}
