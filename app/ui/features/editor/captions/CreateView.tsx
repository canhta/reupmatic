import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SpeechCreate } from '../../speech/SpeechGenerator';
import { TranslateCreate } from '../../speech/translation/TranslateGenerator';
import { ScreenCreate } from '../../vision/OcrExtractGenerator';
import { type GeneratorKind, useEditorGenerators } from '../EditorGeneratorContext';
import { SrtCreate } from './SrtCreate';

type Source = 'speech' | 'screen' | 'translate' | 'srt';

const DRAFT_SOURCE: Record<GeneratorKind, Source> = {
  speech: 'speech',
  ocr: 'screen',
  translate: 'translate',
};

export function CreateView({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const { review } = useEditorGenerators();
  const [source, setSource] = useState<Source>('speech');
  useEffect(() => {
    if (review) setSource(DRAFT_SOURCE[review]);
  }, [review]);
  const labels: Record<Source, string> = {
    speech: t('captionSourceSpeech'),
    screen: t('captionSourceScreen'),
    translate: t('captionSourceTranslate'),
    srt: t('captionSourceSrt'),
  };
  return (
    <VStack gap={4}>
      {isActive && (
        <SegmentedControl
          label={t('captionSource')}
          value={source}
          size="sm"
          layout="fill"
          onChange={(next) => {
            if (next in labels) setSource(next as Source);
          }}
        >
          {(Object.keys(labels) as Source[]).map((value) => (
            <SegmentedControlItem key={value} value={value} label={labels[value]} />
          ))}
        </SegmentedControl>
      )}
      {/* Every source stays mounted so its options survive a switch; only the active one renders. */}
      <SpeechCreate isActive={isActive && source === 'speech'} />
      <ScreenCreate isActive={isActive && source === 'screen'} />
      <TranslateCreate isActive={isActive && source === 'translate'} />
      <SrtCreate isActive={isActive && source === 'srt'} />
    </VStack>
  );
}
