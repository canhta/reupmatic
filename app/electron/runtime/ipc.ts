import { type BrowserWindow, ipcMain } from 'electron';
import type { DiagnosticRecorder } from '../../core/diagnostics/recorder.js';
import {
  type OperationName,
  type OperationRequest,
  type OperationResult,
  operations,
} from '../../core/host-bridge/operations.js';

export type {
  OperationName,
  OperationRequest,
  OperationResult,
  Reply,
} from '../../core/host-bridge/operations.js';
export { requestId, requestRecord, requestRevision } from '../../core/host-bridge/validators.js';

// Generic so a typo in `name` is a compile error and `handler` receives the input already
// narrowed by that operation's canonical `validate`.
export type IpcWire = <K extends OperationName>(
  name: K,
  handler: (input: OperationRequest<K>) => OperationResult<K> | Promise<OperationResult<K>>,
) => void;

export function errorCode(error: unknown): string {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z_]+$/.test(error.code)
  )
    return error.code;
  return error instanceof Error && /^[A-Z_]+$/.test(error.message)
    ? error.message
    : 'WORKER_FAILURE';
}

export function createIpcWire(
  // A getter over a *set* of currently trusted windows, not one, so a future window that shares
  // this same preload/bridge (main.ts creates exactly one today — D-57 removed the independent
  // Settings window) stays legitimate without widening this function's own contract. Include
  // `undefined` for a window that may not exist yet/anymore; this function filters those out
  // itself.
  getWindows: () => readonly (BrowserWindow | undefined)[],
  isClosing: () => boolean = () => false,
  // Set to the Vite dev server origin (e.g. "http://localhost:5173") under `npm run dev`, per
  // scripts/dev.mjs and main.ts's own devServerOrigin. The packaged app never passes this, so
  // only the app://ui/ origin is ever allowed there.
  devServerOrigin?: string,
  // D-61: this is the boundary that decides a failed request's error code, so it is where the
  // obligation to leave a record for that code is met — not at every throwing handler.
  diagnostics?: DiagnosticRecorder,
): IpcWire & { drain(): Promise<void> } {
  const pending = new Set<Promise<unknown>>();
  const wire: IpcWire = (name, handler) => {
    const { validate } = operations[name];
    ipcMain.handle(`reupmatic:${name}`, async (event, input: unknown) => {
      const windows = getWindows().filter(
        (candidate): candidate is BrowserWindow =>
          candidate !== undefined && !candidate.isDestroyed(),
      );
      const frameUrl = event.senderFrame?.url;
      const fromAllowedOrigin =
        typeof frameUrl === 'string' &&
        (frameUrl.startsWith('app://ui/') ||
          (devServerOrigin !== undefined && frameUrl.startsWith(`${devServerOrigin}/`)));
      const fromKnownWindow = windows.some(
        (window) =>
          event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame,
      );
      if (!fromKnownWindow || !fromAllowedOrigin) {
        return { ok: false, error: 'FORBIDDEN' };
      }
      if (isClosing()) return { ok: false, error: 'APP_CLOSING' };
      // TS can't verify a generic dispatch by runtime key against the union of every operation's
      // own `TReq`; `validate`/`handler` are already paired by `name` at every `wire()` call site,
      // which is where the real type safety this generic signature buys actually applies.
      const result = Promise.resolve().then(() =>
        handler(validate(input) as OperationRequest<typeof name>),
      );
      pending.add(result);
      try {
        return { ok: true, data: await result };
      } catch (error) {
        const code = errorCode(error);
        diagnostics?.record({
          level: 'error',
          source: { process: 'main', module: 'host-bridge' },
          event: 'ipc.request-failed',
          code,
          message: error instanceof Error ? error.message : undefined,
          detail: { operation: name },
        });
        return { ok: false, error: code };
      } finally {
        pending.delete(result);
      }
    });
  };
  return Object.assign(wire, {
    async drain() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
  });
}
