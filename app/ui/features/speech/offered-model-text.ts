import type { ModelTask, OfferedModel } from '../../../core/speech/model-catalogue';
import { isUiLocale } from '../../../core/ui-locale';
import type { MessageKey } from '../../locales/message-key';

export function purposeFor(model: OfferedModel, language: string): string {
  const base = language.split('-')[0];
  return model.purpose[isUiLocale(base) ? base : 'en'];
}

const TASK_KEYS: Record<ModelTask, MessageKey> = {
  recognition: 'settingsOfferedTaskRecognition',
  synthesis: 'settingsOfferedTaskSynthesis',
  translation: 'settingsOfferedTaskTranslation',
  vision: 'settingsOfferedTaskVision',
};

export function taskKey(task: ModelTask): MessageKey {
  return TASK_KEYS[task];
}

export function phaseKey(phase: string): MessageKey {
  if (phase === 'runtime-pack') return 'settingsOfferedPreparingRuntime';
  if (phase === 'verifying') return 'settingsOfferedVerifying';
  if (phase === 'installing') return 'settingsOfferedInstalling';
  return 'settingsOfferedDownloading';
}

export function formatBytes(value: number, language: string): string {
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  if (value >= 1024 ** 3) return `${number.format(value / 1024 ** 3)} GB`;
  if (value >= 1024 ** 2) return `${number.format(value / 1024 ** 2)} MB`;
  if (value >= 1024) return `${number.format(value / 1024)} KB`;
  return `${number.format(value)} B`;
}
