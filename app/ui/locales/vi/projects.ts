import type { projectsEn } from '../en/projects';

export const projectsVi = {
  openProject: 'Mở project',
  saveProject: 'Lưu project',
  projectUnsaved: 'Có thay đổi chưa lưu',
  projectClean: 'Không có thay đổi chưa lưu',
  projectError: 'Project không hợp lệ — bản đang chỉnh không bị thay.',
} satisfies Record<keyof typeof projectsEn, string>;
