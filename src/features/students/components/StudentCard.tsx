import { StatusBadge } from '../../../components/ui/StatusBadge'
import { studentStatusMeta } from '../constants/studentStatus'
import type { StudentItem } from '../types'

export function StudentCard({
  student,
  compact = false,
  onClick,
}: {
  student: StudentItem
  compact?: boolean
  onClick: () => void
}) {
  const status = studentStatusMeta[student.status]

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white text-left shadow-[var(--shadow-xs)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]',
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
      ].join(' ')}
    >
      <div
        className={[
          'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
          compact ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm',
        ].join(' ')}
        style={{ backgroundColor: student.color }}
      >
        {student.avatar}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={compact ? 'text-xs font-semibold text-[var(--color-text-primary)]' : 'text-sm font-semibold text-[var(--color-text-primary)]'}>
            {student.name}
          </span>
          <StatusBadge label={status.label} tone={status.tone} className={compact ? 'text-[9px]' : undefined} />
        </div>
        <div className={compact ? 'mt-0.5 text-[10px] text-[var(--color-text-secondary)]' : 'mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]'}>
          {compact ? (
            <span>
              {student.grade} · {student.subject} · 最近上课 {student.lastSession}
            </span>
          ) : (
            <>
              <span>{student.grade}</span>
              <span>·</span>
              <span>{student.subject}</span>
              <span>·</span>
              <span>最近上课 {student.lastSession}</span>
            </>
          )}
        </div>
      </div>
      <svg className={compact ? 'h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]' : 'h-4 w-4 shrink-0 text-[var(--color-text-muted)]'} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}
