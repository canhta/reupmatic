import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Heading } from '@astryxdesign/core/Heading';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
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
import { MaskRegionFields } from './MaskRegionFields';
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
  const inpaint = value?.inpaint;
  const selectedLanguage =
    value?.ocr?.language ?? (value?.inpaint?.target === 'text' ? value.inpaint.language : 'en');
  let error = '';
  try {
    if (value) parseProcessingRecipe(value, hasSubtitles);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : 'INVALID_PROCESSING';
  }

  function update(next: ProcessingRecipe) {
    const { ocr, inpaint, editing, subtitle_style } = next;
    onChange(
      ocr || inpaint || editing || subtitle_style
        ? {
            ...(ocr ? { ocr } : {}),
            ...(inpaint ? { inpaint } : {}),
            ...(editing ? { editing } : {}),
            ...(subtitle_style ? { subtitle_style } : {}),
          }
        : undefined,
    );
  }
  function changeLanguage(language: ProcessingLanguage) {
    update({
      ...(value ?? {}),
      ...(value?.ocr ? { ocr: { ...value.ocr, language } } : {}),
      ...(value?.inpaint?.target === 'text' ? { inpaint: { ...value.inpaint, language } } : {}),
    });
  }

  return (
    <Section
      variant="transparent"
      padding={0}
      className="processing-options"
      aria-label={t('processingTitle')}
    >
      {}
      <Stack direction="vertical" gap={3}>
        <EditingOptions
          value={value?.editing}
          disabled={disabled}
          onChange={(editing) => update({ ...(value ?? {}), editing })}
        />
        {showSubtitleStyle && (
          <Collapsible
            trigger={
              <Text type="label" weight="semibold">
                {t('styleTitle')}
              </Text>
            }
            defaultIsOpen={false}
          >
            <SubtitleStyleForm
              value={value?.subtitle_style}
              disabled={disabled}
              onChange={(subtitle_style) => update({ ...(value ?? {}), subtitle_style })}
            />
          </Collapsible>
        )}
        <Heading level={5}>{t('processingTitle')}</Heading>
        <Text as="p" type="supporting">
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
          <Text as="p" type="supporting">
            {t('processingSubtitleConflict')}
          </Text>
        )}
        <CheckboxInput
          label={t('processingInpaintOption')}
          value={Boolean(value?.inpaint)}
          isDisabled={disabled}
          onChange={(enabled) =>
            update({
              ...(value ?? {}),
              inpaint: enabled
                ? { target: 'text', language: selectedLanguage, padding_px: 4 }
                : undefined,
            })
          }
        />
        {(value?.ocr || value?.inpaint) && value && (
          <>
            <Text as="p" type="body">
              {t('processingModelsHint')}
            </Text>
            {(value.ocr || value.inpaint?.target === 'text') && (
              <Selector
                label={t('visionLanguage')}
                value={selectedLanguage}
                isDisabled={disabled}
                width={240}
                options={(['en', 'vi', 'zh'] as const).map((language) => ({
                  value: language,
                  label: t(`visionLanguage_${language}`),
                }))}
                onChange={(language) => {
                  if (language === 'en' || language === 'vi' || language === 'zh')
                    changeLanguage(language);
                }}
              />
            )}
            {ocr && (
              <Collapsible
                trigger={
                  <Text type="label" weight="semibold">
                    {t('visionOcrOptions')}
                  </Text>
                }
                defaultIsOpen={false}
              >
                <div className="vision-fields">
                  <NumberInput
                    label={t('visionSample')}
                    min={100}
                    max={2000}
                    step={100}
                    width={220}
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
                    width={220}
                    value={ocr.min_confidence}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(min_confidence) =>
                      update({ ...value, ocr: { ...ocr, min_confidence } })
                    }
                  />
                </div>
              </Collapsible>
            )}
            {inpaint && (
              <>
                <RadioList
                  label={t('visionTarget')}
                  value={inpaint.target}
                  isDisabled={disabled}
                  onChange={(target) => {
                    const padding_px = inpaint.padding_px;
                    if (target === 'text')
                      update({
                        ...value,
                        inpaint: { target, padding_px, language: selectedLanguage },
                      });
                    if (target === 'manual')
                      update({
                        ...value,
                        inpaint: {
                          target,
                          padding_px,
                          region: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
                        },
                      });
                  }}
                >
                  <RadioListItem
                    value="text"
                    label={t('visionAuto')}
                    description={t('visionAutoNote')}
                  />
                  <RadioListItem value="manual" label={t('visionManual')} />
                </RadioList>
                {inpaint.target === 'manual' && (
                  <MaskRegionFields
                    value={inpaint.region}
                    disabled={disabled}
                    onChange={(region) =>
                      update({
                        ...value,
                        inpaint: { target: 'manual', padding_px: inpaint.padding_px, region },
                      })
                    }
                  />
                )}
                <NumberInput
                  label={t('visionPadding')}
                  min={0}
                  max={32}
                  step={1}
                  width={180}
                  value={inpaint.padding_px}
                  isIntegerOnly
                  isWheelEnabled={false}
                  isDisabled={disabled}
                  onChange={(padding_px) =>
                    update({ ...value, inpaint: { ...inpaint, padding_px } })
                  }
                />
              </>
            )}
          </>
        )}
        {error && (
          <Banner status="error" title={t(processingErrorKey(error) ?? 'processingInvalid')} />
        )}
      </Stack>
    </Section>
  );
}
