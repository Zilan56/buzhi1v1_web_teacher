import { AppCard } from '../../../components/ui/AppCard'
import { getTeacherContactId, getTeacherProfile, getTeacherStudentCount, getTeacherStudentGroups } from '../data/studentSelectors'
import { TeacherProfileHeader } from '../components/TeacherProfileHeader'
import { TeacherProfileStats } from '../components/TeacherProfileStats'
import { TeacherStudentSection } from '../components/TeacherStudentSection'
import type { StudentItem } from '../types'

export function TeacherProfileView({
  teacherName,
  onBack,
  onStudentClick,
  onGoToChat,
}: {
  teacherName: string
  onBack: () => void
  onStudentClick: (student: StudentItem) => void
  onGoToChat?: (contactId: string) => void
}) {
  const profile = getTeacherProfile(teacherName)
  const groups = getTeacherStudentGroups(teacherName)
  const totalStudents = getTeacherStudentCount(groups)
  const teacherContactId = getTeacherContactId(teacherName)

  return (
    <AppCard className="flex h-full flex-col overflow-hidden" padded={false}>
      <TeacherProfileHeader
        teacherName={teacherName}
        avatarColor={profile?.color ?? '#888'}
        subtitle={`${profile?.primaryRole ?? '老师'} · ${profile?.subject ?? '-'}`}
        teacherContactId={teacherContactId}
        onBack={onBack}
        onGoToChat={onGoToChat}
      />

      <div className="flex-1 overflow-auto">
        <TeacherProfileStats
          joinDate={profile?.joinDate ?? '-'}
          primaryRole={profile?.primaryRole ?? '-'}
          totalStudents={totalStudents}
        />

        <div className="space-y-5 p-4">
          {profile?.intro ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-left)] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {profile.intro}
            </div>
          ) : null}

          <TeacherStudentSection title="作为带教老师的学生" students={groups.teachingStudents} onSelectStudent={onStudentClick} />
          <TeacherStudentSection title="作为诊断老师的学生" students={groups.diagnosisStudents} onSelectStudent={onStudentClick} />

          {groups.teachingStudents.length === 0 && groups.diagnosisStudents.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">暂无学生数据</div>
          ) : null}
        </div>
      </div>
    </AppCard>
  )
}
