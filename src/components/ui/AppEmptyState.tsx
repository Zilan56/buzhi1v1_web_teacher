import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** 统一空状态占位。替代各处手写的 "暂无 XX" 文案块。 */
export function AppEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center', className)}>
      <div className="text-sm font-medium text-[var(--color-text-muted)]">{title}</div>
      {description ? (
        <div className="max-w-[320px] text-[12px] leading-5 text-[var(--color-text-muted)]/80">{description}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
