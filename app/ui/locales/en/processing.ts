export const processingEn = {
  processingTitle: 'Processing recipe',
  processingExplicit: 'Runs when you render or start queued jobs.',
  processingOcrOption: 'Recognize source text and burn generated subtitles',
  processingSubtitleConflict:
    "OCR can't replace existing subtitles. Disable OCR or remove them first.",
  processingModelsHint: 'Changing models after queueing needs a new submission.',
  processingInvalid: 'Check the processing recipe, confidence and mask bounds.',
  processingProjectMedia:
    'The logo uses an image from its project. Remove the logo before using this recipe here.',
  processingModelsChanged: 'Model configuration changed. Restore it or submit a new job.',
  processingCueLimit: 'Too many OCR cues. Use a longer interval or shorter selection.',
  processingSummaryEdit: 'Video/audio edits',
  processingSummaryOcr: 'OCR → generated subtitles',
  processingOcr: 'Recognizing source text',
  processingEncoding: 'Encoding video and original audio',
  processingVerifying: 'Verifying source and output',
} as const;
