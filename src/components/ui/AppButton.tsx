import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]',
  secondary: 'border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)] hover:text-[var(--color-text-primary)]',
  ghost: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]',
  danger: 'border border-red-200 bg-white text-red-500 hover:bg-red-50',
}

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-xs',
  md: 'min-h-9 px-4 py-2 text-sm',
}

export function AppButton({
  children,
  className,
  variant = 'secondary',
  size = 'sm',
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}>) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center rounded-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}
