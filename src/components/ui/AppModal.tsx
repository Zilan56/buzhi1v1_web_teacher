import type { PropsWithChildren, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

export function AppModal({
  title,
  onClose,
  children,
  footer,
  widthClassName = 'w-[min(680px,90vw)]',
}: PropsWithChildren<{
  title: ReactNode
  onClose: () => void
  footer?: ReactNode
  widthClassName?: string
}>) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
      <div
        className={cn(
          'relative max-h-[84vh] overflow-hidden rounded-[calc(var(--radius-card)+2px)] border border-[var(--color-border)] bg-white shadow-[var(--shadow-md)]',
          widthClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-5 py-4">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-base text-[var(--color-text-muted)] transition-colors hover:bg-white hover:text-[var(--color-text-primary)]"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto">{children}</div>
        {footer ? <div className="border-t border-[var(--color-border)] bg-white px-5 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
