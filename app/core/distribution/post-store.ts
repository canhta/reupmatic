import path from 'node:path';
import type { CatalogDatabase } from '../catalog/catalog-database.js';
import type { Page } from '../catalog/catalog-types.js';
import { identifier, identifiers, object, revision, text } from '../catalog/validation.js';
import type { DistributionStore } from './distribution-store.js';
import type { ExportReference, Post, PostData, PostPlan, PostQuery } from './distribution-types.js';

export function parsePostPlan(input: unknown): PostPlan | null {
  if (input === null) return null;
  const value = object(input, ['instant', 'timezone']);
  if (!Number.isSafeInteger(value.instant) || Number(value.instant) < 0 || Number(value.instant) > 8640000000000000) {
    throw new Error('INVALID_SCHEDULE');
  }
  const timezone = text(value.timezone, 100);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(Number(value.instant)); }
  catch { throw new Error('INVALID_SCHEDULE'); }
  return { instant: Number(value.instant), timezone };
}

export class PostStore {
  constructor(private readonly db: CatalogDatabase, private readonly inventory: DistributionStore) {}

  get(id: string): Post { return this.db.require<PostData>('post', id); }

  create(input: unknown, exported: ExportReference): Post {
    const value = object(input, ['id', 'expected_revision', 'title', 'body', 'channel_id', 'library_id', 'export_id', 'link_ids', 'planned']);
    if (value.expected_revision !== null) throw new Error('INVALID_REQUEST');
    const channel = this.inventory.channel(identifier(value.channel_id));
    if (channel.archived) throw new Error('CHANNEL_ARCHIVED');
    if (identifier(value.library_id) !== exported.library_id || identifier(value.export_id) !== exported.link_id
      || !path.isAbsolute(exported.path) || !/^[a-f0-9]{64}$/.test(exported.sha256)) throw new Error('INVALID_EXPORT');
    const links = identifiers(value.link_ids, 20).map(id => {
      const link = this.inventory.link(id);
      if (link.archived) throw new Error('LINK_ARCHIVED');
      return { id: link.id, name: link.name, url: link.url };
    });
    return this.db.save<PostData>('post', identifier(value.id), null, {
      title: text(value.title, 300), body: text(value.body, 12000, true),
      channel: { id: channel.id, name: channel.name, platform: channel.platform },
      export: structuredClone(exported), links, planned: parsePostPlan(value.planned), state: 'draft',
    });
  }

  edit(input: unknown): Post {
    const value = object(input, ['id', 'expected_revision', 'title', 'body', 'planned', 'state']);
    const current = this.get(identifier(value.id));
    if (value.state !== 'draft' && value.state !== 'cancelled') throw new Error('INVALID_REQUEST');
    const { id, revision: _revision, created_at: _created, updated_at: _updated, ...data } = current;
    return this.db.save<PostData>('post', id, revision(value.expected_revision), {
      ...data, title: text(value.title, 300), body: text(value.body, 12000, true),
      planned: parsePostPlan(value.planned), state: value.state,
    });
  }

  list(input: PostQuery): Page<Post> {
    const value = object(input, ['search', 'view', 'offset', 'limit'], ['channel_id', 'link_id', 'library_id']);
    const search = text(value.search, 256, true).toLowerCase();
    if (!['all', 'upcoming', 'cancelled', 'published'].includes(String(value.view))
      || !Number.isInteger(value.offset) || Number(value.offset) < 0 || Number(value.offset) > 2000
      || !Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 100) throw new Error('INVALID_REQUEST');
    for (const key of ['channel_id', 'link_id', 'library_id']) if (value[key] !== undefined) identifier(value[key]);
    const filtered = this.db.list<PostData>('post').filter(post => {
      return post.title.toLowerCase().includes(search)
        && (!value.channel_id || post.channel.id === value.channel_id)
        && (!value.link_id || post.links.some(link => link.id === value.link_id))
        && (!value.library_id || post.export.library_id === value.library_id)
        && (value.view === 'all' || (value.view === 'upcoming' && post.state === 'draft' && post.planned !== null)
          || (value.view === 'cancelled' && post.state === 'cancelled'));
    });
    if (value.view === 'upcoming') filtered.sort((a, b) => a.planned!.instant - b.planned!.instant || a.id.localeCompare(b.id));
    return { items: filtered.slice(input.offset, input.offset + input.limit), total: filtered.length,
      offset: input.offset, limit: input.limit };
  }

  usage(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const post of this.db.list<PostData>('post')) {
      for (const link of post.links) result[link.id] = (result[link.id] ?? 0) + 1;
    }
    return result;
  }

  contentDependencies(id: string): { posts: number; pending_posts: number } {
    const posts = this.db.list<PostData>('post').filter(post => post.export.library_id === id);
    return { posts: posts.length, pending_posts: posts.filter(post => post.state === 'draft').length };
  }
}
