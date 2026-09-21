import type { textLayersEn } from '../../en/editor/text-layers';

export const textLayersVi = {
  textConfirmImport: 'Thay toàn bộ lớp {{layer}} bằng SRT này? Các lớp văn bản khác giữ nguyên.',
  textKeepReviewed: 'Giữ bản sửa; đã duyệt nguồn',
  textKeepReviewedHelp: 'Các bản sao phụ thuộc vẫn cần được duyệt riêng.',
  textLayer_transcript: 'Bản chép lời',
  textLayer_translated: 'Bản dịch',
  textLayer_spoken: 'Nội dung đọc',
  textLayer_displayed: 'Phụ đề hiển thị',
  textEditingLayer: 'Lớp',
  textLayerLanguage: 'Ngôn ngữ',
  textLanguageUnknown: 'Chưa khai báo',
  setLayerLanguage: 'Đặt ngôn ngữ cho lớp {{layer}}',
  textLayerStale: 'Lớp nguồn đã thay đổi',
  textLayerStaleHelp: 'Văn bản của bạn vẫn được giữ — xem lại trước khi thay.',
  textCopyTitle: 'Sao chép từ lớp khác',
  textCopyHelp: 'Thay thế văn bản và thời gian của lớp {{target}}.',
  textCopyFrom: 'Sao chép từ',
  textCopyPreview: 'Xem trước thay thế',
  textCopyApply: 'Thay lớp này',
  textCopyCount:
    '{{count}} câu sẽ thay toàn bộ lớp {{target}}, bao gồm những câu hiện có ngoài bản xem trước.',
  textLayerEmpty: 'Lớp nguồn trống. Thêm văn bản hoặc chọn nguồn khác.',
  textLayerInvalid: 'Lớp văn bản không hợp lệ. Chưa thay nội dung hiện tại.',
  textLayerTooLarge: 'Lớp văn bản quá lớn (giới hạn 1 MB). Rút ngắn lại.',
} satisfies Record<keyof typeof textLayersEn, string>;
