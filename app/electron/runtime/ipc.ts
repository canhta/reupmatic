import { ipcMain, type BrowserWindow } from 'electron';

export type IpcWire = (name: string, handler: (input: unknown) => unknown | Promise<unknown>) => void;

export function errorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string'
    && /^[A-Z_]+$/.test(error.code)) return error.code;
  return error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'WORKER_FAILURE';
}

export function requestRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

export function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) throw new Error('INVALID_REQUEST');
  return value;
}

export function requestRevision(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 2 ** 31 - 1) {
    throw new Error('INVALID_REQUEST');
  }
  return Number(value);
}

export function createIpcWire(
  getWindow: () => BrowserWindow | undefined,
  isClosing: () => boolean = () => false,
): IpcWire & { drain(): Promise<void> } {
  const pending = new Set<Promise<unknown>>();
  const wire: IpcWire = (name, handler) => {
    ipcMain.handle(`reupmatic:${name}`, async (event, input: unknown) => {
      const window = getWindow();
      if (!window || window.isDestroyed() || event.sender !== window.webContents
        || event.senderFrame !== window.webContents.mainFrame
        || !event.senderFrame?.url.startsWith('app://ui/')) {
        return { ok: false, error: 'FORBIDDEN' };
      }
      if (isClosing()) return { ok: false, error: 'APP_CLOSING' };
      const result = Promise.resolve().then(() => handler(input));
      pending.add(result);
      try { return { ok: true, data: await result }; }
      catch (error) { return { ok: false, error: errorCode(error) }; }
      finally { pending.delete(result); }
    });
  };
  return Object.assign(wire, {
    async drain() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
  });
}
