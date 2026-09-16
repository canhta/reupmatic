import { dialog, type BrowserWindow } from 'electron';
import type { Soundtrack } from '../../../../core/editing/soundtrack.js';
import { parseSoundtrack } from '../../../../core/editing/soundtrack.js';
import type { MediaRegistry } from '../../media/registry.js';
import type { IpcWire } from '../../../runtime/ipc.js';

export const audioFilters = [{ name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus'] }];

export function installAudio(host: { wire: IpcWire; media: MediaRegistry; getWindow(): BrowserWindow }): void {
  host.wire('audio-pick', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), { properties: ['openFile'], filters: audioFilters });
    if (chosen.canceled) return null;
    const { source } = await host.media.registerAudio(chosen.filePaths[0]);
    return source;
  });
  host.wire('audio-preview', input => {
    const value = parseSoundtrack(input);
    return host.media.authorizeSoundtrack(value);
  });
}

export async function restoreProjectAudio(
  media: MediaRegistry, window: BrowserWindow, soundtrack: Soundtrack | undefined,
): Promise<Soundtrack | null | undefined> {
  if (!soundtrack) return undefined;
  const chosen = await dialog.showOpenDialog(window, {
    properties: ['openFile'], filters: audioFilters,
    defaultPath: soundtrack.source.path.startsWith('\\\\') ? undefined : soundtrack.source.path,
  });
  if (chosen.canceled) return null;
  const { source } = await media.registerAudio(chosen.filePaths[0]);
  if (source.sha256 !== soundtrack.source.sha256) throw new Error('SOURCE_CHANGED');
  return parseSoundtrack({ ...soundtrack, source });
}
