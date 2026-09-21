import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { type BrowserWindow, dialog } from 'electron';
import { createProject } from '../../../core/projects/project.js';
import { ProjectRecovery } from '../../../core/projects/recovery/project-recovery.js';
import type { IpcWire } from '../../runtime/ipc.js';
import { type MediaRegistry, videoFilters } from '../media/registry.js';
import { authorizeSnapshot, restoreProjectSnapshot } from './dependencies.js';

interface Host {
  wire: IpcWire;
  workspace: string;
  getWindow(): BrowserWindow;
  media: MediaRegistry;
  getLanguage?(): string;
}

export function installRecovery(host: Host) {
  let recovery: ProjectRecovery | undefined;
  let fault: Error | undefined;
  try {
    recovery = new ProjectRecovery(path.join(host.workspace, 'editor-recovery.sqlite'));
  } catch (error) {
    fault = error instanceof Error ? error : new Error('RECOVERY_UNAVAILABLE');
  }
  function ready(): ProjectRecovery {
    if (!recovery) throw fault ?? new Error('RECOVERY_UNAVAILABLE');
    return recovery;
  }
  host.wire('recovery-list', () => ready().list());
  host.wire('recovery-save', (input) => {
    const source = host.media.getVideo(input.asset_id);
    const project = createProject({ path: source.path, sha256: source.sha256 }, input.snapshot);
    authorizeSnapshot(host.media, source, project);
    return ready().save(input.id, input.expected_revision, project);
  });
  host.wire('recovery-open', async (input) => {
    const { id, expected_revision: revision } = input;
    const project = ready().load(id, revision);
    // The normal recovery list keeps its copy to one sentence; the "must be
    // the same original video" detail belongs here, at the moment it matters.
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      title:
        host.getLanguage?.() === 'vi'
          ? 'Chọn đúng video gốc'
          : 'Choose the matching original video',
      properties: ['openFile'],
      filters: videoFilters,
      defaultPath:
        path.isAbsolute(project.source.path) && !project.source.path.startsWith('\\\\')
          ? project.source.path
          : undefined,
    });
    if (chosen.canceled) return null;
    const source = await host.media.registerVideo(chosen.filePaths[0]);
    const snapshot = await restoreProjectSnapshot(
      host.media,
      host.getWindow(),
      project,
      source,
      host.getLanguage?.(),
    );
    ready().load(id, revision);
    return snapshot ? { media: host.media.publicVideo(source), snapshot } : null;
  });
  host.wire('recovery-discard', (input) => {
    ready().discard(input.id, input.expected_revision);
    return { removed: true };
  });

  let pending: { id: string; finish(ok: boolean): void } | undefined;
  host.wire('recovery-flush-result', (input) => {
    if (!pending || input.request_id !== pending.id) throw new Error('INVALID_RECOVERY');
    pending.finish(input.saved);
    return { accepted: true };
  });
  return {
    flush(): Promise<boolean> {
      if (pending) return Promise.resolve(false);
      return new Promise((resolve) => {
        const id = randomUUID();
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          pending = undefined;
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false), 8000);
        pending = { id, finish };
        host.getWindow().webContents.send('reupmatic:recovery-flush', { request_id: id });
      });
    },
    close() {
      pending?.finish(false);
      recovery?.close();
    },
  };
}
