export const profilesEn = {
  profileTrimExcluded:
    'Copied reusable settings only. Source-specific trim is excluded; check manual masks before saving.',
  profilesTitle: 'Reusable processing profiles',
  profilesHelp:
    'Optional reusable framing, color, speed, source-audio, OCR and automatic text-removal settings. Clip trim and manual removal masks are not reusable. No video, cues, destination or model file is embedded.',
  profileApply: 'Apply settings',
  profileApplyHelp:
    'Apply copies settings into this draft. It does not run a job; later profile edits do not change this copy.',
  profileNoSaved:
    'No saved profiles. Continue with the controls below, or create a profile in Editor. A profile is never required.',
  profileCopyEditor: 'Copy current Editor processing settings',
  profileExport: 'Export profile file',
  profileExported: 'Profile exported: {{name}}',
  profileImport: 'Import profile file',
  profileImportedDraft:
    'Imported into an unsaved draft. Review and save; no media processing has started.',
  profileMediaSpecific:
    'Manual mask geometry belongs to a video, not a reusable profile. Choose automatic text detection or disable removal.',
  profileNew: 'Create processing profile',
  profileEdit: 'Edit processing profile',
  profileNotes: 'Notes',
  profileOptional: 'Optional processing profile',
  profileSubtitleConflict:
    'This profile includes OCR, but the draft already has subtitles. Remove the existing track explicitly or use another profile.',
  profilesEmpty: 'No processing profiles',
  profilesEmptyHelp: 'Create reusable settings here. Editing and export work without a profile.',
};

export const profilesVi: Record<keyof typeof profilesEn, string> = {
  profileTrimExcluded:
    'Chỉ sao chép cấu hình dùng lại; không sao chép trim của nguồn. Kiểm tra mask thủ công trước khi lưu.',
  profilesTitle: 'Profile xử lý dùng lại',
  profilesHelp:
    'Cấu hình dùng lại, không bắt buộc: khung hình, màu sắc, tốc độ, âm thanh nguồn, OCR và xóa chữ tự động. Không dùng chung trim riêng của clip hoặc mask xóa thủ công. Không nhúng video, câu phụ đề, đích xuất hoặc file model.',
  profileApply: 'Áp dụng cấu hình',
  profileApplyHelp:
    'Áp dụng sao chép cấu hình vào bản nháp. Không chạy tác vụ; sửa profile sau đó không thay đổi bản sao này.',
  profileNoSaved:
    'Chưa có profile. Tiếp tục bằng các tùy chọn bên dưới hoặc tạo profile trong Editor. Không bắt buộc dùng profile.',
  profileCopyEditor: 'Sao chép cấu hình xử lý của Editor',
  profileExport: 'Xuất file profile',
  profileExported: 'Đã xuất profile: {{name}}',
  profileImport: 'Nhập file profile',
  profileImportedDraft: 'Đã nhập thành bản nháp chưa lưu. Kiểm tra rồi lưu; chưa xử lý media.',
  profileMediaSpecific:
    'Vùng mask thủ công thuộc về video, không thuộc profile dùng chung. Chọn phát hiện chữ tự động hoặc tắt xóa chữ.',
  profileNew: 'Tạo profile xử lý',
  profileEdit: 'Sửa profile xử lý',
  profileNotes: 'Ghi chú',
  profileOptional: 'Profile xử lý tùy chọn',
  profileSubtitleConflict:
    'Profile có OCR nhưng bản nháp đã có phụ đề. Chủ động bỏ phụ đề hiện tại hoặc dùng profile khác.',
  profilesEmpty: 'Chưa có profile xử lý',
  profilesEmptyHelp:
    'Tạo cấu hình dùng lại tại đây. Có thể chỉnh sửa và xuất mà không dùng profile.',
};
