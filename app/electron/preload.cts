import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { events } from '../core/host-bridge/events.js';
import { operations } from '../core/host-bridge/operations.js';

const invoke = (name: string, input?: unknown) => ipcRenderer.invoke(`reupmatic:${name}`, input);
function subscribe(channel: string, callback: (data: unknown) => void) {
  const listener = (_event: unknown, data: unknown) => callback(data);
  ipcRenderer.on(`reupmatic:${channel}`, listener);
  return () => ipcRenderer.removeListener(`reupmatic:${channel}`, listener);
}

// Only the canonical operations and events cross this boundary; `invoke`/`subscribe` are not
// themselves exposed, and every renderer method name/shape comes from the shared registries in
// `app/core/host-bridge/` rather than being hand-mirrored here.
const exposed: Record<string, unknown> = {};
for (const [name, entry] of Object.entries(operations)) {
  exposed[entry.rendererMethod] = entry.toRequest
    ? (...args: unknown[]) =>
        invoke(name, (entry.toRequest as (...a: unknown[]) => unknown)(...args))
    : (input?: unknown) => invoke(name, input);
}
for (const [name, entry] of Object.entries(events)) {
  exposed[entry.rendererMethod] = (callback: (data: unknown) => void) => subscribe(name, callback);
}
// Not a wire operation: `webUtils.getPathForFile` resolves a dropped `File` straight to its real
// filesystem path, synchronously, inside the sandboxed preload — the only place that API is
// available. The path then goes through `openVideoPath` like any other untrusted request.
exposed.getPathForFile = (file: File) => webUtils.getPathForFile(file);
contextBridge.exposeInMainWorld('reupmatic', exposed);
