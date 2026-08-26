import { useMemo, useState } from 'react'
import { getDefaultTabByRole } from '../constants/studentTabs'
import type { StudentItem, StudentNavItem, StudentRole, StudentTab } from '../types'

export function useStudentBrowserState() {
  const [role, setRole] = useState<StudentRole>('teacher')
  const [tab, setTab] = useState<StudentTab>(getDefaultTabByRole('teacher'))
  const [stack, setStack] = useState<StudentNavItem[]>([{ type: 'list' }])

  const current = useMemo(() => stack[stack.length - 1], [stack])

  function switchRole(nextRole: StudentRole) {
    setRole(nextRole)
    setTab(getDefaultTabByRole(nextRole))
  }

  function pushStudent(student: StudentItem) {
    setStack((items) => [...items, { type: 'student', student }])
  }

  function pushTeacher(name: string) {
    setStack((items) => [...items, { type: 'teacher', name }])
  }

  function resetToStudent(student: StudentItem) {
    setStack([{ type: 'list' }, { type: 'student', student }])
  }

  function resetToTeacher(name: string) {
    setStack([{ type: 'list' }, { type: 'teacher', name }])
  }

  function pop() {
    setStack((items) => (items.length > 1 ? items.slice(0, -1) : items))
  }

  return {
    role,
    tab,
    current,
    switchRole,
    setTab,
    pushStudent,
    pushTeacher,
    resetToStudent,
    resetToTeacher,
    pop,
  }
}
