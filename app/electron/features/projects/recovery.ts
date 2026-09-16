import { authorizeSnapshot, restoreProjectSnapshot } from './dependencies.js';
import { dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createProject } from '../../../core/projects/project.js';
import { RecoveryStore } from '../../../core/projects/recovery/recovery-store.js';
import { requestId, requestRecord, requestRevision, type IpcWire } from '../../runtime/ipc.js';
import { MediaRegistry, videoFilters } from '../media/registry.js';

interface Host {
  wire: IpcWire;
  workspace: string;
  getWindow(): BrowserWindow;
  media: MediaRegistry;
  getLanguage?(): string;
}

export function installRecovery(host: Host) {
  let store: RecoveryStore | undefined;
  let fault: Error | undefined;
  try { store = new RecoveryStore(path.join(host.workspace, 'editor-recovery.sqlite')); }
  catch (error) { fault = error instanceof Error ? error : new Error('RECOVERY_UNAVAILABLE'); }
  function ready(): RecoveryStore {
    if (!store) throw fault ?? new Error('RECOVERY_UNAVAILABLE');
    return store;
  }
  host.wire('recovery-list', () => ready().list());
  host.wire('recovery-save', input => {
    const value = requestRecord(input, ['id', 'expected_revision', 'asset_id', 'snapshot']);
    const source = host.media.getVideo(value.asset_id);
    const project = createProject({ path: source.path, sha256: source.sha256 }, value.snapshot);
    authorizeSnapshot(host.media, source, project);
    return ready().save(requestId(value.id), requestRevision(value.expected_revision), project);
  });
  host.wire('recovery-open', async input => {
    const value = requestRecord(input, ['id', 'expected_revision']);
    const id = requestId(value.id), revision = requestRevision(value.expected_revision);
    const project = ready().load(id, revision);
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'], filters: videoFilters,
      defaultPath: path.isAbsolute(project.source.path) && !project.source.path.startsWith('\\\\')
        ? project.source.path : undefined,
    });
    if (chosen.canceled) return null;
    const source = await host.media.registerVideo(chosen.filePaths[0]);
    const snapshot = await restoreProjectSnapshot(host.media, host.getWindow(), project, source, host.getLanguage?.());
    ready().load(id, revision);
    return snapshot ? { media: host.media.publicVideo(source), snapshot } : null;
  });
  host.wire('recovery-discard', input => {
    const value = requestRecord(input, ['id', 'expected_revision']);
    ready().discard(requestId(value.id), requestRevision(value.expected_revision));
    return { removed: true };
  });

  let pending: { id: string; finish(ok: boolean): void } | undefined;
  host.wire('recovery-flush-result', input => {
    const value = requestRecord(input, ['request_id', 'saved']);
    if (!pending || value.request_id !== pending.id || typeof value.saved !== 'boolean') throw new Error('INVALID_RECOVERY');
    pending.finish(value.saved);
    return { accepted: true };
  });
  return {
    flush(): Promise<boolean> {
      if (pending) return Promise.resolve(false);
      return new Promise(resolve => {
        const id = randomUUID();
        const finish = (ok: boolean) => { clearTimeout(timer); pending = undefined; resolve(ok); };
        const timer = setTimeout(() => finish(false), 8000);
        pending = { id, finish };
        host.getWindow().webContents.send('reupmatic:recovery-flush', { request_id: id });
      });
    },
    close() { pending?.finish(false); store?.close(); },
  };
}
