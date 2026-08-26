/**
 * 轻量 toast 渲染层：<ToastHost /> 在应用根部挂载一次即可。
 * 命令式调用（toast.success/error/info）与状态核心在 ./toastCore。
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { dismissToast, subscribeToasts, type ToastItem, type ToastKind } from './toastCore'

const kindStyles: Record<ToastKind, string> = {
  success: 'border-green-200 bg-green-50 text-green-700',
  error: 'border-red-200 bg-red-50 text-red-600',
  info: 'border-[var(--color-border)] bg-white text-[var(--color-text-primary)]',
}

const kindIcons: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export function ToastHost() {
  const [visible, setVisible] = useState<ToastItem[]>([])

  useEffect(() => {
    return subscribeToasts(setVisible)
  }, [])

  if (visible.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed left-1/2 top-4 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => dismissToast(item.id)}
          className={cn(
            'pointer-events-auto flex max-w-[min(480px,90vw)] items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium shadow-md',
            kindStyles[item.kind],
          )}
        >
          <span className="shrink-0 text-xs font-bold">{kindIcons[item.kind]}</span>
          <span className="text-left">{item.message}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}
