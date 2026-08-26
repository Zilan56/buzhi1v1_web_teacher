/**
 * toast 状态核心（非组件，供 toast.tsx 与外部调用共享）。
 * 命令式调用见 toast.success/error/info；渲染由 <ToastHost /> 承担。
 */

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const VISIBLE_MS = 3200
const MAX_VISIBLE = 3

let sequence = 0
let items: ToastItem[] = []
const listeners = new Set<(next: ToastItem[]) => void>()

/** 订阅当前可见 toast 列表，返回取消订阅函数。 */
export function subscribeToasts(listener: (next: ToastItem[]) => void): () => void {
  listeners.add(listener)
  listener(items.slice(-MAX_VISIBLE))
  return () => {
    listeners.delete(listener)
  }
}

function emit() {
  const visible = items.slice(-MAX_VISIBLE)
  listeners.forEach((listener) => listener(visible))
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id)
  emit()
}

function push(kind: ToastKind, message: string) {
  const id = ++sequence
  items = [...items, { id, kind, message }]
  emit()
  window.setTimeout(() => dismissToast(id), VISIBLE_MS)
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
}
