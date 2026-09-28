import type { projectsEn } from '../en/projects';

export const projectsVi = {
  openProject: 'Mở project',
  saveProject: 'Lưu project',
  projectUnsaved: 'Có thay đổi chưa lưu',
  projectClean: 'Không có thay đổi chưa lưu',
  projectError: 'Project không hợp lệ — bản đang chỉnh không bị thay.',
  projectFontUnsupported: 'Project này dùng font không còn đi kèm. Chọn font đi kèm để tiếp tục.',
  projectMissing: 'File project bị thiếu hoặc đã di chuyển.',
} satisfies Record<keyof typeof projectsEn, string>;
