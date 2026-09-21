import type { SpeechEngineStatus, SpeechLanguage, SpeechStatus } from './recognition.js';

/** Every engine architecture the worker can run locally today (D-55: an
 * architecture is code, a bundle pointed at it is configuration). A hosted
 * engine is anything not in this set. */
const LOCAL_SPEECH_ENGINES = new Set<string>(['faster-whisper', 'qwen3-asr']);

/**
 * The one place in the core that filters the worker's reported engine list
 * down to what the UI may offer for a job. This is the single seam a real
 * entitlement check is inserted into later — it is not that check.
 *
 * Today: a local engine is offered whenever the worker itself reports it
 * available; a hosted engine additionally needs a configured provider
 * holding a credential, via `hasCredential` — the caller builds this from
 * `speech-providers-list`'s `has_credential` flags (never the credential
 * itself; see `app/electron/features/speech/provider-store.ts`). This never
 * promotes an engine the worker reported as unavailable, and it invents no
 * tier, plan, credit or price rule: BYOK and BYO-model engines are not
 * tier-gated (D-55), and Q-05 stays unresolved.
 */
export function presentableSpeechEngines(
  status: SpeechStatus,
  hasCredential: (engine: string) => boolean = () => false,
): SpeechEngineStatus[] {
  return status.engines.filter((entry) => {
    if (!entry.available) return false;
    return LOCAL_SPEECH_ENGINES.has(entry.engine) || hasCredential(entry.engine);
  });
}

/**
 * The list a recognition job's engine picker (ticket 05) actually offers: every entry
 * `presentableSpeechEngines` already returns, narrowed to the one language the job declared.
 * Not a second capability decision — it composes the one seam above and only ever removes
 * entries from what it already offered, by a criterion (language) that seam does not itself
 * apply. Zero entries means the dialog shows no engine control at all; one means it names that
 * engine without asking the user to choose; more than one means an actual picker.
 */
export function offeredSpeechEngines(
  status: SpeechStatus,
  language: SpeechLanguage,
  hasCredential: (engine: string) => boolean = () => false,
): SpeechEngineStatus[] {
  return presentableSpeechEngines(status, hasCredential).filter((entry) =>
    entry.languages.includes(language),
  );
}

/**
 * The one failure code to show when a job cannot run. An engine reporting its own failure wins,
 * because fixing setup is the more actionable message; otherwise, engines that work but none of
 * which serves the chosen language is a *language* problem, not a missing model — sending the
 * user to set up something they already have is the wrong instruction.
 *
 * Lives beside the seam it questions so it is asserted at the core boundary rather than only
 * through the dialog that renders it.
 */
export function speechProblemCode(
  status: SpeechStatus | null,
  language: SpeechLanguage | null,
  hasCredential: (engine: string) => boolean = () => false,
): string {
  if (!status || status.engines.length === 0) return 'MODEL_MISSING';
  // An engine the user *configured* but that still fails (its runtime is missing, say) is the
  // more actionable message than an unconfigured engine's plain MODEL_MISSING. Picking the first
  // failing entry in registry order reported "no model configured" while a configured model was
  // sitting there unable to run.
  const failing =
    status.engines.find((entry) => entry.code && entry.model_id) ??
    status.engines.find((entry) => entry.code);
  if (failing?.code) return failing.code;
  if (language && presentableSpeechEngines(status, hasCredential).length) {
    return 'MODEL_LANGUAGE_UNAVAILABLE';
  }
  return 'MODEL_MISSING';
}

/**
 * The synthesis architectures that can be asked to synthesize a line to a target duration. The
 * voice timing plan consults this instead of assuming: an architecture present here owns the fit
 * and yields a unity rate factor, one absent yields a host-side factor. It mirrors the
 * `targets_duration` flag of the worker's own `speech.synthesis.models.ENGINES` registry, which
 * is why both are updated in the same change that adds an engine. `vieneu-v3-turbo-onnx` runs at
 * its natural rate; `vieneu-v3-nano-onnx` takes a target per line. This set is code, never
 * runtime configuration (D-53), and it is the only engine fact a screen above the adapter reads.
 */
const DURATION_TARGETING_ENGINES: ReadonlySet<string> = new Set<string>(['vieneu-v3-nano-onnx']);

/** Whether an engine can be given a target duration per line. Unknown engines cannot. */
export function engineTargetsDuration(engine: string): boolean {
  return DURATION_TARGETING_ENGINES.has(engine);
}
