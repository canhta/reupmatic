import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { StackItem } from '@astryxdesign/core/Stack';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import {
  type ProcessingLanguage,
  type ProcessingRecipe,
  parseProcessingRecipe,
} from '../../../core/processing/recipe';
import {
  PanelRows,
  PanelSection,
  PanelSections,
  PanelToggleProvider,
  SliderRow,
} from '../../design-system/Panel';
import { SubtitleStyleForm } from '../editor/subtitle-styles/SubtitleStyleForm';
import { EditingOptions } from './EditingOptions';
import { processingErrorKey } from './message-key';

const OCR_LANGUAGES = ['en', 'vi', 'zh'] as const;

interface Props {
  value?: ProcessingRecipe;
  disabled: boolean;
  hasSubtitles?: boolean;
  showSubtitleStyle?: boolean;
  onChange(value: ProcessingRecipe | undefined): void;
}

// A recipe applies on the next run, so every on/off here is a CheckboxInput.
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
      <PanelToggleProvider value={CheckboxInput}>
        <VStack gap={3}>
          <HStack gap={1} vAlign="center">
            <StackItem size="fill">
              <Heading level={4}>{t('processingTitle')}</Heading>
            </StackItem>
            <MoreMenu
              label={t('processingActions')}
              size="sm"
              alignment="end"
              isDisabled={disabled}
              items={[
                {
                  label: t('editReset'),
                  isDisabled: !value?.editing,
                  onClick: () => update({ ...(value ?? {}), editing: undefined }),
                },
                ...(showSubtitleStyle
                  ? [
                      {
                        label: t('processingResetStyle'),
                        isDisabled: !value?.subtitle_style,
                        onClick: () => update({ ...(value ?? {}), subtitle_style: undefined }),
                      },
                    ]
                  : []),
              ]}
            />
          </HStack>
          <PanelSections>
            <EditingOptions
              value={value?.editing}
              disabled={disabled}
              onChange={(editing) => update({ ...(value ?? {}), editing })}
            />
            <PanelSection
              title={t('processingOcrTitle')}
              isOn={Boolean(ocr)}
              isDisabled={disabled || (hasSubtitles && !ocr)}
              status={
                hasSubtitles ? { tone: 'warning', text: t('processingSubtitleConflict') } : null
              }
              onToggle={(enabled) =>
                update({
                  ...(value ?? {}),
                  ocr: enabled
                    ? { language: selectedLanguage, sample_ms: 500, min_confidence: 0.5 }
                    : undefined,
                })
              }
            >
              {ocr && value && (
                <PanelRows>
                  <Selector
                    label={t('visionLanguage')}
                    value={selectedLanguage}
                    isDisabled={disabled}
                    options={OCR_LANGUAGES.map((language) => ({
                      value: language,
                      label: t(`visionLanguage_${language}`),
                    }))}
                    onChange={(language) => {
                      if (language === 'en' || language === 'vi' || language === 'zh')
                        changeLanguage(language);
                    }}
                  />
                  <NumberInput
                    label={t('visionSample')}
                    units="s"
                    min={0.1}
                    max={2}
                    step={0.1}
                    value={ocr.sample_ms / 1000}
                    isWheelEnabled={false}
                    isDisabled={disabled}
                    onChange={(seconds) =>
                      update({ ...value, ocr: { ...ocr, sample_ms: Math.round(seconds * 1000) } })
                    }
                  />
                  <SliderRow
                    label={t('visionConfidence')}
                    units="%"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(ocr.min_confidence * 100)}
                    isDisabled={disabled}
                    onChange={(percent) =>
                      update({ ...value, ocr: { ...ocr, min_confidence: percent / 100 } })
                    }
                  />
                </PanelRows>
              )}
            </PanelSection>
            {showSubtitleStyle && (
              <SubtitleStyleForm
                value={value?.subtitle_style}
                disabled={disabled}
                onChange={(subtitle_style) => update({ ...(value ?? {}), subtitle_style })}
              />
            )}
          </PanelSections>
          {error && (
            <Banner status="error" title={t(processingErrorKey(error) ?? 'processingInvalid')} />
          )}
        </VStack>
      </PanelToggleProvider>
    </Section>
  );
}
