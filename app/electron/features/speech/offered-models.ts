import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import {
  type ActiveInstall,
  type CatalogueModel,
  type ModelTask,
  type OfferedCatalogue,
  readCatalogue,
} from '../../../core/speech/model-catalogue.js';
import {
  discardStaleDownloads,
  type InstallOptions,
  type InstallResult,
  installOfferedModel,
  manifestPath,
} from '../../../core/speech/model-installer.js';
import { RemoteError } from '../../../core/worker/remote-error.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';

interface Host {
  worker: WorkerClient;
  workspace: string;
  cataloguePaths: readonly string[];
  installEvent: (message: unknown) => void;
  modelsChanged: (task: ModelTask) => void;
  errorCode: (error: unknown) => string;
  /** Injectable so tests can drive an install without moving real bytes. */
  install?: (options: InstallOptions) => Promise<InstallResult>;
}

type InstallEventBody =
  | { event: 'progress'; data: { phase: string; fraction: number | null } }
  | { event: 'result'; data: { catalogue_id: string } }
  | { event: 'error'; data: { code: string } };

const CONFIGURE_BY_TASK = {
  recognition: 'speech.configure',
  synthesis: 'synthesis.configure',
  translation: 'translation.configure',
  // Vision entries share one store, so install/activation merges instead of replacing.
  vision: 'models.merge',
} as const satisfies Record<ModelTask, string>;

const UNCONFIGURE_BY_TASK = {
  recognition: 'speech.unconfigure',
  synthesis: 'synthesis.unconfigure',
  translation: 'translation.unconfigure',
  vision: 'models.unconfigure',
} as const satisfies Record<ModelTask, string>;

/** The offered-model catalogue and its explicit install lifecycle. */
export function installOfferedModels(host: Host) {
  const bundleRoot = path.join(host.workspace, 'speech-models');
  const active = new Map<string, AbortController>();
  const install = host.install ?? installOfferedModel;
  let running: ActiveInstall | null = null;
  let closing = false;

  // A host that died mid-transfer can't clean up; do it once here.
  void discardStaleDownloads(bundleRoot).catch(() => undefined);

  function emit(id: string, event: InstallEventBody): void {
    if (event.event === 'progress' && running?.request_id === id) {
      running = { ...running, phase: event.data.phase, fraction: event.data.fraction };
    }
    host.installEvent({ id, ...event });
  }

  /** Remove directory and manifest together so a partial install never looks configured. */
  async function removeInstalled(installed: InstallResult): Promise<void> {
    await Promise.allSettled([
      rm(installed.directory, { recursive: true, force: true }),
      rm(installed.manifest_path, { force: true }),
    ]);
  }

  async function list(): Promise<OfferedCatalogue> {
    const { models, refused } = await readCatalogue(host.cataloguePaths);
    return {
      models: models.map((model) => ({
        ...model,
        installed: existsSync(manifestPath(bundleRoot, model.id)),
      })),
      refused,
      active: running,
    };
  }

  async function run(id: string, model: CatalogueModel, signal: AbortSignal): Promise<void> {
    try {
      const installed = await install({
        model,
        bundleRoot,
        signal,
        onProgress: (progress) => emit(id, { event: 'progress', data: progress }),
      });
      if (closing) {
        await removeInstalled(installed);
        throw new RemoteError('APP_CLOSING');
      }
      try {
        await host.worker.request(CONFIGURE_BY_TASK[model.task], {
          path: installed.manifest_path,
        }).result;
      } catch (error) {
        await removeInstalled(installed);
        throw error;
      }
      host.modelsChanged(model.task);
      emit(id, { event: 'result', data: { catalogue_id: model.id } });
    } catch (error) {
      const code = signal.aborted || closing ? 'CANCELLED' : host.errorCode(error);
      emit(id, { event: 'error', data: { code } });
    } finally {
      active.delete(id);
      if (running?.request_id === id) running = null;
    }
  }

  async function start(input: { catalogue_id: string }): Promise<{ request_id: string }> {
    if (closing) throw new RemoteError('APP_CLOSING');
    if (active.size) throw new RemoteError('QUEUE_FULL');
    const { models } = await readCatalogue(host.cataloguePaths);
    const model = models.find((entry) => entry.id === input.catalogue_id);
    if (!model) throw new RemoteError('MODEL_NOT_OFFERED');
    const request_id = randomUUID();
    const controller = new AbortController();
    active.set(request_id, controller);
    running = {
      request_id,
      catalogue_id: model.id,
      phase: 'downloading',
      fraction: 0,
    };
    void run(request_id, model, controller.signal);
    return { request_id };
  }

  async function cancel(request_id: string): Promise<{ requested: boolean }> {
    const controller = active.get(request_id);
    if (!controller) return { requested: false };
    controller.abort();
    return { requested: true };
  }

  /** Point the engine at a downloaded entry's manifest again; moves and writes no bytes. */
  async function activate(id: string): Promise<{ activated: boolean }> {
    if (closing) throw new RemoteError('APP_CLOSING');
    const { models } = await readCatalogue(host.cataloguePaths);
    const model = models.find((entry) => entry.id === id);
    if (!model) throw new RemoteError('MODEL_NOT_OFFERED');
    const manifest = manifestPath(bundleRoot, model.id);
    if (!existsSync(manifest)) throw new RemoteError('MODEL_MISSING');
    await host.worker.request(CONFIGURE_BY_TASK[model.task], { path: manifest }).result;
    host.modelsChanged(model.task);
    return { activated: true };
  }

  async function remove(id: string): Promise<{ removed: boolean }> {
    if (closing) throw new RemoteError('APP_CLOSING');
    if (active.size) throw new RemoteError('QUEUE_FULL');
    const { models } = await readCatalogue(host.cataloguePaths);
    const model = models.find((entry) => entry.id === id);
    if (!model) throw new RemoteError('MODEL_NOT_OFFERED');
    const manifest = manifestPath(bundleRoot, model.id);
    const directory = path.join(bundleRoot, model.id);
    if (!existsSync(manifest)) return { removed: false };
    await host.worker.request(UNCONFIGURE_BY_TASK[model.task], { directory }).result;
    await Promise.allSettled([
      rm(directory, { recursive: true, force: true }),
      rm(manifest, { force: true }),
    ]);
    host.modelsChanged(model.task);
    return { removed: true };
  }

  return {
    list,
    start,
    cancel,
    activate,
    remove,
    get activeCount() {
      return active.size;
    },
    async close() {
      closing = true;
      for (const controller of active.values()) controller.abort();
    },
  };
}
