import { AppTabs } from '../../../components/ui/AppTabs'
import { roleItems } from '../constants/studentTabs'
import type { StudentRole } from '../types'

export function StudentsHeader({
  role,
  total,
  onRoleChange,
}: {
  role: StudentRole
  total: number
  onRoleChange: (role: StudentRole) => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-5 py-4">
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">我的学生</span>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white px-2 py-1 text-xs text-[var(--color-text-muted)] shadow-[var(--shadow-xs)]">
          共 {total} 人
        </span>
        <AppTabs items={roleItems} value={role} variant="pill" onChange={onRoleChange} />
      </div>
    </div>
  )
}
