import type { speechEn } from '../en/speech';

export const speechVi = {
  speechTitle: 'Nhận dạng giọng nói',
  speechComposition: 'Nhận dạng đoạn gốc trước khi ghép.',
  speechNoAudio:
    'Video đã chọn không có luồng âm thanh. Nhập bản chép lời hoặc chọn video có âm thanh.',
  speechScope: 'Phạm vi nhận dạng',
  speechSample: 'Khoảng mẫu hiện tại',
  speechFull: 'Toàn bộ video gốc',
  speechEngine: 'Bộ nhận dạng',
  speechEngineSingle: 'Bộ nhận dạng: {{engine}}',
  speechChooseLanguage: 'Chọn ngôn ngữ nói trong nguồn.',
  speechStart: 'Nhận dạng giọng nói',
  speechDecoding: 'Đang chuẩn bị âm thanh nguồn',
  speechRecognizing: 'Đang nhận dạng giọng nói',
  speechDraft: 'Kết quả chép lời — chưa áp dụng',
  speechReplaceHelp:
    '{{count}} câu nhận dạng. Áp dụng sẽ thay toàn bộ bản chép lời, kể cả nội dung ngoài khoảng này.',
  speechResultInfo: '{{language}} · nguồn {{start}}–{{end}} giây · {{engine}}',
  speechEmpty: 'Không tìm thấy lời nói — chưa thay gì. Thử khoảng khác.',
  speechStaleHelp: 'Tài liệu đã đổi — xem lại trước khi thay bản chép lời.',
  speechReview: 'Duyệt',
  speechApply: 'Thay bản chép lời',
  speechDiscard: 'Bỏ kết quả',
  speechMissing: 'Chưa cấu hình mô hình nhận dạng cục bộ.',
  speechRuntimeMissing: 'Chưa cài bộ thư viện nhận dạng cục bộ.',
  speechModelChanged: 'Model đã đổi hoặc lỗi xác minh. Khôi phục hoặc chọn lại.',
  speechLanguageMissing: 'Model không hỗ trợ ngôn ngữ này. Chọn model khác.',
  speechInvalid: 'Yêu cầu không hợp lệ — văn bản vẫn được giữ. Kiểm tra lựa chọn.',
  speechLimit: 'Yêu cầu quá dài. Chọn khoảng ngắn hơn.',
  speechDiskLow: 'Không đủ dung lượng. Giải phóng rồi thử lại.',
  speechFailed: 'Nhận dạng thất bại. Kiểm tra thư viện và mô hình rồi thử lại.',
} satisfies Record<keyof typeof speechEn, string>;
