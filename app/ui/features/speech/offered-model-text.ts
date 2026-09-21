import type { ModelTask, OfferedModel } from '../../../core/speech/model-catalogue';
import { isUiLocale } from '../../../core/ui-locale';
import type { MessageKey } from '../../locales/message-key';

/** The reader's own interface language, not the languages the model recognises. i18next may
 * report a regional tag ("vi-VN"), so the base subtag is what selects the text. */
export function purposeFor(model: OfferedModel, language: string): string {
  const base = language.split('-')[0];
  return model.purpose[isUiLocale(base) ? base : 'en'];
}

/** What the model is for, so a transcription model is never installed expecting it to speak. */
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
