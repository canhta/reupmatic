import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { type BrowserWindow, dialog } from 'electron';
import type {
  SynthesisArtifacts,
  SynthesisExportKind,
} from '../../../../core/speech/synthesis/artifacts.js';
import type { IpcWire } from '../../../runtime/ipc.js';
import type { MediaRegistry } from '../../media/registry.js';

interface Host {
  wire: IpcWire;
  media: MediaRegistry;
  artifacts: SynthesisArtifacts;
  getWindow: () => BrowserWindow | undefined;
  getLanguage: () => string;
  savePath: (name: string) => string;
}
interface Choice {
  artifact: string;
  kind: SynthesisExportKind;
  path: string;
  expires: number;
}

/** Native selection and write are separate: UI rechecks spoken text after the dialog. */
export function installSynthesisExports(host: Host) {
  const choices = new Map<string, Choice>();
  let busy = false,
    closing = false,
    cancelled = false;
  const active = () => {
    if (closing || cancelled) throw new Error('CANCELLED');
  };
  host.wire('synthesis-preview', async (input) => {
    const id = input.artifact_id;
    const filename = await host.artifacts.verify(id);
    if (closing) throw new Error('APP_CLOSING');
    const grant = `synthesis-${id}`;
    host.media.registerArtifact(grant, filename);
    return { url: `media://local/${grant}` };
  });
  host.wire('synthesis-choose-export', async (input) => {
    const id = input.artifact_id,
      kind = input.kind;
    if (closing) throw new Error('APP_CLOSING');
    if (busy) throw new Error('EDITOR_BUSY');
    const window = host.getWindow();
    if (!window) throw new Error('EDITOR_BUSY');
    busy = true;
    cancelled = false;
    try {
      await host.artifacts.verify(id, kind);
      active();
      const extension = kind === 'wav' ? 'wav' : 'json';
      const choice = await dialog.showSaveDialog(window, {
        title:
          host.getLanguage() === 'vi' ? 'Lưu bản giọng đọc đã duyệt' : 'Save reviewed speech draft',
        defaultPath: host.savePath(`speech-${id.slice(0, 8)}.${extension}`),
        filters: [{ name: kind === 'wav' ? 'WAV' : 'JSON', extensions: [extension] }],
      });
      active();
      if (choice.canceled || !choice.filePath) return null;
      if (path.extname(choice.filePath).toLowerCase() !== `.${extension}`)
        throw new Error('SYNTHESIS_EXPORT_EXTENSION');
      choices.clear();
      const choiceId = randomUUID();
      choices.set(choiceId, {
        artifact: id,
        kind,
        path: choice.filePath,
        expires: Date.now() + 60000,
      });
      return { choice_id: choiceId, name: path.basename(choice.filePath) };
    } finally {
      busy = false;
    }
  });
  host.wire('synthesis-save', async (input) => {
    const id = input.choice_id,
      artifactId = input.artifact_id,
      choice = choices.get(id);
    choices.delete(id);
    if (!choice || choice.artifact !== artifactId || choice.expires < Date.now())
      throw new Error('STALE_OPERATION');
    if (busy || closing) throw new Error('EDITOR_BUSY');
    busy = true;
    cancelled = false;
    try {
      await host.artifacts.save(
        artifactId,
        choice.kind,
        choice.path,
        host.media.originalPaths,
        active,
      );
      return { name: path.basename(choice.path) };
    } finally {
      busy = false;
    }
  });
  host.wire('synthesis-cancel-export', () => {
    cancelled = true;
    choices.clear();
    return { requested: busy };
  });
  return {
    get activeCount() {
      return Number(busy);
    },
    close() {
      closing = true;
      cancelled = true;
      choices.clear();
    },
  };
}
