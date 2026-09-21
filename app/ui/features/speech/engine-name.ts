/**
 * The engine's own name from a runtime fingerprint
 * ("faster-whisper@1.2.1;ctranslate2@4.8.2" → "faster-whisper"). The full
 * fingerprint stays in the result's `runtime` and in the Diagnostic log; UI
 * copy shows only the engine a user recognises, never the raw build string.
 */
export function engineName(runtime: string): string {
  const first = runtime.split(';')[0] ?? runtime;
  const at = first.indexOf('@');
  return at > 0 ? first.slice(0, at) : first;
}
