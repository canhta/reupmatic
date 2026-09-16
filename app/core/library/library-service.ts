import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from '../media/files.js';
import type { VideoSource } from '../media/media-types.js';
import type { LibraryStore } from './library-store.js';
import type { LibraryImportOptions, LibraryItem } from './library-types.js';

export type InspectVideo<T extends VideoSource = VideoSource> = (filename: string) => Promise<T>;

export class LibraryService<T extends VideoSource = VideoSource> {
  constructor(
    readonly store: LibraryStore,
    private readonly managedRoot: string,
    private readonly inspect: InspectVideo<T>,
  ) {}

  async importFile(
    filename: string,
    options: LibraryImportOptions,
  ): Promise<{ item: LibraryItem; reused: boolean }> {
    if (
      !options ||
      !['reference', 'copy'].includes(options.mode) ||
      !['reuse', 'separate'].includes(options.duplicates)
    )
      throw new Error('INVALID_REQUEST');
    const source = { ...(await this.inspect(await realpath(filename))) };
    const duplicate = this.store.findContent(source.sha256);
    if (duplicate && options.duplicates === 'reuse') return { item: duplicate, reused: true };
    const id = randomUUID();
    let ownedDirectory: string | undefined;
    try {
      if (options.mode === 'copy') {
        await mkdir(this.managedRoot, { recursive: true });
        const root = await realpath(this.managedRoot);
        ownedDirectory = path.join(root, id);
        await mkdir(ownedDirectory);
        const extension = path.extname(source.path).toLowerCase();
        if (!['.mp4', '.mov', '.mkv', '.webm', '.avi'].includes(extension))
          throw new Error('INVALID_MEDIA');
        const target = path.join(ownedDirectory, `source${extension}`);
        await copyFile(source.path, target, constants.COPYFILE_EXCL);
        if (
          (await hashFile(target)) !== source.sha256 ||
          (await hashFile(source.path)) !== source.sha256
        ) {
          throw new Error('SOURCE_CHANGED');
        }
        source.path = target;
      }
      return { item: this.store.add(id, source, options.mode), reused: false };
    } catch (error) {
      if (ownedDirectory)
        await rm(ownedDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async resolve(id: string): Promise<T> {
    const item = this.store.get(id);
    let source: T;
    try {
      const filename = await realpath(item.path);
      if (!(await stat(filename)).isFile()) throw new Error('SOURCE_UNAVAILABLE');
      source = await this.inspect(filename);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (
        ['ENOENT', 'EACCES', 'ENOTDIR'].some((value) => code.includes(value)) ||
        code === 'SOURCE_UNAVAILABLE'
      ) {
        this.store.availability(id, 'missing');
        throw new Error('SOURCE_UNAVAILABLE');
      }
      throw error;
    }
    if (source.sha256 !== item.sha256) {
      this.store.availability(id, 'changed');
      throw new Error('SOURCE_CHANGED');
    }
    this.store.availability(id, 'available');
    return source;
  }

  async relink(id: string, filename: string): Promise<LibraryItem> {
    const item = this.store.get(id);
    const source = { ...(await this.inspect(await realpath(filename))) };
    if (source.sha256 !== item.sha256) throw new Error('SOURCE_CHANGED');
    return this.store.relocate(id, source);
  }
}
