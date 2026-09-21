type Level = 'error' | 'warn';

const MAX_MESSAGE = 500;

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
  // Fire and forget: a failed report must never recurse into the console capture below.
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

  const original = { warn: console.warn, error: console.error };
  const capture = (level: Level, event: string) =>
    function captured(this: unknown, ...args: unknown[]) {
      original[level === 'error' ? 'error' : 'warn'].apply(console, args);
      try {
        // Only the leading argument, capped: the record contract refuses an over-limit message.
        recordRendererDiagnostic(level, event, reason(args[0]).slice(0, MAX_MESSAGE));
      } catch {}
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
