import type { MutationIdentity, RecordMeta } from '../catalog/catalog-types.js';
export type LabelKind = 'tag' | 'category' | 'group';
export interface LabelData { name: string; kind: LabelKind; archived: boolean }
export type Label = LabelData & RecordMeta;
export type SaveLabel = LabelData & MutationIdentity;
export interface ContentLabels extends RecordMeta { label_ids: string[] }
