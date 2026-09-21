import type { Overrides } from '@astryxdesign/core/i18n';

export const componentMessages: Overrides = {
  vi: {
    '@astryx.alertDialog.cancel': 'Hủy',
    '@astryx.button.loading': 'Đang xử lý',
    '@astryx.dialog.close': 'Đóng',
    // Rendered beside every required/optional field label. Astryx ships the Vietnamese
    // strings, but overrides here are an allowlist: a key absent from this object renders
    // the English default even on a Vietnamese screen.
    '@astryx.field.required': 'Bắt buộc',
    '@astryx.field.optional': 'Tùy chọn',
    '@astryx.selector.placeholder': 'Chọn một mục',
    '@astryx.selector.searchPlaceholder': 'Tìm kiếm…',
    '@astryx.selector.searchOptions': 'Tìm lựa chọn',
    '@astryx.selector.empty': 'Chưa có lựa chọn',
    '@astryx.selector.emptySearchResults': 'Không tìm thấy lựa chọn',
    '@astryx.selector.resultCount': '{count} lựa chọn',
    '@astryx.selector.clearLabel': 'Xóa lựa chọn {label}',
    '@astryx.textInput.clearLabel': 'Xóa {label}',
    '@astryx.numberInput.clearLabel': 'Xóa {label}',
    '@astryx.numberInput.incrementLabel': 'Tăng {label}',
    '@astryx.numberInput.decrementLabel': 'Giảm {label}',
    '@astryx.input.statusButton.warning': 'Xem cảnh báo',
    '@astryx.input.statusButton.error': 'Xem lỗi',
    '@astryx.input.statusButton.success': 'Xem kết quả',
    '@astryx.table.label': 'Bảng dữ liệu',
    '@astryx.stepper.label': 'Tiến trình',
    '@astryx.stepper.previousStep': 'Bước trước',
    '@astryx.stepper.nextStep': 'Bước tiếp theo',
    '@astryx.step.goToStep': 'Đến bước {stepNumber}: {label}',
    '@astryx.step.goToStepWithStatus': 'Đến bước {stepNumber}: {label}, {status}',
    '@astryx.step.status.completed': 'hoàn thành',
    '@astryx.step.status.warning': 'cảnh báo',
    '@astryx.step.status.error': 'lỗi',
    '@astryx.step.optional': 'Tùy chọn',
    '@astryx.pagination.label': 'Phân trang',
    '@astryx.pagination.previous': 'Đến trang trước',
    '@astryx.pagination.next': 'Đến trang sau',
    '@astryx.pagination.count': '{from, number}–{to, number} trên {total, number}',
    '@astryx.pagination.pageOfTotal': 'Trang {current, number} trên {total, number}',
    '@astryx.table.noData': 'Không có dữ liệu',
    '@astryx.table.filter.allPlaceholder': 'Tất cả',
    '@astryx.table.filter.reset': 'Đặt lại',
    '@astryx.table.filter.apply': 'Áp dụng',
    '@astryx.table.selection.selectAllRows': 'Chọn tất cả các dòng',
    '@astryx.table.selection.selectRow': 'Chọn dòng',
    '@astryx.table.selection.selectRowNamed': 'Chọn {label}',
    '@astryx.table.sort.ascending': 'Sắp xếp tăng dần',
    '@astryx.table.sort.descending': 'Sắp xếp giảm dần',
    '@astryx.table.sort.clear': 'Bỏ sắp xếp',
    '@astryx.table.sort.direction.ascending': 'tăng dần',
    '@astryx.table.sort.direction.descending': 'giảm dần',
    '@astryx.table.sort.sortBy': 'Sắp xếp theo {label}',
    '@astryx.table.sort.sortedBy': 'Sắp xếp theo {label}, đã sắp xếp {direction}',
    '@astryx.table.sort.sortedByWithPriority':
      'Sắp xếp theo {label}, đã sắp xếp {direction}, ưu tiên {rank, number} trên {total, number}',
    '@astryx.table.pagination.label': 'Phân trang bảng',
    '@astryx.table.pagination.labelAbove': '{label} (trên)',
    '@astryx.table.pagination.labelBelow': '{label} (dưới)',
    '@astryx.tableFiltering.filterByColumn': 'Lọc {header}',
    // Found via the failed-import Banner (Library import, ticket 01): its
    // collapse/expand toggle stayed "Expand" in a Vietnamese session even
    // though Astryx's own vi-VN.json has this key — only overrides declared
    // here actually reach InternationalizationProvider, same gap as the
    // stepper keys above.
    '@astryx.banner.expand': 'Mở rộng',
    '@astryx.banner.collapse': 'Thu gọn',
    // Surfaces the re-layout added: the header project switcher and the clip /
    // Project media context and overflow menus. Each passes its own visible
    // label; these are the component defaults behind them.
    '@astryx.contextMenu.label': 'Menu ngữ cảnh',
    '@astryx.moreMenu.label': 'Thêm thao tác',
    '@astryx.dropdownMenu.label': 'Menu',
  },
};
