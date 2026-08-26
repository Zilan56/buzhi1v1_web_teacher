import { useEffect } from 'react'
import { useWorkbenchStore } from '../../../pages/TeacherWorkbench/store/workbenchStore'
import { findStudentById } from '../data/studentSelectors'
import type { StudentItem } from '../types'

export function useStudentTargets({
  allStudents,
  openStudent,
  openTeacher,
}: {
  allStudents: StudentItem[]
  openStudent: (student: StudentItem) => void
  openTeacher: (teacherName: string) => void
}) {
  const targetStudentId = useWorkbenchStore((state) => state.targetStudentId)
  const clearTargetStudent = useWorkbenchStore((state) => state.clearTargetStudent)
  const targetTeacherName = useWorkbenchStore((state) => state.targetTeacherName)
  const clearTargetTeacher = useWorkbenchStore((state) => state.clearTargetTeacher)

  useEffect(() => {
    if (!targetStudentId) return

    const student = findStudentById(targetStudentId, allStudents)
    if (student) {
      openStudent(student)
    }
    clearTargetStudent()
  }, [allStudents, clearTargetStudent, openStudent, targetStudentId])

  useEffect(() => {
    if (!targetTeacherName) return

    openTeacher(targetTeacherName)
    clearTargetTeacher()
  }, [clearTargetTeacher, openTeacher, targetTeacherName])
}
