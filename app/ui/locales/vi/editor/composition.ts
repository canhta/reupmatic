import type { compositionEn } from '../../en/editor/composition';

export const compositionVi = {
  compositionCueLimit: 'Thao tác sẽ vượt 10.000 mảnh phụ đề. Giảm số phụ đề trước khi áp dụng.',
  compositionClipLimit: 'Timeline chứa tối đa {{count}} đoạn.',
  compositionDiskLow:
    'Workspace cần ít nhất 64 MiB trống cho dữ liệu tạm. Giải phóng dung lượng trước khi thử lại.',
  compositionEncoding: 'Đang ghép các đoạn đã chọn…',
  compositionTitle: 'Ghép các đoạn video',
  compositionHelp: 'Sắp xếp đoạn video, rồi chỉnh thứ tự, khoảng và tốc độ.',
  compositionSummary: '{{count}} đoạn · {{seconds}} giây · {{width}} × {{height}} · 30 fps',
  compositionSourceRange: 'Khoảng nguồn / tốc độ',
  compositionTimelineRange: 'Khoảng trong bản ghép',
  compositionIn: 'Điểm vào trong nguồn (giây)',
  compositionOut: 'Điểm ra trong nguồn (giây)',
  compositionSpeed: 'Tốc độ đoạn (×)',
  compositionApply: 'Áp dụng khoảng / tốc độ đoạn',
  compositionReload: 'Nạp lại đoạn đã áp dụng',
  compositionEarlier: 'Đưa lên trước',
  compositionLater: 'Đưa xuống sau',
  compositionSplit: 'Tách đoạn đã chọn tại vị trí phát',
  compositionJoin: 'Nối với đoạn kế tiếp',
  compositionRemove: 'Bỏ đoạn đã chọn',
  compositionJoinHelp: 'Nối cần các đoạn liền kề, cùng file và tốc độ.',
  compositionDraft: 'Bản nháp chưa áp dụng — vẫn dùng khoảng đã áp dụng lần cuối.',
  compositionStale:
    'Nội dung chỉnh sửa đã đổi. Nạp lại đoạn đã áp dụng trước khi áp dụng bản nháp này.',
  compositionInvalid: 'Chưa áp dụng. Kiểm tra khoảng và vị trí phát rồi thử lại.',
  compositionDiscard: 'Bỏ khoảng đoạn chưa áp dụng để chọn đoạn khác?',
  compositionRemoveConfirm: 'Bỏ đoạn này? File nguồn không bị ảnh hưởng.',
  compositionPreviewHelp: 'Phụ đề và bản mix cuối có trong Render đoạn mẫu.',
  compositionAiUnavailable: 'Tắt OCR và xóa chữ AI để render bản ghép.',
  compositionClock: 'Điểm vào/ra của đoạn dùng thời gian riêng của đoạn đó.',
} satisfies Record<keyof typeof compositionEn, string>;
