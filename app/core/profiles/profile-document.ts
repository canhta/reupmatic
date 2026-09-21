import { object, text } from '../catalog/validation.js';
import { type ProcessingRecipe, parseProcessingRecipe } from '../processing/recipe.js';
import type { ProfileDocument } from './profile-contracts.js';

export function parseProfileProcessing(input: unknown): ProcessingRecipe | null {
  if (input === null) return null;
  const recipe = parseProcessingRecipe(input);
  if (recipe.inpaint?.target === 'manual' || recipe.editing?.trim) {
    throw new Error('PROFILE_MEDIA_SPECIFIC');
  }
  // The logo is per-project: its image is project media and profiles never carry
  // project media (D-63), so a saved profile omits the placement entirely rather
  // than keeping a placement that could only render nothing.
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

/** Applies a saved profile to the live recipe, leaving the project's own logo
 *  placement untouched: profiles carry no logo, so applying one must not drop it. */
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
