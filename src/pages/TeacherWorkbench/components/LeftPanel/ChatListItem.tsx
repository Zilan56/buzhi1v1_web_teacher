import type { ContactItem } from '../../types'

const statusConfig = {
  normal:    { label: '正常', cls: 'bg-green-100 text-green-600' },
  warning:   { label: '异常', cls: 'bg-red-100 text-red-500' },
  new:       { label: '新学员', cls: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' },
  leave:     { label: '已请假', cls: 'bg-gray-100 text-gray-500' },
  completed: { label: '已完成', cls: 'bg-teal-50 text-teal-700' },
}

export function ChatListItem({
  item,
  selected,
  onClick,
}: {
  item: ContactItem
  selected: boolean
  onClick: () => void
}) {
  const hasUnread = item.unreadCount > 0
  const statusCfg = item.studentStatus ? statusConfig[item.studentStatus] : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors duration-150',
        selected ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-bg-left)]',
      ].join(' ')}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-sm font-bold text-white"
        style={{ backgroundColor: item.color }}
      >
        {item.avatar}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={[
            'truncate text-sm',
            hasUnread ? 'font-bold text-[var(--color-text-primary)]' : 'font-medium text-[var(--color-text-primary)]',
          ].join(' ')}>
            {item.name}
          </div>
          {item.tag === 'complaint' && (
            <span className="shrink-0 text-[11px] font-medium text-[var(--color-badge-alert)]">投诉</span>
          )}
          {statusCfg && (
            <span className={['shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium', statusCfg.cls].join(' ')}>
              {statusCfg.label}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
          {item.preview}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="text-[10px] text-[var(--color-text-muted)]">{item.time}</div>
        {hasUnread && (
          <div className={[
            'flex items-center justify-center rounded-full bg-red-500 text-white font-bold leading-none',
            item.unreadCount > 99 ? 'min-w-[18px] px-1 h-[18px] text-[9px]' :
            item.unreadCount > 9 ? 'min-w-[18px] px-1 h-[18px] text-[10px]' :
              'h-4 w-4 text-[10px]',
          ].join(' ')}>
            {item.unreadCount > 99 ? '99+' : item.unreadCount}
          </div>
        )}
      </div>
    </button>
  )
}
