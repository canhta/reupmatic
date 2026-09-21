/**
 * Renderer diagnostic capture (D-61). A blank screen used to be an evidence-free event: the
 * renderer had no error handler at all. Everything caught here goes to the host sink through
 * the one canonical operation, where it is redacted like every other producer's record.
 *
 * Only what a failure needs is sent — the message, the origin and, in Editor contexts, the open
 * Project. Never a stack's source text, never a caught value's body.
 */

type Level = 'error' | 'warn';

const MAX_MESSAGE = 500;

/**
 * The open Project, registered by the Editor the same way it registers its dirty state with the
 * shell's session lifecycle — so Editor failures stay separable from processing ones without
 * every reporting site having to thread an identifier through.
 */
let openProject: string | undefined;

export function setDiagnosticProject(project: string | undefined): void {
  openProject = project;
}

function reason(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`.slice(0, MAX_MESSAGE);
  if (typeof value === 'string') return value.slice(0, MAX_MESSAGE);
  return Object.prototype.toString.call(value);
}

export function recordRendererDiagnostic(
  level: Level,
  event: string,
  message: string,
  detail: Record<string, string | number | boolean | null> = {},
): void {
  // Fire and forget: a failed report must never become a second failure, and must never recurse
  // back into the console capture below.
  void window.reupmatic
    ?.recordDiagnostic({
      level,
      module: 'shell',
      event,
      message,
      detail,
      ...(openProject ? { correlation: { project: openProject } } : {}),
    })
    .catch(() => undefined);
}

/** Installs the global handlers. Returns the uninstall, so a test can restore the console. */
export function installRendererDiagnostics(): () => void {
  const onError = (event: ErrorEvent) => {
    recordRendererDiagnostic(
      'error',
      'renderer.uncaught-error',
      reason(event.error ?? event.message),
      { source: event.filename ?? '', line: event.lineno ?? 0 },
    );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordRendererDiagnostic('error', 'renderer.unhandled-rejection', reason(event.reason));
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  // The console is where React's own warnings and most third-party failures surface, so it is
  // captured rather than replaced: the original is always called, and a failure inside the
  // report is swallowed so the page's own logging never breaks.
  const original = { warn: console.warn, error: console.error };
  const capture = (level: Level, event: string) =>
    function captured(this: unknown, ...args: unknown[]) {
      original[level === 'error' ? 'error' : 'warn'].apply(console, args);
      try {
        // Only the leading argument, capped: the record contract refuses a message over its
        // limit, so an uncapped join silently dropped exactly the noisiest failures. Trailing
        // arguments are usually the data object, which has no business in the log anyway.
        recordRendererDiagnostic(level, event, reason(args[0]).slice(0, MAX_MESSAGE));
      } catch {
        // Never let reporting a console line become the failure.
      }
    };
  console.warn = capture('warn', 'renderer.console-warning');
  console.error = capture('error', 'renderer.console-error');

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    console.warn = original.warn;
    console.error = original.error;
  };
}
