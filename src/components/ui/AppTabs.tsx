import { cn } from '../../lib/cn'

export interface AppTabItem<T extends string> {
  key: T
  label: string
}

export function AppTabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'line',
  size = 'sm',
  className,
}: {
  items: ReadonlyArray<AppTabItem<T>>
  value: T
  onChange: (value: T) => void
  variant?: 'line' | 'pill'
  size?: 'sm' | 'md'
  className?: string
}) {
  const isLine = variant === 'line'

  return (
    <div className={cn(isLine ? 'flex items-end gap-2' : 'flex items-center gap-2', className)}>
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'whitespace-nowrap font-medium transition-colors',
              isLine
                ? cn(
                    size === 'md' ? 'border-b-2 px-1 pb-3 text-sm' : 'border-b-2 px-1 pb-2 text-xs',
                    active
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  )
                : cn(
                    size === 'md' ? 'rounded-full px-4 py-2 text-sm' : 'rounded-full px-3 py-1.5 text-xs',
                    active
                      ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-xs)]'
                      : 'bg-[var(--color-bg-left)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]',
                  ),
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
