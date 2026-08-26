export function TeacherProfileStats({
  joinDate,
  primaryRole,
  totalStudents,
}: {
  joinDate: string
  primaryRole: string
  totalStudents: number
}) {
  return (
    <div className="grid grid-cols-3 gap-px border-b border-[var(--color-border)] bg-[var(--color-border)]">
      {[
        { label: '入职日期', value: joinDate },
        { label: '主要角色', value: primaryRole },
        { label: '总学生数', value: `${totalStudents} 人` },
      ].map((item) => (
        <div key={item.label} className="flex flex-col items-center bg-white py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{item.value}</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
