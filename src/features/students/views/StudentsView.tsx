import { AppCard } from '../../../components/ui/AppCard'
import { useWorkbenchStore } from '../../../pages/TeacherWorkbench/store/workbenchStore'
import { StudentDetailView as LegacyStudentDetailView } from '../../../pages/TeacherWorkbench/components/RightPanel/StudentDetailView'
import { StudentsHeader } from '../components/StudentsHeader'
import { StudentsList } from '../components/StudentsList'
import { StudentsTabBar } from '../components/StudentsTabBar'
import { useStudentBrowserState } from '../hooks/useStudentBrowserState'
import { useStudentsData } from '../hooks/useStudentsData'
import { useStudentTargets } from '../hooks/useStudentTargets'
import { TeacherProfileView } from './TeacherProfileView'

export function StudentsView() {
  const selectContact = useWorkbenchStore((state) => state.selectContact)
  const browser = useStudentBrowserState()
  const { allStudents, students } = useStudentsData(browser.tab)

  useStudentTargets({
    allStudents,
    openStudent: browser.resetToStudent,
    openTeacher: browser.resetToTeacher,
  })

  if (browser.current.type === 'teacher') {
    return (
      <TeacherProfileView
        teacherName={browser.current.name}
        onBack={browser.pop}
        onStudentClick={browser.pushStudent}
        onGoToChat={(contactId) => selectContact(contactId)}
      />
    )
  }

  if (browser.current.type === 'student') {
    return (
      <LegacyStudentDetailView
        key={browser.current.student.id}
        student={browser.current.student}
        onBack={browser.pop}
        onTeacherClick={browser.pushTeacher}
        onGoToChat={(contactId) => selectContact(contactId)}
      />
    )
  }

  return (
    <AppCard className="flex h-full flex-col overflow-hidden" padded={false}>
      <StudentsHeader role={browser.role} total={students.length} onRoleChange={browser.switchRole} />
      <StudentsTabBar role={browser.role} tab={browser.tab} onTabChange={browser.setTab} />
      <StudentsList students={students} onSelectStudent={browser.pushStudent} />
    </AppCard>
  )
}
