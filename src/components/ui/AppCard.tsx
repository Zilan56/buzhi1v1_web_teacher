import type { PropsWithChildren } from 'react'
import { cn } from '../../lib/cn'

export function AppCard({
  children,
  className,
  padded = true,
}: PropsWithChildren<{ className?: string; padded?: boolean }>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white shadow-[var(--shadow-xs)]',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
