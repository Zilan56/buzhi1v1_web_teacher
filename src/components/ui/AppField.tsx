/**
 * 表单字段三件套：label + 输入控件 + 错误文案。
 * 替代各弹窗/工作台手写的 InputField/TemplateInput/EditorInput 三套近似实现。
 */

import type { ReactNode, TextareaHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const controlClassName = 'w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)] disabled:opacity-50'

export function AppFieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-muted)]">
      {children}
      {hint ? <span className="ml-1.5 font-normal text-[var(--color-text-muted)]/80">{hint}</span> : null}
    </label>
  )
}

export function AppInput({
  label,
  error,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      {label ? <AppFieldLabel hint={hint}>{label}</AppFieldLabel> : null}
      <input
        {...props}
        className={cn(controlClassName, error ? 'border-red-300 focus:border-red-400' : '', className)}
      />
      {error ? <div className="mt-1 text-[11px] text-red-500">{error}</div> : null}
    </div>
  )
}

export function AppTextarea({
  label,
  error,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      {label ? <AppFieldLabel hint={hint}>{label}</AppFieldLabel> : null}
      <textarea
        {...props}
        className={cn(controlClassName, 'min-h-[72px] resize-y', error ? 'border-red-300 focus:border-red-400' : '', className)}
      />
      {error ? <div className="mt-1 text-[11px] text-red-500">{error}</div> : null}
    </div>
  )
}

export function AppSelect({
  label,
  error,
  hint,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; error?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      {label ? <AppFieldLabel hint={hint}>{label}</AppFieldLabel> : null}
      <select
        {...props}
        className={cn(controlClassName, 'bg-white', error ? 'border-red-300 focus:border-red-400' : '', className)}
      >
        {children}
      </select>
      {error ? <div className="mt-1 text-[11px] text-red-500">{error}</div> : null}
    </div>
  )
}
