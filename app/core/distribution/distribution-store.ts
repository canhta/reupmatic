import type { CatalogDatabase } from '../catalog/catalog-database.js';
import { boolean, httpsUrl, identifier, object, revision, text } from '../catalog/validation.js';
import type { TaxonomyStore } from '../taxonomy/taxonomy-store.js';
import type { AffiliateData, AffiliateLink, Channel, ChannelData } from './distribution-types.js';

export class DistributionStore {
  constructor(private readonly db: CatalogDatabase, private readonly taxonomy: TaxonomyStore) {}

  channels(): Channel[] {
    return this.db.list<ChannelData>('channel').map(value => ({ ...value, connection: 'not_connected', can_publish: false }));
  }

  links(): AffiliateLink[] { return this.db.list<AffiliateData>('affiliate'); }

  channel(id: string): Channel {
    return { ...this.db.require<ChannelData>('channel', id), connection: 'not_connected', can_publish: false };
  }

  link(id: string): AffiliateLink { return this.db.require<AffiliateData>('affiliate', id); }

  saveChannel(input: unknown): Channel {
    const value = object(input, ['id', 'expected_revision', 'name', 'platform', 'url', 'label_ids', 'archived']);
    const id = identifier(value.id);
    const platform = value.platform;
    if (platform !== 'youtube' && platform !== 'facebook_page') throw new Error('INVALID_REQUEST');
    const previous = this.db.find<ChannelData>('channel', id);
    if (previous && previous.platform !== platform) throw new Error('CHANNEL_PLATFORM_LOCKED');
    const label_ids = this.taxonomy.validate(value.label_ids, previous?.label_ids);
    const saved = this.db.save<ChannelData>('channel', id, revision(value.expected_revision), {
      name: text(value.name, 160).trim(), platform, url: httpsUrl(value.url, true),
      label_ids, archived: boolean(value.archived),
    });
    return { ...saved, connection: 'not_connected', can_publish: false };
  }

  saveLink(input: unknown): AffiliateLink {
    const value = object(input, ['id', 'expected_revision', 'name', 'url', 'label_ids', 'archived']);
    const id = identifier(value.id);
    const previous = this.db.find<AffiliateData>('affiliate', id);
    return this.db.save('affiliate', id, revision(value.expected_revision), {
      name: text(value.name, 160).trim(), url: httpsUrl(value.url),
      label_ids: this.taxonomy.validate(value.label_ids, previous?.label_ids), archived: boolean(value.archived),
    });
  }
}
