import type { MutationIdentity, RecordMeta } from '../catalog/catalog-contracts.js';
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
  name: string;
  notes: string;
  processing: ProcessingRecipe | null;
}
