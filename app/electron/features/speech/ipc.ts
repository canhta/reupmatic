import { type BrowserWindow, dialog } from 'electron';
import { hostedEngineEntries, IMPLEMENTED_PROTOCOLS } from '../../../core/speech/providers.js';
import { parseSpeechStatus } from '../../../core/speech/recognition.js';
import { SpeechCoordinator } from '../../../core/speech/speech-coordinator.js';
import type { Ticket, WorkerClient } from '../../../core/worker/worker-client.js';
import { errorCode, type IpcWire } from '../../runtime/ipc.js';
import type { MediaRegistry } from '../media/registry.js';
import { installOfferedModels } from './offered-models.js';
import type { SpeechProviderStore } from './provider-store.js';

interface Host {
  wire: IpcWire;
  worker: WorkerClient;
  media: MediaRegistry;
  providers: SpeechProviderStore;
  getWindow: () => BrowserWindow | undefined;
  /** Every window sharing this bridge (main and Settings) — catalogue install events are pushed to
   * all of them rather than assuming one particular window exists. */
  getWindows: () => readonly (BrowserWindow | undefined)[];
  getLanguage: () => string;
  workspace: string;
  cataloguePaths: readonly string[];
}

export function installSpeech(host: Host) {
  // Gives the coordinator the hosted registry it needs to route a job (ticket 06): which
  // provider, if any, claims the request's model_id, and that provider's decrypted credential
  // for the hosted child's environment only. `SpeechProviderStore` already exposes exactly this
  // shape (`list`, `credentialEnv`); nothing here reads a credential for any other purpose.
  const coordinator = new SpeechCoordinator(host.worker, {
    listProviders: () => host.providers.list(),
    credentialEnv: (id) => host.providers.credentialEnv(id),
  });
  const offered = installOfferedModels({
    worker: host.worker,
    workspace: host.workspace,
    cataloguePaths: host.cataloguePaths,
    installEvent: (message) => send('speech-model-install', message),
    // The entry's own task decides which panel must refresh: a synthesis install configures the
    // voice store, so only `synthesis-models-changed` reaches Voice; a recognition install reaches
    // Transcribe. Sending `speech-models-changed` for every task was why an Editor panel did not
    // see a model installed from Settings.
    modelsChanged: (task) =>
      send(
        task === 'synthesis'
          ? 'synthesis-models-changed'
          : task === 'translation'
            ? 'translation-models-changed'
            : task === 'vision'
              ? 'models-changed'
              : 'speech-models-changed',
      ),
    errorCode,
  });
  let setup: Ticket<unknown> | undefined;
  let choosing = false,
    cancelled = false,
    closing = false;
  function send(channel: string, message?: unknown) {
    for (const window of host.getWindows()) {
      if (window && !window.isDestroyed()) window.webContents.send(`reupmatic:${channel}`, message);
    }
  }
  coordinator.on('job', (message) => send('speech-job', message));
  host.wire('speech-status', async () => {
    const workerStatus = parseSpeechStatus(await host.worker.request('speech.status', {}).result);
    const hosted = hostedEngineEntries(await host.providers.list());
    return parseSpeechStatus({ engines: [...workerStatus.engines, ...hosted] });
  });
  host.wire('speech-start', (input) => {
    if (closing) throw new Error('APP_CLOSING');
    if (choosing) throw new Error('EDITOR_BUSY');
    const source = host.media.getVideo(input.params.asset_id);
    if (!source.has_audio) throw new Error('NO_AUDIO');
    if (input.params.end_ms > source.duration_ms) throw new Error('INVALID_REQUEST');
    const ticket = coordinator.start(input, source.sha256);
    return { request_id: ticket.id, revision: input.revision };
  });
  host.wire('speech-cancel', (input) => coordinator.cancel(input.request_id));
  host.wire('speech-configure', async () => {
    if (choosing || coordinator.activeCount) throw new Error('EDITOR_BUSY');
    if (closing) throw new Error('APP_CLOSING');
    const window = host.getWindow();
    if (!window) throw new Error('EDITOR_BUSY');
    choosing = true;
    cancelled = false;
    try {
      const selected = await dialog.showOpenDialog(window, {
        title:
          host.getLanguage() === 'vi'
            ? 'Chọn cấu hình mô hình nhận dạng cục bộ'
            : 'Choose local speech model manifest',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (selected.canceled) return null;
      if (cancelled || closing) throw new Error('CANCELLED');
      setup = host.worker.request('speech.configure', { path: selected.filePaths[0] });
      const status = await setup.result;
      if (cancelled || closing) throw new Error('CANCELLED');
      return parseSpeechStatus(status);
    } finally {
      choosing = false;
      setup = undefined;
      send('speech-models-changed');
    }
  });
  host.wire('speech-cancel-setup', async () => {
    cancelled = true;
    await setup?.cancel();
    return { requested: choosing };
  });
  host.wire('speech-offered-models', () => offered.list());
  host.wire('speech-model-install-start', (input) => offered.start(input));
  host.wire('speech-model-install-cancel', (input) => offered.cancel(input.request_id));
  host.wire('speech-model-activate', (input) => offered.activate(input.catalogue_id));
  host.wire('speech-model-remove', (input) => offered.remove(input.catalogue_id));
  host.wire('speech-providers-list', () => host.providers.list());
  host.wire('speech-provider-protocols', () => [...IMPLEMENTED_PROTOCOLS]);
  host.wire('speech-provider-add', async (input) => {
    const provider = await host.providers.addProvider(input.draft, input.credential);
    send('speech-models-changed');
    return provider;
  });
  host.wire('speech-provider-update', async (input) => {
    const provider = await host.providers.updateProvider(input.id, input.draft);
    send('speech-models-changed');
    return provider;
  });
  host.wire('speech-provider-remove', async (input) => {
    await host.providers.removeProvider(input.id);
    send('speech-models-changed');
    return { removed: true };
  });
  host.wire('speech-provider-credential-set', async (input) => {
    await host.providers.setCredential(input.id, input.credential);
    send('speech-models-changed');
    return { ok: true };
  });
  host.wire('speech-provider-credential-remove', async (input) => {
    await host.providers.removeCredential(input.id);
    send('speech-models-changed');
    return { ok: true };
  });
  host.wire('speech-provider-model-add', async (input) => {
    const provider = await host.providers.addModel(input.provider_id, input.draft);
    send('speech-models-changed');
    return provider;
  });
  host.wire('speech-provider-model-update', async (input) => {
    const provider = await host.providers.updateModel(
      input.provider_id,
      input.model_key,
      input.draft,
    );
    send('speech-models-changed');
    return provider;
  });
  host.wire('speech-provider-model-remove', async (input) => {
    const provider = await host.providers.removeModel(input.provider_id, input.model_key);
    send('speech-models-changed');
    return provider;
  });
  return {
    get activeCount() {
      return coordinator.activeCount + Number(choosing) + offered.activeCount;
    },
    async close() {
      closing = true;
      cancelled = true;
      await Promise.allSettled([coordinator.close(), setup?.cancel(), offered.close()]);
    },
  };
}
