export type MenuCommandId =
  | 'app.openJobs'
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

export function registerMenuCommand(id: MenuCommandId, handler: Handler): () => void {
  handlers.set(id, handler);
  return () => {
    if (handlers.get(id) === handler) handlers.delete(id);
  };
}

export function dispatchMenuCommand(id: MenuCommandId, data?: unknown): boolean {
  const handler = handlers.get(id);
  if (!handler) return false;
  handler(data);
  return true;
}
