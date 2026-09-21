import { lstat } from 'node:fs/promises';
import { shell } from 'electron';
import { hashFile } from '../../../core/media/files.js';
import type { CatalogHost } from '../catalog/context.js';

export function installDistribution(host: CatalogHost): void {
  host.wire('channel-save', (input) => {
    const value = host.catalog().saveChannel(input);
    host.changed();
    return value;
  });
  host.wire('affiliate-save', (input) => {
    const value = host.catalog().saveLink(input);
    host.changed();
    return value;
  });
  host.wire('post-list', (input) => host.catalog().listPosts(input));
  host.wire('post-export-choices', () => host.library().exportChoices());
  host.wire('post-create', async (input) => {
    const result = await host.catalog().createPost(input);
    host.changed();
    return result;
  });
  host.wire('post-edit', (input) => {
    const result = host.catalog().editPost(input);
    host.changed();
    return result;
  });
  host.wire('post-reveal', async (input) => {
    const post = host.catalog().getPost(input.id);
    if (!(await lstat(post.export.path).catch(() => null))?.isFile())
      throw new Error('SOURCE_UNAVAILABLE');
    if ((await hashFile(post.export.path)) !== post.export.sha256)
      throw new Error('OUTPUT_CHANGED');
    shell.showItemInFolder(post.export.path);
    return { revealed: true };
  });
}
