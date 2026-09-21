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
  /** Shipped catalogue first, then an optional user-owned workspace catalogue that overrides by id. */
  cataloguePaths: readonly string[];
  installEvent: (message: unknown) => void;
  /** The entry's own task, so the host notifies the panel that reads that task's store — an
   * install of a synthesis entry must refresh Voice, not only Transcribe. */
  modelsChanged: (task: ModelTask) => void;
  errorCode: (error: unknown) => string;
  /** Injectable so a test can drive an install's lifecycle without moving real bytes. */
  install?: (options: InstallOptions) => Promise<InstallResult>;
}

type InstallEventBody =
  | { event: 'progress'; data: { phase: string; fraction: number | null } }
  | { event: 'result'; data: { catalogue_id: string } }
  | { event: 'error'; data: { code: string } };

/** The configuration transaction each task's adapter owns; the catalogue's task dimension routes
 * it, never a per-screen branch. */
const CONFIGURE_BY_TASK = {
  recognition: 'speech.configure',
  synthesis: 'synthesis.configure',
  translation: 'translation.configure',
  // Vision entries are per-capability (OCR packs, an inpainting model) but share one store, so an
  // install or activation merges into it instead of replacing the other capability.
  vision: 'models.merge',
} as const satisfies Record<ModelTask, string>;

/** The matching "forget this bundle" transaction, so removal never leaves a store pointing at
 * files about to disappear. */
const UNCONFIGURE_BY_TASK = {
  recognition: 'speech.unconfigure',
  synthesis: 'synthesis.unconfigure',
  translation: 'translation.unconfigure',
  vision: 'models.unconfigure',
} as const satisfies Record<ModelTask, string>;

/**
 * The offered-model catalogue and its explicit install lifecycle (D-56). Lives in the host process:
 * the inference child's audit hook keeps denying every socket, so nothing here can run there. Only
 * `speech-model-install-start` begins a transfer, never a screen open, a failed recognition or a
 * launch. One install at a time; cancelling aborts the transfer and the installer removes every
 * partial file it wrote.
 */
export function installOfferedModels(host: Host) {
  const bundleRoot = path.join(host.workspace, 'speech-models');
  const active = new Map<string, AbortController>();
  const install = host.install ?? installOfferedModel;
  // The install the host is running, mirrored here so a panel mounting part-way through can
  // re-attach. The renderer is a viewer of this work, never its owner.
  let running: ActiveInstall | null = null;
  let closing = false;

  // A previous host that died mid-transfer cannot clean up after itself; do it once here so a
  // leftover half-bundle never later looks configured.
  void discardStaleDownloads(bundleRoot).catch(() => undefined);

  function emit(id: string, event: InstallEventBody): void {
    if (event.event === 'progress' && running?.request_id === id) {
      running = { ...running, phase: event.data.phase, fraction: event.data.fraction };
    }
    host.installEvent({ id, ...event });
  }

  /** An install that fails after its files landed must not leave a bundle that later looks
   * configured: remove the directory and the manifest together. */
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
      // The one existing configuration transaction validates the written manifest's hashes again
      // and merges it into the engine store, so the engine reports as configured through the
      // existing list — downloading is not a second bundle contract. Which transaction is the
      // entry's own task's; the catalogue's task dimension routes it, not a per-screen branch.
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

  /**
   * D-56/D-65: point the engine at a downloaded entry's manifest again. It moves no bytes and
   * writes none — the manifest the install already wrote is re-verified by the same configuration
   * transaction, so activating a model the user already has is the same path as configuring any
   * bundle, not a second mechanism.
   */
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

  /**
   * Remove a downloaded entry. The engine entry pointing at this bundle is forgotten first, so
   * the store never points at files that are about to disappear; then the bundle directory and
   * its manifest are deleted. Refused while an install is running, so a transfer is never
   * deleting the bytes it is writing. Only this entry's own bundle is touched.
   */
  async function remove(id: string): Promise<{ removed: boolean }> {
    if (closing) throw new RemoteError('APP_CLOSING');
    if (active.size) throw new RemoteError('QUEUE_FULL');
    const { models } = await readCatalogue(host.cataloguePaths);
    const model = models.find((entry) => entry.id === id);
    if (!model) throw new RemoteError('MODEL_NOT_OFFERED');
    const manifest = manifestPath(bundleRoot, model.id);
    const directory = path.join(bundleRoot, model.id);
    if (!existsSync(manifest)) return { removed: false };
    // The entry's own task owns its store; the catalogue's task dimension routes it, never a
    // per-screen branch.
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
