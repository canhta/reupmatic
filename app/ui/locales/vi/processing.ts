import type { processingEn } from '../en/processing';

export const processingVi = {
  processingTitle: 'Cấu hình xử lý',
  processingActions: 'Thao tác cấu hình',
  processingResetStyle: 'Đặt lại định dạng',
  processingOcrTitle: 'Chữ trên màn hình',
  processingSubtitleConflict: 'Đã có phụ đề',
  processingInvalid: 'Kiểm tra cấu hình xử lý, độ tin cậy và giới hạn vùng mask.',
  processingProjectMedia: 'Logo dùng ảnh từ dự án. Hãy gỡ logo trước khi dùng cấu hình này ở đây.',
  processingModelsChanged: 'Cấu hình model đã đổi. Khôi phục hoặc gửi tác vụ mới.',
  processingCueLimit: 'Quá nhiều câu OCR. Dùng khoảng lấy mẫu dài hơn hoặc đoạn ngắn hơn.',
  processingSummaryEdit: 'Chỉnh sửa hình/tiếng',
  processingSummaryOcr: 'OCR → phụ đề được tạo',
  processingOcr: 'Đang nhận diện chữ trong nguồn',
  processingOcrRefine: 'Đang tinh chỉnh thời gian phụ đề',
  processingEncoding: 'Đang mã hóa video và âm thanh nguồn',
  processingVerifying: 'Đang kiểm tra nguồn và đầu ra',
} satisfies Record<keyof typeof processingEn, string>;
