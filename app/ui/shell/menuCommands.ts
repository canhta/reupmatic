// A tiny pub/sub so the native menu bar (built in the Electron main process,
// see app/electron/menu.ts) can trigger the exact same handler a feature
// component already wires to its own in-page button — never a second,
// parallel implementation of the action itself. Each feature registers its
// handler while mounted (workspaces stay mounted across area switches, see
// App.tsx's `hidden` panels) and unregisters on unmount; this module holds no
// business logic of its own.
export type MenuCommandId =
  | 'app.openJobs'
  // D-57: the app menu's Settings…/⌘,/Ctrl+, command now navigates the sidebar to the Settings
  // destination (via the event's own `area: 'settings'`, handled generically in App.tsx)
  // instead of opening a second BrowserWindow — this id needs no handler of its own, same as
  // any peer-area command with nothing extra to dispatch once the area switch lands.
  | 'app.openSettings'
  | 'editor.openProject'
  | 'editor.newProject'
  | 'editor.openRecent'
  | 'editor.openRecentItem'
  | 'editor.importMedia'
  | 'editor.saveProject'
  | 'editor.saveProjectAs'
  | 'editor.export'
  | 'editor.exportSubtitles'
  | 'editor.undo'
  | 'editor.redo'
  | 'sources.importLocalFile'
  | 'automation.newWorkflow'
  | 'automation.viewRunHistory'
  | 'channels.gotoPosts'
  | 'channels.newPost';

type Handler = (data?: unknown) => void;

const handlers = new Map<MenuCommandId, Handler>();

/** Registers `handler` for `id`, replacing the current one. Call the returned
 * cleanup on unmount so a later mount of the same command isn't dropped by a
 * stale unregister. */
export function registerMenuCommand(id: MenuCommandId, handler: Handler): () => void {
  handlers.set(id, handler);
  return () => {
    if (handlers.get(id) === handler) handlers.delete(id);
  };
}

/** Invokes the currently-registered handler for `id`, if any, with the command's opaque `data`
 * (only `editor.openRecentItem` uses it today — see menu.ts). Returns whether a handler was
 * found, so callers can no-op a menu item with nothing mounted to receive it (should not happen
 * once every peer area registers its commands, but keeps a missing registration from throwing). */
export function dispatchMenuCommand(id: MenuCommandId, data?: unknown): boolean {
  const handler = handlers.get(id);
  if (!handler) return false;
  handler(data);
  return true;
}
