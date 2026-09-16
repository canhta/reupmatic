import { type BrowserWindow, dialog } from 'electron';
import { parseSpeechInput, parseSpeechStatus } from '../../../core/speech/recognition.js';
import { SpeechCoordinator } from '../../../core/speech/speech-coordinator.js';
import type { Ticket, WorkerClient } from '../../../core/worker/worker-client.js';
import { type IpcWire, requestId, requestRecord } from '../../runtime/ipc.js';
import type { MediaRegistry } from '../media/registry.js';

interface Host {
  wire: IpcWire;
  worker: WorkerClient;
  media: MediaRegistry;
  getWindow: () => BrowserWindow | undefined;
  getLanguage: () => string;
}

export function installSpeech(host: Host) {
  const coordinator = new SpeechCoordinator(host.worker);
  let setup: Ticket<Record<string, unknown>> | undefined;
  let choosing = false,
    cancelled = false,
    closing = false;
  const send = (channel: string, message?: unknown) => {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(`reupmatic:${channel}`, message);
  };
  coordinator.on('job', (message) => send('speech-job', message));
  host.wire('speech-status', async () =>
    parseSpeechStatus(await host.worker.request('speech.status', {}).result),
  );
  host.wire('speech-start', (value) => {
    if (closing) throw new Error('APP_CLOSING');
    if (choosing) throw new Error('EDITOR_BUSY');
    const input = parseSpeechInput(value),
      source = host.media.getVideo(input.params.asset_id);
    if (!source.has_audio) throw new Error('NO_AUDIO');
    if (input.params.end_ms > source.duration_ms) throw new Error('INVALID_REQUEST');
    const ticket = coordinator.start(input, source.sha256);
    return { request_id: ticket.id, revision: input.revision };
  });
  host.wire('speech-cancel', (value) => {
    const input = requestRecord(value, ['request_id']);
    return coordinator.cancel(requestId(input.request_id));
  });
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
  return {
    get activeCount() {
      return coordinator.activeCount + Number(choosing);
    },
    async close() {
      closing = true;
      cancelled = true;
      await Promise.allSettled([coordinator.close(), setup?.cancel()]);
    },
  };
}
