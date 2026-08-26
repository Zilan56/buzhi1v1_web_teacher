import { StudentCard } from './StudentCard'
import type { StudentItem } from '../types'

export function StudentsList({
  students,
  onSelectStudent,
}: {
  students: StudentItem[]
  onSelectStudent: (student: StudentItem) => void
}) {
  return (
    <div className="flex-1 overflow-auto bg-[#fffdfb] p-4">
      <div className="space-y-2">
        {students.map((student) => (
          <StudentCard key={student.id} student={student} onClick={() => onSelectStudent(student)} />
        ))}
      </div>
    </div>
  )
}
