import type { CatalogDatabase } from '../catalog/catalog-database.js';
import { boolean, identifier, identifiers, object, revision, text } from '../catalog/validation.js';
import type { ContentLabels, Label, LabelData } from './taxonomy-types.js';

export class TaxonomyStore {
  constructor(private readonly db: CatalogDatabase) {}

  list(): Label[] { return this.db.list<LabelData>('label'); }

  save(input: unknown): Label {
    const value = object(input, ['id', 'expected_revision', 'name', 'kind', 'archived']);
    const id = identifier(value.id);
    const previous = this.db.find<LabelData>('label', id);
    if (previous && previous.kind !== value.kind) throw new Error('LABEL_KIND_LOCKED');
    const name = text(value.name, 80).trim().normalize('NFC');
    const kind = value.kind;
    if (kind !== 'tag' && kind !== 'category' && kind !== 'group') throw new Error('INVALID_REQUEST');
    if (this.list().some(label => label.id !== id && label.kind === kind
      && label.name.normalize('NFC').toLowerCase() === name.toLowerCase())) throw new Error('LABEL_EXISTS');
    return this.db.save('label', id, revision(value.expected_revision), { name, kind, archived: boolean(value.archived) });
  }

  validate(value: unknown, existing: string[] = []): string[] {
    const ids = identifiers(value, 30);
    for (const id of ids) {
      const label = this.db.require<LabelData>('label', id);
      if (label.archived && !existing.includes(id)) throw new Error('LABEL_ARCHIVED');
    }
    return ids;
  }

  content(): ContentLabels[] { return this.db.list<{ label_ids: string[] }>('content_labels'); }

  assignContent(input: unknown): ContentLabels {
    const value = object(input, ['id', 'expected_revision', 'label_ids']);
    const id = identifier(value.id);
    const previous = this.db.find<{ label_ids: string[] }>('content_labels', id);
    const label_ids = this.validate(value.label_ids, previous?.label_ids);
    return this.db.save('content_labels', id, revision(value.expected_revision), { label_ids });
  }
}
