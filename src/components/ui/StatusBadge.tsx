import { cn } from '../../lib/cn'

const toneClasses = {
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
  neutral: 'bg-slate-100 text-slate-600',
  accent: 'bg-blue-50 text-blue-600',
} as const

export function StatusBadge({
  label,
  tone,
  className,
}: {
  label: string
  tone: keyof typeof toneClasses
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
        toneClasses[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}
