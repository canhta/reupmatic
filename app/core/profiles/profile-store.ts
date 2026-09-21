import type { CatalogDatabase } from '../catalog/catalog-database.js';
import { boolean, identifier, object, revision, text } from '../catalog/validation.js';
import type { ProcessingProfile, ProfileData, ProfileDocument } from './profile-contracts.js';
import { parseProfileDocument, parseProfileProcessing } from './profile-document.js';

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
      processing: parseProfileProcessing(value.processing),
      archived: boolean(value.archived),
    });
  }

  document(id: string): ProfileDocument {
    const profile = this.get(id);
    return parseProfileDocument({
      format: 'reupmatic.processing-profile',
      name: profile.name,
      notes: profile.notes,
      processing: profile.processing,
    });
  }
}
