import path from 'node:path';
import type { Page } from '../catalog/catalog-contracts.js';
import type { CatalogDatabase } from '../catalog/catalog-database.js';
import { identifier, identifiers, object, revision, text } from '../catalog/validation.js';
import type {
  ExportReference,
  Post,
  PostData,
  PostQuery,
  PostSortKey,
} from './distribution-contracts.js';
import { POST_QUERY_SORT_DIRECTIONS, POST_SORT_KEYS } from './distribution-contracts.js';
import type { DistributionStore } from './distribution-store.js';
import { parsePostPlan } from './post-schedule.js';
import type { Publication } from './publishing/contracts.js';
import { parsePostOptions } from './publishing/options.js';

export class PostStore {
  constructor(
    private readonly db: CatalogDatabase,
    private readonly inventory: DistributionStore,
  ) {}

  get(id: string): Post {
    return this.db.require<PostData>('post', id);
  }

  setPublication(id: string, publication: Publication): Post {
    const current = this.get(identifier(id));
    const {
      id: postId,
      revision: _revision,
      created_at: _created,
      updated_at: _updated,
      ...data
    } = current;
    return this.db.save<PostData>('post', postId, current.revision, { ...data, publication });
  }

  create(input: unknown, exported: ExportReference): Post {
    const value = object(input, [
      'id',
      'expected_revision',
      'title',
      'body',
      'channel_id',
      'library_id',
      'export_id',
      'link_ids',
      'planned',
      'options',
    ]);
    if (value.expected_revision !== null) throw new Error('INVALID_REQUEST');
    const channel = this.inventory.channel(identifier(value.channel_id));
    if (channel.archived) throw new Error('CHANNEL_ARCHIVED');
    if (
      identifier(value.library_id) !== exported.library_id ||
      identifier(value.export_id) !== exported.link_id ||
      !path.isAbsolute(exported.path) ||
      !/^[a-f0-9]{64}$/.test(exported.sha256)
    )
      throw new Error('INVALID_EXPORT');
    const links = identifiers(value.link_ids, 20).map((id) => {
      const link = this.inventory.link(id);
      if (link.archived) throw new Error('LINK_ARCHIVED');
      return { id: link.id, name: link.name, url: link.url };
    });
    return this.db.save<PostData>('post', identifier(value.id), null, {
      title: text(value.title, 300),
      body: text(value.body, 12000, true),
      channel: { id: channel.id, name: channel.name, platform: channel.platform },
      export: structuredClone(exported),
      links,
      planned: parsePostPlan(value.planned),
      options: parsePostOptions(value.options, channel.platform),
      state: 'draft',
      publication: null,
    });
  }

  edit(input: unknown): Post {
    const value = object(input, [
      'id',
      'expected_revision',
      'title',
      'body',
      'planned',
      'options',
      'state',
    ]);
    const current = this.get(identifier(value.id));
    if (value.state !== 'draft' && value.state !== 'cancelled') throw new Error('INVALID_REQUEST');
    const {
      id,
      revision: _revision,
      created_at: _created,
      updated_at: _updated,
      ...data
    } = current;
    return this.db.save<PostData>('post', id, revision(value.expected_revision), {
      ...data,
      title: text(value.title, 300),
      body: text(value.body, 12000, true),
      planned: parsePostPlan(value.planned),
      options: parsePostOptions(value.options, current.channel.platform),
      state: value.state,
    });
  }

  list(input: PostQuery): Page<Post> {
    const value = object(
      input,
      ['search', 'view', 'offset', 'limit'],
      ['channel_id', 'link_id', 'library_id', 'sort_by', 'sort_dir'],
    );
    const search = text(value.search, 256, true).toLowerCase();
    if (
      !['all', 'upcoming', 'cancelled', 'published'].includes(String(value.view)) ||
      !Number.isInteger(value.offset) ||
      Number(value.offset) < 0 ||
      Number(value.offset) > 2000 ||
      !Number.isInteger(value.limit) ||
      Number(value.limit) < 1 ||
      Number(value.limit) > 100 ||
      (value.sort_by !== undefined &&
        !(POST_SORT_KEYS as readonly string[]).includes(String(value.sort_by))) ||
      (value.sort_dir !== undefined &&
        !(POST_QUERY_SORT_DIRECTIONS as readonly string[]).includes(String(value.sort_dir)))
    )
      throw new Error('INVALID_REQUEST');
    for (const key of ['channel_id', 'link_id', 'library_id'])
      if (value[key] !== undefined) identifier(value[key]);
    const filtered = this.db.list<PostData>('post').filter((post) => {
      return (
        post.title.toLowerCase().includes(search) &&
        (!value.channel_id || post.channel.id === value.channel_id) &&
        (!value.link_id || post.links.some((link) => link.id === value.link_id)) &&
        (!value.library_id || post.export.library_id === value.library_id) &&
        (value.view === 'all' ||
          (value.view === 'upcoming' && post.state === 'draft' && post.planned !== null) ||
          (value.view === 'published' && post.publication !== null) ||
          (value.view === 'cancelled' && post.state === 'cancelled'))
      );
    });
    if (value.sort_by !== undefined) {
      const dir = value.sort_dir === 'descending' ? -1 : 1;
      // Record<PostSortKey, …> keeps this map exhaustive against POST_SORT_KEYS at compile time.
      const comparators: Record<PostSortKey, (a: PostData, b: PostData) => number> = {
        title: (a, b) => a.title.localeCompare(b.title),
        channel: (a, b) => a.channel.name.localeCompare(b.channel.name),
        state: (a, b) => a.state.localeCompare(b.state),
        planned: (a, b) =>
          (a.planned?.instant ?? Number.POSITIVE_INFINITY) -
          (b.planned?.instant ?? Number.POSITIVE_INFINITY),
      };
      const compare = comparators[value.sort_by as PostSortKey];
      filtered.sort((a, b) => dir * compare(a, b) || a.id.localeCompare(b.id));
    } else if (value.view === 'upcoming') {
      const instant = (post: PostData) => {
        if (post.planned === null) throw new Error('INVALID_STATE');
        return post.planned.instant;
      };
      filtered.sort((a, b) => instant(a) - instant(b) || a.id.localeCompare(b.id));
    }
    return {
      items: filtered.slice(input.offset, input.offset + input.limit),
      total: filtered.length,
      offset: input.offset,
      limit: input.limit,
    };
  }

  usage(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const post of this.db.list<PostData>('post')) {
      for (const link of post.links) result[link.id] = (result[link.id] ?? 0) + 1;
    }
    return result;
  }

  contentDependencies(id: string): { posts: number; pending_posts: number } {
    const posts = this.db.list<PostData>('post').filter((post) => post.export.library_id === id);
    return {
      posts: posts.length,
      pending_posts: posts.filter((post) => post.state === 'draft').length,
    };
  }
}
