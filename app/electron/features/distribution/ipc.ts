import { LibraryAssets } from '../../../core/library/library-assets.js';
import { shell } from 'electron';
import { lstat } from 'node:fs/promises';
import { hashFile } from '../../../core/media/files.js';
import type { PostQuery } from '../../../core/distribution/distribution-types.js';
import { requestId, requestRecord } from '../../runtime/ipc.js';
import type { CatalogHost } from '../catalog/context.js';

export function installDistribution(host: CatalogHost): void {
  host.wire('channel-save', input => {
    const value = host.catalog().distribution.saveChannel(input);
    host.changed();
    return value;
  });
  host.wire('affiliate-save', input => {
    const value = host.catalog().distribution.saveLink(input);
    host.changed();
    return value;
  });
  host.wire('post-list', input => host.catalog().posts.list(input as PostQuery));
  host.wire('post-export-choices', () => host.library().store.exports());
  host.wire('post-create', async input => {
    const value = requestRecord(input, ['id', 'expected_revision', 'title', 'body', 'channel_id', 'library_id', 'export_id', 'link_ids', 'planned']);
    const libraryId = requestId(value.library_id);
    const exportId = requestId(value.export_id);
    const item = host.library().store.get(libraryId);
    const linked = item.links.find(link => link.id === exportId && link.kind === 'export');
    if (!linked) throw new Error('INVALID_EXPORT');
    await new LibraryAssets(host.library().store).resolve(libraryId, exportId);
    const info = await lstat(linked.path).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) throw new Error('SOURCE_UNAVAILABLE');
    const sha256 = await hashFile(linked.path);
    const after = await lstat(linked.path);
    if (info.ino !== after.ino || info.dev !== after.dev || info.size !== after.size || info.mtimeMs !== after.mtimeMs) {
      throw new Error('OUTPUT_CHANGED');
    }
    if (sha256 !== linked.sha256) throw new Error('OUTPUT_CHANGED');
    host.library().store.get(libraryId);
    const result = host.catalog().posts.create(input, {
      library_id: libraryId, link_id: exportId, path: linked.path, name: linked.name, sha256,
    });
    host.changed();
    return result;
  });
  host.wire('post-edit', input => {
    const result = host.catalog().posts.edit(input);
    host.changed();
    return result;
  });
  host.wire('post-reveal', async input => {
    const id = requestId(requestRecord(input, ['id']).id);
    const post = host.catalog().posts.get(id);
    if (!(await lstat(post.export.path).catch(() => null))?.isFile()) throw new Error('SOURCE_UNAVAILABLE');
    if (await hashFile(post.export.path) !== post.export.sha256) throw new Error('OUTPUT_CHANGED');
    shell.showItemInFolder(post.export.path);
    return { revealed: true };
  });
}
