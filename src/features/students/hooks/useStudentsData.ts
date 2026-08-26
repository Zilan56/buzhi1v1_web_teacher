import { useMemo } from 'react'
import { useWorkbenchStore } from '../../../pages/TeacherWorkbench/store/workbenchStore'
import { getAllStudents, getStudentsForTab } from '../data/studentSelectors'
import type { StudentTab } from '../types'

export function useStudentsData(tab: StudentTab) {
  const apiStudents = useWorkbenchStore((state) => state.students)

  const allStudents = useMemo(() => getAllStudents(apiStudents), [apiStudents])
  const students = useMemo(() => getStudentsForTab(tab, apiStudents), [apiStudents, tab])

  return {
    apiStudents,
    allStudents,
    students,
  }
}
