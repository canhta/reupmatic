import type { libraryAssetsEn } from '../../en/library/assets';

export const libraryAssetsVi = {
  assetSearch: 'Tìm tài sản hoặc nội dung',
  assetAttach: 'Đính kèm',
  assetEmptyHelp: 'Chưa có tài sản',
  assetNoMatches: 'Không có tài sản phù hợp',
  assetDetails: 'Tài sản đang chọn',
  assetBytes: 'Kích thước theo byte',
  assetPreview: 'Xem/nghe file',
  assetCheck: 'Kiểm tra file',
  assetRelated: 'Tài sản liên quan',
  assetSubtitleReadOnly: 'Chỉ xem — không ảnh hưởng phụ đề trong Editor.',
  assetStatus_unchecked: 'Chưa kiểm tra trong lần chọn này',
  assetStatus_available: 'Nội dung khớp ở lần truy cập gần nhất',
  assetStatus_missing: 'Không truy cập được file',
  assetStatus_changed: 'Nội dung khác bản ghi',
  libraryLink_audio: 'Âm thanh',
} satisfies Record<keyof typeof libraryAssetsEn, string>;
