import type { StudentRole, StudentTab } from '../types'

export const roleItems: Array<{ key: StudentRole; label: string }> = [
  { key: 'teacher', label: '老师' },
  { key: 'manager', label: '学管' },
]

export const teacherTabItems: Array<{ key: StudentTab; label: string }> = [
  { key: 'teaching', label: '我的带教' },
  { key: 'diagnosis', label: '我的诊断' },
]

export const managerTabItems: Array<{ key: StudentTab; label: string }> = [
  { key: 'diagnosed', label: '诊断学员' },
  { key: 'checkpoint', label: '卡点学员' },
]

export function getDefaultTabByRole(role: StudentRole): StudentTab {
  return role === 'teacher' ? 'teaching' : 'diagnosed'
}

export function getTabItemsByRole(role: StudentRole) {
  return role === 'teacher' ? teacherTabItems : managerTabItems
}
