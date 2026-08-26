import { useWorkbenchStore } from '../../../pages/TeacherWorkbench/store/workbenchStore'
import type { StudentItem, StudentTab, TeacherProfile, TeacherStudentGroups } from '../types'

const TEACHER_COLORS = ['#07c160', '#5fbf84', '#6fbf9a', '#5fa8d3', '#8a7bd1', '#63c1c7']

function colorFromName(name: string) {
  const seed = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return TEACHER_COLORS[seed % TEACHER_COLORS.length]
}

function matchTeacherRole(role: string | undefined, expected: 'teaching' | 'diagnosis') {
  if (!role) return false
  if (expected === 'teaching' && role === 'coach') return true
  if (expected === 'diagnosis' && role === 'diagnosis') return true
  if (expected === 'teaching') return role.includes('带教')
  return role.includes('诊断')
}

function roleLabel(role: string | undefined) {
  if (!role) return '老师'
  if (role === 'coach') return '带教老师'
  if (role === 'diagnosis') return '诊断老师'
  if (role === 'drill') return '刷题老师'
  if (role === 'manager') return '学管老师'
  if (role === 'principal') return '校长'
  return role
}

export function getAllStudents(apiStudents: StudentItem[]) {
  return apiStudents
}

export function getStudentsForTab(tab: StudentTab, apiStudents: StudentItem[]) {
  const { teacherName, studentDetailMetaMap } = useWorkbenchStore.getState()
  if (apiStudents.length === 0) return []

  if (tab === 'teaching') {
    return apiStudents
  }

  if (tab === 'diagnosis') {
    return apiStudents.filter((student) => {
      const teachers = studentDetailMetaMap[student.id]?.teamTeachers ?? []
      return teachers.some((teacher) =>
        teacher.name === teacherName && matchTeacherRole(teacher.role, tab),
      )
    })
  }

  return apiStudents
}

export function findStudentById(studentId: string, students: StudentItem[]) {
  return students.find((student) => student.id === studentId) ?? null
}

export function getTeacherProfile(teacherName: string): TeacherProfile | undefined {
  if (!teacherName) return undefined

  const { students, studentDetailMetaMap } = useWorkbenchStore.getState()
  const relatedStudents = students.filter((student) =>
    (studentDetailMetaMap[student.id]?.teamTeachers ?? []).some((teacher) => teacher.name === teacherName),
  )
  const teamTeachers = relatedStudents.flatMap((student) => studentDetailMetaMap[student.id]?.teamTeachers ?? [])
  const roleCounts = new Map<string, number>()
  const subjectCounts = new Map<string, number>()

  teamTeachers.forEach((teacher) => {
    if (teacher.name === teacherName && teacher.role) {
      const label = roleLabel(teacher.role)
      roleCounts.set(label, (roleCounts.get(label) ?? 0) + 1)
    }
  })
  relatedStudents.forEach((student) => {
    if (student.subject) {
      subjectCounts.set(student.subject, (subjectCounts.get(student.subject) ?? 0) + 1)
    }
  })

  const primaryRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '老师'
  const subject = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const joinDate = relatedStudents
    .map((student) => studentDetailMetaMap[student.id]?.joinDate)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? '-'

  return {
    color: colorFromName(teacherName),
    primaryRole,
    subject,
    joinDate,
    intro: relatedStudents.length > 0 ? `${teacherName} 当前关联 ${relatedStudents.length} 名学生。` : undefined,
  }
}

export function getTeacherContactId(teacherName: string) {
  const { chatContacts } = useWorkbenchStore.getState()
  return chatContacts.find((contact) => contact.contactType === 'colleague' && contact.name === teacherName)?.id
}

export function getTeacherStudentGroups(teacherName: string): TeacherStudentGroups {
  const { students, studentDetailMetaMap } = useWorkbenchStore.getState()

  const teachingStudents = students.filter((student) =>
    (studentDetailMetaMap[student.id]?.teamTeachers ?? []).some(
      (teacher) => teacher.name === teacherName && matchTeacherRole(teacher.role, 'teaching'),
    ),
  )

  const diagnosisStudents = students.filter((student) =>
    (studentDetailMetaMap[student.id]?.teamTeachers ?? []).some(
      (teacher) => teacher.name === teacherName && matchTeacherRole(teacher.role, 'diagnosis'),
    ),
  )

  return { teachingStudents, diagnosisStudents }
}

export function getTeacherStudentCount(groups: TeacherStudentGroups) {
  return new Set([...groups.teachingStudents, ...groups.diagnosisStudents].map((student) => student.id)).size
}
