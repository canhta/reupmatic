import { type BrowserWindow, dialog } from 'electron';
import { SynthesisArtifacts } from '../../../../core/speech/synthesis/artifacts.js';
import {
  parseSynthesisInput,
  parseSynthesisStatus,
} from '../../../../core/speech/synthesis/contracts.js';
import { SynthesisCoordinator } from '../../../../core/speech/synthesis/coordinator.js';
import type { Ticket, WorkerClient } from '../../../../core/worker/worker-client.js';
import { type IpcWire, requestId, requestRecord } from '../../../runtime/ipc.js';
import type { MediaRegistry } from '../../media/registry.js';
import { installSynthesisExports } from './exports.js';

interface Host {
  workspace: string;
  media: MediaRegistry;
  savePath: (name: string) => string;
  wire: IpcWire;
  worker: WorkerClient;
  getWindow: () => BrowserWindow | undefined;
  getLanguage: () => string;
}

export function installSynthesis(host: Host) {
  const artifacts = new SynthesisArtifacts(host.workspace);
  const coordinator = new SynthesisCoordinator(host.worker, artifacts);
  const exports = installSynthesisExports({ ...host, artifacts });
  let setup: Ticket<Record<string, unknown>> | undefined;
  let choosing = false,
    cancelled = false,
    closing = false;
  const send = (channel: string, message?: unknown) => {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(`reupmatic:${channel}`, message);
  };
  coordinator.on('job', (message) => send('synthesis-job', message));
  host.wire('synthesis-status', async () =>
    parseSynthesisStatus(await host.worker.request('synthesis.status', {}).result),
  );
  host.wire('synthesis-start', (value) => {
    if (closing) throw new Error('APP_CLOSING');
    if (choosing) throw new Error('EDITOR_BUSY');
    const input = parseSynthesisInput(value);
    const ticket = coordinator.start(input);
    return { request_id: ticket.id, revision: input.revision };
  });
  host.wire('synthesis-cancel', (value) => {
    const input = requestRecord(value, ['request_id']);
    return coordinator.cancel(requestId(input.request_id));
  });
  host.wire('synthesis-configure', async () => {
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
            ? 'Chọn cấu hình mô hình giọng nói cục bộ'
            : 'Choose local voice model manifest',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (selected.canceled) return null;
      if (cancelled || closing) throw new Error('CANCELLED');
      host.media.originalPaths.add(selected.filePaths[0]);
      setup = host.worker.request('synthesis.configure', { path: selected.filePaths[0] });
      const status = await setup.result;
      if (cancelled || closing) throw new Error('CANCELLED');
      return parseSynthesisStatus(status);
    } finally {
      choosing = false;
      setup = undefined;
      send('synthesis-models-changed');
    }
  });
  host.wire('synthesis-cancel-setup', async () => {
    cancelled = true;
    await setup?.cancel();
    return { requested: choosing };
  });
  return {
    get activeCount() {
      return coordinator.activeCount + Number(choosing) + exports.activeCount;
    },
    async close() {
      closing = true;
      cancelled = true;
      exports.close();
      await Promise.allSettled([coordinator.close(), setup?.cancel()]);
    },
  };
}
