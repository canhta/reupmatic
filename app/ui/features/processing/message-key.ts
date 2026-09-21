import type { ProcessingRecipe } from '../../../core/processing/recipe';
import type { MessageKey } from '../../locales/message-key';
import { editingErrors } from '../editor/video-tools/error-message';

export function processingErrorKey(code: string): MessageKey | undefined {
  if (editingErrors[code]) return editingErrors[code];
  if (code === 'PROCESSING_PROJECT_MEDIA') return 'processingProjectMedia';
  if (code === 'PROCESSING_SUBTITLE_CONFLICT') return 'processingSubtitleConflict';
  if (code === 'PROCESSING_MODELS_CHANGED') return 'processingModelsChanged';
  if (code === 'PROCESSING_CUE_LIMIT') return 'processingCueLimit';
  if (code.startsWith('INVALID_PROCESSING')) return 'processingInvalid';
  return undefined;
}
export function processingSummaryKey(recipe: ProcessingRecipe): MessageKey {
  return recipe.ocr && recipe.inpaint
    ? 'processingSummaryBoth'
    : recipe.ocr
      ? 'processingSummaryOcr'
      : recipe.inpaint
        ? 'processingSummaryInpaint'
        : 'processingSummaryEdit';
}
