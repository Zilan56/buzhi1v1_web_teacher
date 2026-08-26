import { StudentCard } from './StudentCard'
import type { StudentItem } from '../types'

export function TeacherStudentSection({
  title,
  students,
  onSelectStudent,
}: {
  title: string
  students: StudentItem[]
  onSelectStudent: (student: StudentItem) => void
}) {
  if (students.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{title}</span>
        <span className="rounded-full bg-[var(--color-bg-left)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
          {students.length} 人
        </span>
      </div>
      <div className="space-y-1.5">
        {students.map((student) => (
          <StudentCard key={student.id} student={student} compact onClick={() => onSelectStudent(student)} />
        ))}
      </div>
    </div>
  )
}
