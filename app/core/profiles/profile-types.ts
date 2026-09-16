import type { MutationIdentity, RecordMeta } from '../catalog/catalog-types.js';
import type { ProcessingRecipe } from '../processing/recipe.js';
export interface ProfileData {
  name: string;
  notes: string;
  processing: ProcessingRecipe | null;
  archived: boolean;
}
export type ProcessingProfile = ProfileData & RecordMeta;
export type SaveProfile = ProfileData & MutationIdentity;
export interface ProfileDocument {
  format: 'reupmatic.processing-profile';
  version: 1;
  name: string;
  notes: string;
  processing: ProcessingRecipe | null;
}
