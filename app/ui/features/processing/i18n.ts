import { editingErrors } from '../editor/video-tools/i18n';
import type { ProcessingRecipe } from '../../../core/processing/recipe';

export const processingEn = {
  processingTitle: 'Processing recipe',
  processingExplicit: 'Optional steps run only when you render or start queued jobs. Folder rules add jobs to the same queue; selecting a step never starts processing.',
  processingOcrOption: 'Recognize source text and burn generated subtitles',
  processingInpaintOption: 'Remove source text with local LaMa',
  processingSubtitleConflict: 'Automatic OCR cannot replace an existing cue track or attached SRT. Disable OCR to keep those subtitles, or remove the attachment explicitly.',
  processingModelsHint: 'Configure local models in Settings first. Queued jobs pin the selected model fingerprints; changed models require a new submission.',
  processingReviewLimit: 'Removal working resolution: up to 960-pixel long edge at 24 fps',
  processingReviewLimitDetail: 'Removal uses bounded chunks at review resolution. Output sizing can upscale the result but cannot restore source detail. It is not lossless or temporally verified. Source audio is encoded once unless muted.',
  processingInvalid: 'Check the processing recipe, confidence and mask bounds.',
  processingModelsChanged: 'The saved model configuration has changed. Restore the original models to retry, or submit a new job with the new configuration.',
  processingCueLimit: 'Automatic OCR exceeded the bounded cue budget. Use a longer sampling interval or process a shorter selection.',
  processingSummaryEdit: 'Video/audio edits',
  processingSummaryOcr: 'OCR → generated subtitles',
  processingSummaryInpaint: 'Remove source text',
  processingSummaryBoth: 'OCR → remove source text → generated subtitles',
  processingModels: 'Checking local model fingerprints',
  processingOcr: 'Recognizing source text',
  processingInpaint: 'Removing source text',
  processingJoining: 'Joining processed video chunks',
  processingEncoding: 'Encoding video and original audio',
  processingVerifying: 'Verifying source and output',
};
export const processingVi: Record<keyof typeof processingEn, string> = {
  processingTitle: 'Cấu hình xử lý',
  processingExplicit: 'Các bước tùy chọn chỉ chạy khi bạn render hoặc chạy hàng đợi. Quy tắc folder đưa tác vụ vào cùng hàng đợi; chọn một bước không tự chạy xử lý.',
  processingOcrOption: 'Nhận diện chữ trong nguồn và gắn phụ đề được tạo vào video',
  processingInpaintOption: 'Xóa chữ trong nguồn bằng LaMa cục bộ',
  processingSubtitleConflict: 'OCR tự động không thay thế track phụ đề đang có hoặc SRT đã gắn. Tắt OCR để giữ phụ đề đó, hoặc chủ động bỏ phần đính kèm.',
  processingModelsHint: 'Cấu hình model cục bộ trong Cài đặt trước. Tác vụ đã xếp hàng giữ fingerprint model đã chọn; đổi model cần tạo tác vụ mới.',
  processingReviewLimit: 'Độ phân giải xử lý xóa chữ: cạnh dài tối đa 960 pixel, 24 fps',
  processingReviewLimitDetail: 'Xóa chữ theo từng đoạn ở độ phân giải xem thử. Kích thước xuất có thể phóng lớn nhưng không khôi phục chi tiết gốc. Không phải lossless hoặc đã xác minh ổn định theo thời gian. Âm thanh nguồn được mã hóa một lần, trừ khi tắt.',
  processingInvalid: 'Kiểm tra cấu hình xử lý, độ tin cậy và giới hạn vùng mask.',
  processingModelsChanged: 'Cấu hình model đã lưu đã thay đổi. Khôi phục model ban đầu để thử lại hoặc tạo tác vụ mới với cấu hình mới.',
  processingCueLimit: 'OCR tự động vượt giới hạn số câu hoặc dung lượng chữ. Tăng khoảng lấy mẫu hoặc xử lý khoảng ngắn hơn.',
  processingSummaryEdit: 'Chỉnh sửa hình/tiếng',
  processingSummaryOcr: 'OCR → phụ đề được tạo',
  processingSummaryInpaint: 'Xóa chữ trong nguồn',
  processingSummaryBoth: 'OCR → xóa chữ nguồn → phụ đề được tạo',
  processingModels: 'Kiểm tra fingerprint model cục bộ',
  processingOcr: 'Đang nhận diện chữ trong nguồn',
  processingInpaint: 'Đang xóa chữ trong nguồn',
  processingJoining: 'Đang ghép các đoạn video đã xử lý',
  processingEncoding: 'Đang mã hóa video và âm thanh nguồn',
  processingVerifying: 'Đang kiểm tra nguồn và đầu ra',
};

export function processingErrorKey(code: string): string | undefined {
  if (editingErrors[code]) return editingErrors[code];
  if (code === 'PROCESSING_SUBTITLE_CONFLICT') return 'processingSubtitleConflict';
  if (code === 'PROCESSING_MODELS_CHANGED') return 'processingModelsChanged';
  if (code === 'PROCESSING_CUE_LIMIT') return 'processingCueLimit';
  if (code.startsWith('INVALID_PROCESSING')) return 'processingInvalid';
  return undefined;
}
export function processingSummaryKey(recipe: ProcessingRecipe): string {
  return recipe.ocr && recipe.inpaint ? 'processingSummaryBoth'
    : recipe.ocr ? 'processingSummaryOcr' : recipe.inpaint ? 'processingSummaryInpaint' : 'processingSummaryEdit';
}
