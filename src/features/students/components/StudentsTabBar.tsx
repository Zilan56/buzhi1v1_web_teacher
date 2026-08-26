import { AppTabs } from '../../../components/ui/AppTabs'
import { getTabItemsByRole } from '../constants/studentTabs'
import type { StudentRole, StudentTab } from '../types'

export function StudentsTabBar({
  role,
  tab,
  onTabChange,
}: {
  role: StudentRole
  tab: StudentTab
  onTabChange: (tab: StudentTab) => void
}) {
  return (
    <div className="border-b border-[var(--color-border)] px-5 py-3">
      <AppTabs items={getTabItemsByRole(role)} value={tab} variant="pill" onChange={onTabChange} />
    </div>
  )
}
