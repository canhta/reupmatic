export interface RecordMeta {
  id: string;
  revision: number;
  created_at: number;
  updated_at: number;
}
export interface MutationIdentity {
  id: string;
  expected_revision: number | null;
}
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
export type CatalogKind =
  | 'label'
  | 'content_labels'
  | 'channel'
  | 'affiliate'
  | 'profile'
  | 'post'
  | 'workflow'
  | 'run';
