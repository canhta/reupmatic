export const libraryEn = {
  libraryInUse:
    'This item is referenced by active jobs, draft posts or saved workflows. Resolve these references first. No file was deleted.',
  libraryTab: 'Library',
  downloadsTab: 'Downloads',
  libraryIntro:
    'Keep source videos and their saved projects, subtitles and exports together. Originals stay untouched.',
  libraryImport: 'Import local videos',
  libraryMode: 'Import storage',
  libraryReference: 'Reference existing files',
  libraryCopy: 'Copy into the app library',
  libraryCopyHelp:
    'Copy mode uses additional disk space. Cancelling stops before the next file; a current file finishes safely.',
  libraryDuplicates: 'When the same content exists',
  libraryReuse: 'Reuse the existing item',
  librarySeparate: 'Create a separate item',
  librarySearch: 'Search video names',
  libraryRefresh: 'Refresh library',
  libraryLoading: 'Loading the library…',
  libraryEmpty: 'No videos in your library',
  libraryEmptyHelp: 'Import local files above. No account, profile or model is required.',
  libraryNoMatches: 'No matching video names',
  libraryNoMatchesHelp: 'Change the search text. Selections are limited to the current page.',
  librarySelect: 'Select {{name}}',
  librarySelectPage: 'Select this page',
  librarySelection: '{{count}} selected on this page',
  libraryProcess: 'Prepare batch ({{count}})',
  libraryBatchHint:
    'This adds a draft to Batch & jobs. Choose an output folder and any per-video SRT before queueing.',
  libraryStatus: 'Source state',
  libraryDuration: 'Duration',
  libraryRelated: 'Related files',
  libraryDetails: 'Details',
  libraryDetailsEmpty: 'Select a video to inspect its files',
  libraryOpen: 'Open in Editor',
  libraryReveal: 'Show in folder',
  libraryRelink: 'Locate moved source',
  libraryForget: 'Remove library listing',
  libraryForgetConfirm:
    'Remove “{{name}}” from the library? {{links}} recorded related file(s) and {{jobs}} pending job(s) will stay intact. No original, managed copy, project or export is deleted. Records: {{posts}} post(s), {{pendingPosts}} draft(s), {{workflows}} workflow(s). Active references block removal.',
  libraryKnownLinks:
    'Only files saved through this item in Reupmatic are listed. External project and publishing references are not indexed.',
  libraryNoLinks:
    'No related files recorded yet. Open this item in Editor, then save a project, SRT or video.',
  librarySourcePath: 'Original location',
  libraryHash: 'Content SHA-256',
  libraryStorage: 'Storage',
  libraryImportSummary: '{{added}} imported, {{reused}} reused, {{failed}} failed.',
  libraryImporting: '{{completed}} / {{total}} files handled · {{name}}',
  libraryImportCancelled: 'Import stopped. Completed items remain in the library.',
  libraryFailedImports: 'Some files were not imported',
  libraryPage: '{{from}}–{{to}} of {{total}} items',
  libraryPrevious: 'Previous page',
  libraryNext: 'Next page',
  libraryAvailability_unchecked: 'Not checked since launch',
  libraryAvailability_available: 'Verified at last access',
  libraryAvailability_missing: 'Source unavailable',
  libraryAvailability_changed: 'Source bytes changed',
  libraryLink_project: 'Project',
  libraryLink_subtitle: 'Subtitles',
  libraryLink_export: 'Video export',
  libraryError: 'The library action failed. Your existing files have not been removed.',
  libraryUnavailable:
    'The library database is unavailable. Direct Editor opening remains available.',
  librarySourceMissing:
    'The source could not be opened. Locate the moved file or reconnect its drive.',
  librarySourceChanged:
    'The selected file contains different bytes. Existing projects are retained; choose the original or import the new content separately.',
  libraryLimit:
    'A local safety limit was reached. Import at most 100 files at a time. This is not an upgrade restriction.',
  libraryStaleOpen:
    'The editor changed while this file was loading. Your newer edits were kept; open the file again deliberately.',
  libraryBusy: 'Another library operation is still in progress.',
  downloadsUnavailable: 'Online source connectors are not connected in this build',
  downloadsUnavailableHelp:
    'No login, cookie collection or network download runs here. Import authorized local videos in Library to continue working.',
};

export const libraryVi: Record<keyof typeof libraryEn, string> = {
  libraryInUse:
    'Mục này đang được tác vụ, bài nháp hoặc quy trình đã lưu tham chiếu. Xử lý các tham chiếu trước. Không có file nào bị xóa.',
  libraryTab: 'Thư viện',
  downloadsTab: 'Tải xuống',
  libraryIntro:
    'Quản lý video gốc cùng project, phụ đề và bản xuất đã lưu. Không thay đổi file gốc.',
  libraryImport: 'Nhập video trên máy',
  libraryMode: 'Cách lưu video nhập',
  libraryReference: 'Tham chiếu file hiện có',
  libraryCopy: 'Sao chép vào thư viện ứng dụng',
  libraryCopyHelp:
    'Sao chép cần thêm dung lượng. Hủy sẽ dừng trước file kế tiếp; file đang nhập sẽ hoàn tất an toàn.',
  libraryDuplicates: 'Khi nội dung đã có',
  libraryReuse: 'Dùng lại mục hiện có',
  librarySeparate: 'Tạo mục riêng',
  librarySearch: 'Tìm theo tên video',
  libraryRefresh: 'Làm mới thư viện',
  libraryLoading: 'Đang tải thư viện…',
  libraryEmpty: 'Thư viện chưa có video',
  libraryEmptyHelp: 'Nhập file trên máy ở trên. Không cần tài khoản, profile hoặc model.',
  libraryNoMatches: 'Không có tên video phù hợp',
  libraryNoMatchesHelp: 'Đổi nội dung tìm kiếm. Chỉ chọn các mục trên trang hiện tại.',
  librarySelect: 'Chọn {{name}}',
  librarySelectPage: 'Chọn trang này',
  librarySelection: 'Đã chọn {{count}} mục trên trang này',
  libraryProcess: 'Chuẩn bị lô ({{count}})',
  libraryBatchHint:
    'Thêm bản nháp vào Xử lý lô & tác vụ. Chọn thư mục xuất và SRT riêng trước khi đưa vào hàng đợi.',
  libraryStatus: 'Trạng thái file gốc',
  libraryDuration: 'Thời lượng',
  libraryRelated: 'File liên quan',
  libraryDetails: 'Chi tiết',
  libraryDetailsEmpty: 'Chọn video để xem các file liên quan',
  libraryOpen: 'Mở trong Editor',
  libraryReveal: 'Hiện trong thư mục',
  libraryRelink: 'Tìm file gốc đã di chuyển',
  libraryForget: 'Bỏ mục khỏi thư viện',
  libraryForgetConfirm:
    'Bỏ “{{name}}” khỏi thư viện? Giữ nguyên {{links}} file liên quan đã ghi nhận và {{jobs}} tác vụ đang chờ. Không xóa file gốc, bản sao trong thư viện, project hoặc bản xuất. Tham chiếu: {{posts}} bài đăng, {{pendingPosts}} bài nháp, {{workflows}} quy trình. Chặn gỡ khi còn tham chiếu đang dùng.',
  libraryKnownLinks:
    'Chỉ liệt kê file được lưu từ mục này trong Reupmatic. Chưa lập chỉ mục project bên ngoài và các lượt đăng.',
  libraryNoLinks:
    'Chưa ghi nhận file liên quan. Mở mục này trong Editor rồi lưu project, SRT hoặc video.',
  librarySourcePath: 'Vị trí file gốc',
  libraryHash: 'SHA-256 nội dung',
  libraryStorage: 'Lưu trữ',
  libraryImportSummary: 'Đã nhập {{added}}, dùng lại {{reused}}, lỗi {{failed}}.',
  libraryImporting: 'Đã xử lý {{completed}} / {{total}} file · {{name}}',
  libraryImportCancelled: 'Đã dừng nhập. Các mục đã hoàn tất vẫn có trong thư viện.',
  libraryFailedImports: 'Một số file chưa nhập được',
  libraryPage: '{{from}}–{{to}} trên {{total}} mục',
  libraryPrevious: 'Trang trước',
  libraryNext: 'Trang sau',
  libraryAvailability_unchecked: 'Chưa kiểm tra từ khi mở ứng dụng',
  libraryAvailability_available: 'Đã xác minh ở lần truy cập gần nhất',
  libraryAvailability_missing: 'Không truy cập được file gốc',
  libraryAvailability_changed: 'Nội dung file gốc đã thay đổi',
  libraryLink_project: 'Project',
  libraryLink_subtitle: 'Phụ đề',
  libraryLink_export: 'Video đã xuất',
  libraryError: 'Thao tác thư viện thất bại. Không xóa các file hiện có.',
  libraryUnavailable:
    'Không mở được cơ sở dữ liệu thư viện. Vẫn có thể mở file trực tiếp trong Editor.',
  librarySourceMissing: 'Không mở được file gốc. Tìm lại file đã di chuyển hoặc kết nối lại ổ đĩa.',
  librarySourceChanged:
    'File được chọn có nội dung khác. Giữ nguyên các project; hãy chọn file gốc hoặc nhập nội dung mới thành mục riêng.',
  libraryLimit:
    'Đã chạm giới hạn an toàn cục bộ. Mỗi lần nhập tối đa 100 file. Đây không phải giới hạn nâng cấp gói.',
  libraryStaleOpen:
    'Editor đã thay đổi trong lúc tải file. Giữ nguyên chỉnh sửa mới; hãy chủ động mở file lại.',
  libraryBusy: 'Một thao tác thư viện khác đang thực hiện.',
  downloadsUnavailable: 'Bản này chưa nối nguồn tải trực tuyến',
  downloadsUnavailableHelp:
    'Không đăng nhập, thu thập cookie hoặc tải mạng tại đây. Nhập video trên máy mà bạn được phép sử dụng trong Thư viện để tiếp tục.',
};

const errors: Record<string, keyof typeof libraryEn> = {
  LIBRARY_IN_USE: 'libraryInUse',
  LIBRARY_UNAVAILABLE: 'libraryUnavailable',
  LIBRARY_VERSION: 'libraryUnavailable',
  SOURCE_UNAVAILABLE: 'librarySourceMissing',
  ENOENT: 'librarySourceMissing',
  SOURCE_CHANGED: 'librarySourceChanged',
  LIBRARY_ITEM_MISSING: 'librarySourceMissing',
  SELECTION_LIMIT: 'libraryLimit',
  LIBRARY_LIMIT: 'libraryLimit',
  STALE_OPERATION: 'libraryStaleOpen',
  LIBRARY_BUSY: 'libraryBusy',
  EDITOR_BUSY: 'libraryBusy',
};
export const libraryErrorKey = (code: string): keyof typeof libraryEn =>
  errors[code] ?? 'libraryError';
