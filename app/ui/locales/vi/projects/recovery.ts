import type { recoveryEn } from '../../en/projects/recovery';

export const recoveryVi = {
  recoveryIdle: 'Phục hồi đã sẵn sàng',
  recoveryWaiting: 'Thay đổi đang chờ tự lưu cục bộ…',
  recoverySaving: 'Đang lưu bản nháp phục hồi…',
  recoverySaved: 'Đã lưu bản nháp phục hồi cục bộ',
  recoveryProjectSaved: 'Đã lưu project và dọn bản nháp tương ứng',
  recoveryFailed: 'Chưa tự lưu được thay đổi mới nhất',
  recoveryFailureHelp: 'Bản nháp đã lưu vẫn còn — sửa giá trị rồi thử lại.',
  recoveryRetry: 'Thử tự lưu lại',
  recoveryDamaged: 'Không đọc được bản nháp',
  recoveryOpen: 'Mở bản sao phục hồi',
  recoveryDiscard: 'Bỏ bản nháp',
  recoveredBadge: 'Đã khôi phục',
  recoveryInvalid: 'Yêu cầu phục hồi không hợp lệ.',
  recoveryCorrupt: 'Bản nháp phục hồi không đọc được. Bỏ nó và lưu bản mới.',
  recoveryConflict: 'Bản nháp đã thay đổi kể từ khi hiện danh sách. Mở lại danh sách rồi thử lại.',
  recoveryMissing: 'Bản nháp phục hồi không còn tồn tại.',
  recoveryVersion: 'Dữ liệu phục hồi thuộc phiên bản không hỗ trợ và cần đặt lại.',
  recoveryUnavailable: 'Phục hồi hiện không khả dụng. Khởi động lại ứng dụng rồi thử lại.',
  recoverySourceConflict: 'Bản nháp này thuộc video gốc khác.',
} satisfies Record<keyof typeof recoveryEn, string>;
