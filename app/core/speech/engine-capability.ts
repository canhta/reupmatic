import type { SpeechEngineStatus, SpeechLanguage, SpeechStatus } from './recognition.js';

const LOCAL_SPEECH_ENGINES = new Set<string>(['faster-whisper']);

export function presentableSpeechEngines(
  status: SpeechStatus,
  hasCredential: (engine: string) => boolean = () => false,
): SpeechEngineStatus[] {
  return status.engines.filter((entry) => {
    if (!entry.available) return false;
    return LOCAL_SPEECH_ENGINES.has(entry.engine) || hasCredential(entry.engine);
  });
}

export function offeredSpeechEngines(
  status: SpeechStatus,
  language: SpeechLanguage,
  hasCredential: (engine: string) => boolean = () => false,
): SpeechEngineStatus[] {
  return presentableSpeechEngines(status, hasCredential).filter((entry) =>
    entry.languages.includes(language),
  );
}

// A configured-but-failing engine's code wins over a plain MODEL_MISSING.
export function speechProblemCode(
  status: SpeechStatus | null,
  language: SpeechLanguage | null,
  hasCredential: (engine: string) => boolean = () => false,
): string {
  if (!status || status.engines.length === 0) return 'MODEL_MISSING';
  const failing =
    status.engines.find((entry) => entry.code && entry.model_id) ??
    status.engines.find((entry) => entry.code);
  if (failing?.code) return failing.code;
  if (language && presentableSpeechEngines(status, hasCredential).length) {
    return 'MODEL_LANGUAGE_UNAVAILABLE';
  }
  return 'MODEL_MISSING';
}

// Must stay in sync with the worker's targets_duration flag.
const DURATION_TARGETING_ENGINES: ReadonlySet<string> = new Set<string>(['vieneu-v3-nano-onnx']);

export function engineTargetsDuration(engine: string): boolean {
  return DURATION_TARGETING_ENGINES.has(engine);
}
