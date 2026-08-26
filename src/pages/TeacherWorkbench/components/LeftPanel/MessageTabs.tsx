import { AppTabs } from '../../../../components/ui/AppTabs'
import type { MessageTabKey } from '../../types'
import { useWorkbenchStore } from '../../store/workbenchStore'
import { ENABLE_ABNORMAL_USERS, ENABLE_COMPLAINTS } from '../../config/launch'

const tabs: Array<{ key: MessageTabKey; label: string }> = [
  { key: 'yesterdayUnreplied', label: '昨日未回' },
  { key: 'todayMessages', label: '今日消息' },
  ...(ENABLE_ABNORMAL_USERS ? [{ key: 'abnormalUsers' as const, label: '异常用户' }] : []),
  ...(ENABLE_COMPLAINTS ? [{ key: 'complaints' as const, label: '投诉' }] : []),
]

export function MessageTabs() {
  const active = useWorkbenchStore((state) => state.leftMessageTab)
  const setTab = useWorkbenchStore((state) => state.setLeftMessageTab)

  return (
    <div className="px-3 py-2">
      <AppTabs
        items={tabs}
        value={tabs.some((item) => item.key === active) ? active : 'todayMessages'}
        variant="line"
        size="sm"
        className="gap-1"
        onChange={setTab}
      />
    </div>
  )
}
