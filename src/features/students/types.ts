import type { StudentItem as WorkbenchStudentItem } from '../../pages/TeacherWorkbench/types'

export type StudentItem = WorkbenchStudentItem

export interface TeacherProfile {
  color: string
  primaryRole: string
  subject: string
  joinDate: string
  intro?: string
}

export type StudentRole = 'teacher' | 'manager'
export type StudentTab = 'teaching' | 'diagnosis' | 'diagnosed' | 'checkpoint'

export type StudentNavItem =
  | { type: 'list' }
  | { type: 'student'; student: StudentItem }
  | { type: 'teacher'; name: string }

export interface TeacherStudentGroups {
  teachingStudents: StudentItem[]
  diagnosisStudents: StudentItem[]
}
