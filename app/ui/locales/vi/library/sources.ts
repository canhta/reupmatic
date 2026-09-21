import type { librarySourcesEn } from '../../en/library/sources';

export const librarySourcesVi = {
  downloadsConnectionTitle: 'Douyin',
  downloadsStatusConnected: 'Đã kết nối',
  downloadsStatusNeedsReconnect: 'Cần kết nối lại',
  downloadsStatusNotConnected: 'Chưa kết nối',
  downloadsNeedsReconnectHelp:
    'Phiên đăng nhập Douyin không còn hiệu lực. Hãy kết nối lại để tiếp tục dùng.',
  downloadsConnect: 'Kết nối Douyin',
  downloadsReconnect: 'Kết nối lại',
  downloadsDisconnect: 'Ngắt kết nối',
  downloadsDisconnectConfirm: 'Ngắt kết nối Douyin? Bạn có thể kết nối lại bất cứ lúc nào.',
  downloadsSessionUnavailable: 'Hiện chưa dùng được kết nối Douyin.',
  downloadsSessionError: 'Kết nối Douyin gặp sự cố. Hãy thử lại.',
  downloadsAdvanced: 'Dán cookie thay thế',
  downloadsCookieDialogTitle: 'Dán cookie của bạn',
  downloadsCookieLabel: 'Cookie Douyin',
  downloadsCookieHelp: 'Dán cookie từ trình duyệt mà bạn đã đăng nhập Douyin.',
  downloadsCookieSubmit: 'Dùng cookie này',
  downloadsCookieCancel: 'Huỷ',
  downloadsCookiesUnreadable: 'Nội dung này không giống cookie. Hãy dán toàn bộ chuỗi cookie.',
  downloadsCookiesMissingIdentity:
    'Cookie này chưa đăng nhập Douyin. Hãy đăng nhập trước rồi sao chép lại.',
} satisfies Record<keyof typeof librarySourcesEn, string>;
