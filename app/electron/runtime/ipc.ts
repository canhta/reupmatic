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

// Generic so a typo in `name` is a compile error and `handler`'s input is narrowed.
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
  // Getter over a set of trusted windows; undefined entries are filtered out.
  getWindows: () => readonly (BrowserWindow | undefined)[],
  isClosing: () => boolean = () => false,
  // Vite dev server origin under `npm run dev`; packaged builds only allow app://ui/.
  devServerOrigin?: string,
  // Boundary that decides error codes, so it records the failed request.
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
      // TS can't verify generic dispatch by runtime key; validate/handler are paired at wire() sites.
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
