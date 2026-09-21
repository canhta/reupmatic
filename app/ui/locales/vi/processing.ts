import type { processingEn } from '../en/processing';

export const processingVi = {
  processingTitle: 'Cấu hình xử lý',
  processingExplicit: 'Chạy khi bạn render hoặc chạy hàng đợi.',
  processingOcrOption: 'Nhận diện chữ trong nguồn và gắn phụ đề được tạo vào video',
  processingInpaintOption: 'Xoá chữ trên hình',
  processingSubtitleConflict: 'OCR không thay được phụ đề hiện có. Tắt OCR hoặc gỡ phụ đề trước.',
  processingModelsHint: 'Đổi model sau khi đã xếp hàng cần gửi lại tác vụ mới.',
  processingInvalid: 'Kiểm tra cấu hình xử lý, độ tin cậy và giới hạn vùng mask.',
  processingProjectMedia: 'Logo dùng ảnh từ dự án. Hãy gỡ logo trước khi dùng cấu hình này ở đây.',
  processingModelsChanged: 'Cấu hình model đã đổi. Khôi phục hoặc gửi tác vụ mới.',
  processingCueLimit: 'Quá nhiều câu OCR. Dùng khoảng lấy mẫu dài hơn hoặc đoạn ngắn hơn.',
  processingSummaryEdit: 'Chỉnh sửa hình/tiếng',
  processingSummaryOcr: 'OCR → phụ đề được tạo',
  processingSummaryInpaint: 'Xóa chữ trong nguồn',
  processingSummaryBoth: 'OCR → xóa chữ nguồn → phụ đề được tạo',
  processingOcr: 'Đang nhận diện chữ trong nguồn',
  processingInpaint: 'Đang xóa chữ trong nguồn',
  processingJoining: 'Đang ghép các đoạn video đã xử lý',
  processingEncoding: 'Đang mã hóa video và âm thanh nguồn',
  processingVerifying: 'Đang kiểm tra nguồn và đầu ra',
} satisfies Record<keyof typeof processingEn, string>;
