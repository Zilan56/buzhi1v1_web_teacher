import type { TaskKey } from '../../types'

export function TaskCard({
  taskKey,
  label,
  count,
  tone,
  onClick,
}: {
  taskKey: TaskKey
  label: string
  count: number
  tone?: 'alert'
  onClick: (taskKey: TaskKey) => void
}) {
  const isAlert = tone === 'alert'

  return (
    <button
      type="button"
      onClick={() => onClick(taskKey)}
      className={[
        'flex h-[84px] w-full flex-col justify-between rounded-[var(--radius-card)] border bg-white px-4 py-3 text-left shadow-[var(--shadow-xs)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[var(--color-bg-left)]',
        isAlert ? 'border-[var(--color-badge-alert)]' : 'border-[var(--color-border)]',
      ].join(' ')}
    >
      <div
        className={[
          'text-2xl font-bold leading-none',
          isAlert ? 'text-[var(--color-badge-alert)]' : 'text-[var(--color-primary)]',
        ].join(' ')}
      >
        {count > 0 ? count : '—'}
      </div>
      <div className="text-xs font-semibold leading-tight text-[var(--color-text-primary)]">
        {label}
      </div>
    </button>
  )
}
