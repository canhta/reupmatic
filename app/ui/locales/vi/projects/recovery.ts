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
} satisfies Record<keyof typeof recoveryEn, string>;
