import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { type BrowserWindow, dialog, shell } from 'electron';
import {
  SYNTHESIS_ENGINE,
  SYNTHESIS_LANGUAGES,
  writeLocalBundleDescriptor,
} from '../../../../core/speech/local-bundle.js';
import {
  HOSTED_CREDENTIAL_ENV_VAR,
  hostedModelIdentity,
  VIENEU_CLOUD_MODEL,
  VIENEU_CLOUD_PROTOCOL,
} from '../../../../core/speech/providers.js';
import { verifyVoiceTrack } from '../../../../core/speech/synthesis/admission.js';
import { SynthesisArtifacts } from '../../../../core/speech/synthesis/artifacts.js';
import { parseSynthesisStatus } from '../../../../core/speech/synthesis/contracts.js';
import { SynthesisCoordinator } from '../../../../core/speech/synthesis/coordinator.js';
import type { VoiceTrack } from '../../../../core/speech/synthesis/voice-track.js';
import { parseVoiceCloneRequest } from '../../../../core/speech/voices.js';
import type { Ticket, WorkerClient } from '../../../../core/worker/worker-client.js';
import type { IpcWire } from '../../../runtime/ipc.js';
import type { MediaRegistry } from '../../media/registry.js';
import type { SpeechProviderStore } from '../provider-store.js';
import type { ClonedVoiceStore } from '../voice-store.js';
import { installSynthesisExports } from './exports.js';

interface Host {
  workspace: string;
  media: MediaRegistry;
  savePath: (name: string) => string;
  wire: IpcWire;
  worker: WorkerClient;
  getWindow: () => BrowserWindow | undefined;
  getLanguage: () => string;
  voices: ClonedVoiceStore;
  providers: SpeechProviderStore;
}

export function installSynthesis(host: Host) {
  const artifacts = new SynthesisArtifacts(host.workspace);
  const coordinator = new SynthesisCoordinator(
    host.worker,
    artifacts,
    { voiceData: (voiceId) => host.voices.resolve(voiceId) },
    {
      listProviders: () => host.providers.list(),
      credentialEnv: (providerId) => host.providers.credentialEnv(providerId),
    },
  );
  const exports = installSynthesisExports({ ...host, artifacts });
  const previewText = {
    vi: 'Xin chào, đây là giọng đọc thử nghiệm của Reupmatic. Chúc bạn một ngày tốt lành.',
    en: 'Hello, this is a preview of the selected voice from Reupmatic. Have a wonderful day.',
  } as const;
  let setup: Ticket<unknown> | undefined;
  let choosing = false,
    cloning = false,
    previewing = false,
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
  host.wire('synthesis-start', (input) => {
    if (closing) throw new Error('APP_CLOSING');
    if (choosing) throw new Error('EDITOR_BUSY');
    const ticket = coordinator.start(input);
    return { request_id: ticket.id, revision: input.revision };
  });
  host.wire('synthesis-cancel', (input) => coordinator.cancel(input.request_id));
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
            ? 'Chọn thư mục mô hình giọng nói cục bộ'
            : 'Choose local voice model folder',
        properties: ['openDirectory'],
      });
      if (selected.canceled) return null;
      if (cancelled || closing) throw new Error('CANCELLED');
      const descriptor = path.join(host.workspace, 'speech-models', 'local-synthesis.json');
      await writeLocalBundleDescriptor(
        descriptor,
        selected.filePaths[0],
        SYNTHESIS_ENGINE,
        SYNTHESIS_LANGUAGES,
      );
      if (cancelled || closing) throw new Error('CANCELLED');
      setup = host.worker.request('synthesis.configure', { path: descriptor });
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
  host.wire('synthesis-voice-list', () => host.voices.list());
  // A cloned voice comes only from a user-picked file plus the attestation the request carries.
  host.wire('synthesis-voice-clone', async (input) => {
    const draft = parseVoiceCloneRequest(input.draft);
    if (closing) throw new Error('APP_CLOSING');
    if (choosing || cloning) throw new Error('EDITOR_BUSY');
    const window = host.getWindow();
    if (!window) throw new Error('EDITOR_BUSY');
    cloning = true;
    cancelled = false;
    try {
      const selected = await dialog.showOpenDialog(window, {
        title:
          host.getLanguage() === 'vi'
            ? 'Chọn tệp âm thanh để nhân bản giọng'
            : 'Choose a voice reference audio file',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg'] }],
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      if (cancelled || closing) throw new Error('CANCELLED');
      const asset = await host.worker.request('asset.register', {
        path: selected.filePaths[0],
        kind: 'audio',
      }).result;
      if (cancelled || closing) throw new Error('CANCELLED');
      const data = await host.worker.request('synthesis.clone', {
        asset_id: asset.asset_id,
      }).result;
      if (cancelled || closing) throw new Error('CANCELLED');
      return await host.voices.create(draft, data);
    } finally {
      cloning = false;
      send('synthesis-voices-changed');
    }
  });
  host.wire('synthesis-voice-rename', (input) => host.voices.rename(input.id, input.name));
  host.wire('synthesis-voice-remove', async (input) => {
    await host.voices.remove(input.id);
    return { removed: true };
  });
  host.wire('synthesis-cloud-voices', async () => {
    const provider = (await host.providers.list()).find(
      (candidate) => candidate.protocol === VIENEU_CLOUD_PROTOCOL && candidate.has_credential,
    );
    if (!provider) return null;
    const env = await host.providers.credentialEnv(provider.id);
    if (!env) return null;
    const data = await host.worker.request('synthesis.cloud-voices', {
      provider: { protocol: provider.protocol, endpoint_host: provider.endpoint_host },
      credential: env[HOSTED_CREDENTIAL_ENV_VAR],
    }).result;
    return {
      model_id: hostedModelIdentity({
        protocol: provider.protocol,
        remote_model_name: VIENEU_CLOUD_MODEL,
        endpoint_host: provider.endpoint_host,
      }),
      voices: data.voices.map((voice) => ({ id: voice.id, label: voice.label })),
    };
  });
  host.wire('synthesis-open-studio', async () => {
    await shell.openExternal('https://vieneu.io/#/clone');
    return { opened: true };
  });
  // The one place a cloud preview spends credits, and only on an explicit click.
  host.wire('synthesis-voice-preview', async (input) => {
    if (closing) throw new Error('APP_CLOSING');
    if (choosing || cloning || previewing || coordinator.activeCount)
      throw new Error('EDITOR_BUSY');
    previewing = true;
    try {
      const ticket = coordinator.start({
        request_id: randomUUID(),
        revision: 0,
        params: {
          source_layer: 'spoken',
          source_token: `preview-${randomUUID().replace(/-/g, '')}`,
          language: input.language,
          model_id: input.model_id,
          voice_id: input.voice_id,
          cues: [{ id: 'preview', text: previewText[input.language], start_ms: 0, end_ms: 8000 }],
        },
      });
      const result = await ticket.result;
      const filename = await artifacts.verify(result.artifact_id);
      if (closing) throw new Error('APP_CLOSING');
      const grant = `voice-preview-${input.voice_id}`;
      host.media.registerArtifact(grant, filename);
      return { url: `media://local/${grant}` };
    } finally {
      previewing = false;
    }
  });
  return {
    get activeCount() {
      return (
        coordinator.activeCount +
        Number(choosing) +
        Number(cloning) +
        Number(previewing) +
        exports.activeCount
      );
    },
    /** Re-verifies the saved voice artifact; a caller-supplied path is never admitted. */
    async verifyVoice(track: VoiceTrack) {
      const status = parseSynthesisStatus(await host.worker.request('synthesis.status', {}).result);
      return verifyVoiceTrack(track, artifacts, status);
    },
    async close() {
      closing = true;
      cancelled = true;
      exports.close();
      await Promise.allSettled([coordinator.close(), setup?.cancel()]);
    },
  };
}
