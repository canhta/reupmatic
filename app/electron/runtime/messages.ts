import type { Language } from './workspace-lifecycle.js';

export interface QuitMessages {
  recoveryFailedTitle: string;
  recoveryFailedDetail: string;
  recoveryFailedStay: string;
  recoveryFailedQuit: string;
  runningWork: string;
  quitCleanTitle: string;
  quitCleanStay: string;
  quitCleanQuit: string;
  quitDirtyTitle: string;
  quitDirtyDetail: string;
  quitDirtyDontSave: string;
  quitDirtyCancel: string;
  quitDirtySave: string;
}

const quitEn: QuitMessages = {
  recoveryFailedTitle: "The latest draft couldn't be saved.",
  recoveryFailedDetail:
    'Quitting keeps earlier saved drafts, but your newest changes will be lost.',
  recoveryFailedStay: 'Stay',
  recoveryFailedQuit: 'Quit without saving',
  runningWork: 'Work still in progress will stop.',
  quitCleanTitle: 'Quit Reupmatic?',
  quitCleanStay: 'Cancel',
  quitCleanQuit: 'Quit',
  quitDirtyTitle: 'Save your changes before quitting?',
  quitDirtyDetail: "Your changes will be lost if you don't save them.",
  quitDirtyDontSave: "Don't Save",
  quitDirtyCancel: 'Cancel',
  quitDirtySave: 'Save',
};

const quitVi: QuitMessages = {
  recoveryFailedTitle: 'Chưa lưu được bản nháp mới nhất.',
  recoveryFailedDetail:
    'Thoát vẫn giữ các bản nháp đã lưu trước đó, nhưng thay đổi mới nhất sẽ mất.',
  recoveryFailedStay: 'Ở lại',
  recoveryFailedQuit: 'Thoát không lưu',
  runningWork: 'Công việc đang xử lý sẽ dừng lại.',
  quitCleanTitle: 'Thoát Reupmatic?',
  quitCleanStay: 'Huỷ',
  quitCleanQuit: 'Thoát',
  quitDirtyTitle: 'Lưu các thay đổi trước khi thoát?',
  quitDirtyDetail: 'Thay đổi sẽ mất nếu bạn không lưu.',
  quitDirtyDontSave: 'Không lưu',
  quitDirtyCancel: 'Huỷ',
  quitDirtySave: 'Lưu',
};

export function quitMessages(language: Language): QuitMessages {
  return language === 'vi' ? quitVi : quitEn;
}

export interface MenuMessages {
  appAbout: string;
  appSettings: string;
  appHide: string;
  appHideOthers: string;
  appUnhide: string;
  appQuit: string;
  file: string;
  fileNewProject: string;
  fileOpenProject: string;
  fileOpenRecent: string;
  fileOpenRecentEmpty: string;
  fileImportMedia: string;
  fileSaveProject: string;
  fileSaveProjectAs: string;
  fileExport: string;
  fileExportSubtitles: string;
  fileSettings: string;
  fileQuit: string;
  edit: string;
  editUndo: string;
  editRedo: string;
  editCut: string;
  editCopy: string;
  editPaste: string;
  editSelectAll: string;
  view: string;
  viewReload: string;
  viewResetZoom: string;
  viewZoomIn: string;
  viewZoomOut: string;
  viewToggleFullScreen: string;
  editorMenu: string;
  editorOpenJobs: string;
  sources: string;
  sourcesImportLocalFile: string;
  automation: string;
  automationNewWorkflow: string;
  automationViewRunHistory: string;
  channels: string;
  channelsNewPost: string;
  windowMenu: string;
  help: string;
  helpAbout: string;
}

const menuEn: MenuMessages = {
  appAbout: 'About',
  appSettings: 'Settings…',
  appHide: 'Hide',
  appHideOthers: 'Hide Others',
  appUnhide: 'Show All',
  appQuit: 'Quit',
  file: 'File',
  fileNewProject: 'New Project',
  fileOpenProject: 'Open Project…',
  fileOpenRecent: 'Open Recent',
  fileOpenRecentEmpty: 'No Recent Items',
  fileImportMedia: 'Import Media…',
  fileSaveProject: 'Save Project',
  fileSaveProjectAs: 'Save Project As…',
  fileExport: 'Export…',
  fileExportSubtitles: 'Export Subtitles…',
  fileSettings: 'Settings…',
  fileQuit: 'Quit',
  edit: 'Edit',
  editUndo: 'Undo',
  editRedo: 'Redo',
  editCut: 'Cut',
  editCopy: 'Copy',
  editPaste: 'Paste',
  editSelectAll: 'Select All',
  view: 'View',
  viewReload: 'Reload',
  viewResetZoom: 'Actual Size',
  viewZoomIn: 'Zoom In',
  viewZoomOut: 'Zoom Out',
  viewToggleFullScreen: 'Toggle Full Screen',
  editorMenu: 'Editor',
  editorOpenJobs: 'Open Jobs & Queue',
  sources: 'Sources',
  sourcesImportLocalFile: 'Import Local File…',
  automation: 'Automation',
  automationNewWorkflow: 'New Workflow',
  automationViewRunHistory: 'View Run History',
  channels: 'Channels',
  channelsNewPost: 'New Post…',
  windowMenu: 'Window',
  help: 'Help',
  helpAbout: 'About',
};

const menuVi: MenuMessages = {
  appAbout: 'Giới thiệu',
  appSettings: 'Cài đặt…',
  appHide: 'Ẩn',
  appHideOthers: 'Ẩn ứng dụng khác',
  appUnhide: 'Hiện tất cả',
  appQuit: 'Thoát',
  file: 'Tệp',
  fileNewProject: 'Dự án mới',
  fileOpenProject: 'Mở dự án…',
  fileOpenRecent: 'Mở gần đây',
  fileOpenRecentEmpty: 'Không có mục gần đây',
  fileImportMedia: 'Nhập phương tiện…',
  fileSaveProject: 'Lưu dự án',
  fileSaveProjectAs: 'Lưu dự án dưới dạng…',
  fileExport: 'Xuất…',
  fileExportSubtitles: 'Xuất phụ đề…',
  fileSettings: 'Cài đặt…',
  fileQuit: 'Thoát',
  edit: 'Chỉnh sửa',
  editUndo: 'Hoàn tác',
  editRedo: 'Làm lại',
  editCut: 'Cắt',
  editCopy: 'Sao chép',
  editPaste: 'Dán',
  editSelectAll: 'Chọn tất cả',
  view: 'Hiển thị',
  viewReload: 'Tải lại',
  viewResetZoom: 'Kích thước gốc',
  viewZoomIn: 'Phóng to',
  viewZoomOut: 'Thu nhỏ',
  viewToggleFullScreen: 'Toàn màn hình',
  editorMenu: 'Editor',
  editorOpenJobs: 'Mở hàng đợi công việc',
  sources: 'Nguồn',
  sourcesImportLocalFile: 'Nhập file cục bộ…',
  automation: 'Tự động hoá',
  automationNewWorkflow: 'Quy trình mới',
  automationViewRunHistory: 'Xem lịch sử chạy',
  channels: 'Kênh',
  channelsNewPost: 'Bài đăng mới…',
  windowMenu: 'Cửa sổ',
  help: 'Trợ giúp',
  helpAbout: 'Giới thiệu',
};

export function menuMessages(language: Language): MenuMessages {
  return language === 'vi' ? menuVi : menuEn;
}
