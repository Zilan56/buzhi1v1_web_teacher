import { AppButton } from '../../../components/ui/AppButton'

export function TeacherProfileHeader({
  teacherName,
  avatarColor,
  subtitle,
  teacherContactId,
  onBack,
  onGoToChat,
}: {
  teacherName: string
  avatarColor: string
  subtitle: string
  teacherContactId?: string
  onBack: () => void
  onGoToChat?: (contactId: string) => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-5 py-4">
      <AppButton type="button" onClick={onBack} variant="ghost" className="gap-1 px-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        返回
      </AppButton>
      <button
        type="button"
        title={teacherContactId ? '进入对话框' : undefined}
        disabled={!teacherContactId || !onGoToChat}
        onClick={() => teacherContactId && onGoToChat?.(teacherContactId)}
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white transition-opacity',
          teacherContactId && onGoToChat ? 'cursor-pointer ring-2 ring-transparent ring-offset-2 hover:opacity-85 hover:ring-[var(--color-primary)]' : 'cursor-default',
        ].join(' ')}
        style={{ backgroundColor: avatarColor }}
      >
        {teacherName.slice(0, 1)}
      </button>
      <div>
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{teacherName}</div>
          {teacherContactId && onGoToChat ? (
            <span className="text-[10px] text-[var(--color-text-muted)]">点击头像进入对话</span>
          ) : null}
        </div>
        <div className="text-xs text-[var(--color-text-secondary)]">{subtitle}</div>
      </div>
    </div>
  )
}
