import type { CatalogDatabase } from '../catalog/catalog-database.js';
import { boolean, identifier, object, revision, text } from '../catalog/validation.js';
import { parseProcessingRecipe } from '../processing/recipe.js';
import type { ProcessingProfile, ProfileData, ProfileDocument } from './profile-types.js';

function reusableProcessing(input: unknown) {
  if (input === null) return null;
  const recipe = parseProcessingRecipe(input);
  if (recipe.inpaint?.target === 'manual' || recipe.editing?.trim)
    throw new Error('PROFILE_MEDIA_SPECIFIC');
  return recipe;
}

export function parseProfileDocument(input: unknown): ProfileDocument {
  const value = object(input, ['format', 'version', 'name', 'notes', 'processing']);
  if (value.format !== 'reupmatic.processing-profile' || value.version !== 1)
    throw new Error('PROFILE_VERSION');
  return {
    format: value.format,
    version: 1,
    name: text(value.name, 160).trim(),
    notes: text(value.notes, 2000, true),
    processing: reusableProcessing(value.processing),
  };
}

export class ProfileStore {
  constructor(private readonly db: CatalogDatabase) {}

  list(): ProcessingProfile[] {
    return this.db.list<ProfileData>('profile');
  }
  get(id: string): ProcessingProfile {
    return this.db.require<ProfileData>('profile', id);
  }

  save(input: unknown): ProcessingProfile {
    const value = object(input, [
      'id',
      'expected_revision',
      'name',
      'notes',
      'processing',
      'archived',
    ]);
    return this.db.save('profile', identifier(value.id), revision(value.expected_revision), {
      name: text(value.name, 160).trim(),
      notes: text(value.notes, 2000, true),
      processing: reusableProcessing(value.processing),
      archived: boolean(value.archived),
    });
  }

  document(id: string): ProfileDocument {
    const profile = this.get(id);
    return parseProfileDocument({
      format: 'reupmatic.processing-profile',
      version: 1,
      name: profile.name,
      notes: profile.notes,
      processing: profile.processing,
    });
  }
}
