import { realpath, stat } from 'node:fs/promises';
import { hashFile } from '../media/files.js';
import { loadProject } from '../projects/project.js';
import type { LibraryStore } from './library-store.js';
import type { LibraryLink, LibraryLinkKind } from './library-types.js';

export class LibraryAssets {
  constructor(private readonly store: LibraryStore) {}

  async register(
    itemId: string,
    kind: LibraryLinkKind,
    filename: string,
    expectedHash?: string,
  ): Promise<LibraryLink> {
    const item = this.store.get(itemId);
    const canonical = await realpath(filename);
    const before = await stat(canonical);
    if (!before.isFile()) throw new Error('SOURCE_UNAVAILABLE');
    const sha256 = await hashFile(canonical);
    if (kind === 'project') {
      const project = await loadProject(canonical);
      if (
        project.source.sha256 !== item.sha256 &&
        !project.composition?.clips.some((clip) => clip.source.sha256 === item.sha256)
      ) {
        throw new Error('LIBRARY_ASSET_SOURCE');
      }
      if ((await hashFile(canonical)) !== sha256) throw new Error('SOURCE_CHANGED');
    }
    if (expectedHash !== undefined && sha256 !== expectedHash) throw new Error('SOURCE_CHANGED');
    const after = await stat(canonical);
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino
    ) {
      throw new Error('SOURCE_CHANGED');
    }
    return this.store.link(itemId, kind, canonical, { sha256, size_bytes: after.size });
  }

  async resolve(itemId: string, linkId: string): Promise<LibraryLink> {
    const linked = this.store.get(itemId).links.find((link) => link.id === linkId);
    if (!linked) throw new Error('LIBRARY_ASSET_MISSING');
    try {
      const before = await stat(linked.path);
      if (!before.isFile()) throw new Error('SOURCE_UNAVAILABLE');
      if (before.size !== linked.size_bytes || (await hashFile(linked.path)) !== linked.sha256) {
        throw new Error('SOURCE_CHANGED');
      }
      const after = await stat(linked.path);
      if (
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ino !== after.ino
      ) {
        throw new Error('SOURCE_CHANGED');
      }
      return linked;
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw new Error('SOURCE_UNAVAILABLE');
      }
      throw error;
    }
  }
}
