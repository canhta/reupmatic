import { object, text } from '../catalog/validation.js';
import { type ProcessingRecipe, parseProcessingRecipe } from '../processing/recipe.js';
import type { ProfileDocument } from './profile-contracts.js';

export function parseProfileProcessing(input: unknown): ProcessingRecipe | null {
  if (input === null) return null;
  const recipe = parseProcessingRecipe(input);
  if (recipe.inpaint?.target === 'manual' || recipe.editing?.trim) {
    throw new Error('PROFILE_MEDIA_SPECIFIC');
  }
  if (recipe.editing?.logo) {
    const editing = { ...recipe.editing };
    delete editing.logo;
    if (Object.keys(editing).length) {
      recipe.editing = editing;
    } else {
      const rest = { ...recipe };
      delete rest.editing;
      return Object.keys(rest).length ? rest : null;
    }
  }
  return recipe;
}

/** Applying a profile must not drop the project's own logo placement. */
export function applyProfileProcessing(
  profile: ProcessingRecipe | null,
  current: ProcessingRecipe | undefined,
): ProcessingRecipe | undefined {
  const logo = current?.editing?.logo;
  if (profile === null && !logo) return undefined;
  const next: ProcessingRecipe = structuredClone(profile ?? {});
  if (logo) next.editing = { ...(next.editing ?? {}), logo };
  return next;
}

export function parseProfileDocument(input: unknown): ProfileDocument {
  const value = object(input, ['format', 'name', 'notes', 'processing']);
  if (value.format !== 'reupmatic.processing-profile') {
    throw new Error('PROFILE_VERSION');
  }
  return {
    format: value.format,
    name: text(value.name, 160).trim(),
    notes: text(value.notes, 2000, true),
    processing: parseProfileProcessing(value.processing),
  };
}
