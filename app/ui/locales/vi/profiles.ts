import type { profilesEn } from '../en/profiles';

export const profilesVi = {
  profilesTitle: 'Profile xử lý dùng lại',
  profileApply: 'Áp dụng cấu hình',
  profileNoSaved:
    'Chưa có profile. Tiếp tục bằng các tùy chọn bên dưới hoặc tạo profile trong Editor.',
  profileExport: 'Xuất',
  profileExported: 'Đã xuất profile: {{name}}',
  profileImport: 'Nhập',
  profileImportedDraft: 'Đã nhập thành bản nháp — xem lại rồi lưu.',
  profileNew: 'Profile mới',
  profileEdit: 'Sửa profile xử lý',
  profileNotes: 'Ghi chú',
  profileOptional: 'Profile xử lý tùy chọn',
  profileSubtitleConflict:
    'Profile có OCR nhưng bản nháp đã có phụ đề. Chủ động bỏ phụ đề hiện tại hoặc dùng profile khác.',
  profilesEmpty: 'Chưa có profile xử lý',
  profilesNoMatches: 'Không có profile phù hợp',
  profilesCount_one: '{{count}} profile',
  profilesCount_other: '{{count}} profile',
  profilesFilterStatus: 'Trạng thái',
  profilesFilterAll: 'Tất cả',
  profilesFilterActive: 'Đang dùng',
  profilesFilterArchived: 'Đã lưu trữ',
  profilesUpdated: 'Cập nhật lần cuối',
} satisfies Record<keyof typeof profilesEn, string>;
