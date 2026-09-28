import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dialog } from 'electron';
import { saveChosenExport } from '../../../core/media/files.js';
import { parseProfileDocument } from '../../../core/profiles/profile-document.js';
import type { CatalogHost } from '../catalog/context.js';

export function installProfiles(host: CatalogHost): void {
  host.wire('profile-save', (input) => {
    const result = host.catalog().saveProfile(input);
    host.changed();
    return result;
  });
  host.wire('profile-read', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Reupmatic processing profile', extensions: ['json'] }],
    });
    if (chosen.canceled) return null;
    const file = await open(chosen.filePaths[0], 'r');
    try {
      const data = Buffer.alloc(131073);
      let count = 0;
      while (count < data.length) {
        const { bytesRead } = await file.read(data, count, data.length - count, null);
        if (!bytesRead) break;
        count += bytesRead;
      }
      if (count > 131072) throw new Error('PROFILE_INVALID');
      let value: unknown;
      try {
        value = JSON.parse(data.subarray(0, count).toString('utf8'));
      } catch {
        throw new Error('PROFILE_INVALID');
      }
      return parseProfileDocument(value);
    } finally {
      await file.close();
    }
  });
  host.wire('profile-export', async (input) => {
    const document = host.catalog().getProfileDocument(input.id);
    const chosen = await dialog.showSaveDialog(host.getWindow(), {
      defaultPath: 'processing-profile.json',
      filters: [{ name: 'Reupmatic processing profile', extensions: ['json'] }],
    });
    if (chosen.canceled || !chosen.filePath) return null;
    const directory = await mkdtemp(path.join(host.workspace, 'profile-export-'));
    try {
      const source = path.join(directory, 'profile.json');
      await writeFile(source, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
      await saveChosenExport(source, chosen.filePath, host.originalPaths);
      return { name: path.basename(chosen.filePath) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
