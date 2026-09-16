import type { MutationIdentity, RecordMeta } from '../catalog/catalog-types.js';
export type Platform = 'youtube' | 'facebook_page';
export interface ChannelData {
  name: string;
  platform: Platform;
  url: string;
  label_ids: string[];
  archived: boolean;
}
export type Channel = ChannelData &
  RecordMeta & { connection: 'not_connected'; can_publish: false };
export type SaveChannel = ChannelData & MutationIdentity;
export interface AffiliateData {
  name: string;
  url: string;
  label_ids: string[];
  archived: boolean;
}
export type AffiliateLink = AffiliateData & RecordMeta;
export type SaveAffiliate = AffiliateData & MutationIdentity;
export interface ExportReference {
  library_id: string;
  link_id: string;
  name: string;
  path: string;
  sha256: string;
}
export interface PostPlan {
  instant: number;
  timezone: string;
}
export interface PostData {
  title: string;
  body: string;
  channel: Pick<Channel, 'id' | 'name' | 'platform'>;
  export: ExportReference;
  links: Pick<AffiliateLink, 'id' | 'name' | 'url'>[];
  planned: PostPlan | null;
  state: 'draft' | 'cancelled';
}
export type Post = PostData & RecordMeta;
export interface CreatePost extends MutationIdentity {
  title: string;
  body: string;
  channel_id: string;
  library_id: string;
  export_id: string;
  link_ids: string[];
  planned: PostPlan | null;
}
export interface EditPost extends MutationIdentity {
  title: string;
  body: string;
  planned: PostPlan | null;
  state: 'draft' | 'cancelled';
}
export interface PostQuery {
  search: string;
  channel_id?: string;
  link_id?: string;
  library_id?: string;
  view: 'all' | 'upcoming' | 'cancelled' | 'published';
  offset: number;
  limit: number;
}
export interface ExportChoice {
  library_id: string;
  export_id: string;
  content_name: string;
  name: string;
}
