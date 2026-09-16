import { dialog, type BrowserWindow } from 'electron';
import { TranslationCoordinator } from '../../../../core/speech/translation/coordinator.js';
import { parseTranslationInput, parseTranslationStatus } from '../../../../core/speech/translation/contracts.js';
import type { Ticket, WorkerClient } from '../../../../core/worker/worker-client.js';
import { requestId, requestRecord, type IpcWire } from '../../../runtime/ipc.js';

interface Host {
  wire: IpcWire;
  worker: WorkerClient;
  getWindow: () => BrowserWindow | undefined;
  getLanguage: () => string;
}

export function installTranslation(host: Host) {
  const coordinator = new TranslationCoordinator(host.worker);
  let setup: Ticket<Record<string, unknown>> | undefined;
  let choosing = false, cancelled = false, closing = false;
  const send = (channel: string, message?: unknown) => {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(`reupmatic:${channel}`, message);
  };
  coordinator.on('job', message => send('translation-job', message));
  host.wire('translation-status', async () => parseTranslationStatus(await host.worker.request('translation.status', {}).result));
  host.wire('translation-start', value => {
    if (closing) throw new Error('APP_CLOSING');
    if (choosing) throw new Error('EDITOR_BUSY');
    const input = parseTranslationInput(value);
    const ticket = coordinator.start(input);
    return { request_id: ticket.id, revision: input.revision };
  });
  host.wire('translation-cancel', value => {
    const input = requestRecord(value, ['request_id']);
    return coordinator.cancel(requestId(input.request_id));
  });
  host.wire('translation-configure', async () => {
    if (choosing || coordinator.activeCount) throw new Error('EDITOR_BUSY');
    if (closing) throw new Error('APP_CLOSING');
    const window = host.getWindow();
    if (!window) throw new Error('EDITOR_BUSY');
    choosing = true;
    cancelled = false;
    try {
      const selected = await dialog.showOpenDialog(window, {
        title: host.getLanguage() === 'vi' ? 'Chọn cấu hình mô hình dịch cục bộ' : 'Choose local translation model manifest',
        properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (selected.canceled) return null;
      if (cancelled || closing) throw new Error('CANCELLED');
      setup = host.worker.request('translation.configure', { path: selected.filePaths[0] });
      const status = await setup.result;
      if (cancelled || closing) throw new Error('CANCELLED');
      return parseTranslationStatus(status);
    } finally { choosing = false; setup = undefined; send('translation-models-changed'); }
  });
  host.wire('translation-cancel-setup', async () => {
    cancelled = true;
    await setup?.cancel();
    return { requested: choosing };
  });
  return {
    get activeCount() { return coordinator.activeCount + Number(choosing); },
    async close() {
      closing = true;
      cancelled = true;
      await Promise.allSettled([coordinator.close(), setup?.cancel()]);
    },
  };
}
