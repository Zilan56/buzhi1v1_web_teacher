import { useWorkbenchStore } from '../../store/workbenchStore'

export function TeacherInfo({
  onLogout,
  onOpenIdentitySettings,
  teacherRoleLabel,
}: {
  onLogout?: () => void
  onOpenIdentitySettings?: () => void
  teacherRoleLabel?: string
}) {
  const teacherName = useWorkbenchStore((s) => s.teacherName)

  const displayName = teacherName || '老师'
  const displayRole = teacherRoleLabel || '点击设置身份'

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <button
        type="button"
        onClick={onOpenIdentitySettings}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-[var(--color-bg-left)]"
        title="点击修改身份"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--color-primary)] text-sm font-bold text-white">
          {displayName.slice(0, 1)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{displayName}</div>
          <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{displayRole}</div>
        </div>
      </button>

      {onLogout ? (
        <button
          type="button"
          title="退出登录"
          onClick={onLogout}
          className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text-secondary)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
