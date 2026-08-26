/**
 * 表单提交三件套：submitting / error / run。
 * 替代各弹窗手写的 submitted-submitting-error useState 集合；
 * run 统一处理：执行中防重入、失败捕获展示、成功 toast、（可选）自动关闭。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '../lib/logger'
import { toast } from '../components/ui/toastCore'

export interface UseSubmitStateOptions {
  /** 成功后的提示文案；传 false 关闭 toast */
  successToast?: string | false
  /** 失败时的提示文案；默认使用错误消息 */
  errorToast?: (message: string) => string
  /** 提交成功后自动执行（如关闭弹窗），延迟 ms */
  autoCloseMs?: number
  onAutoClose?: () => void
  /** 失败后是否把错误也写入返回值（默认 run 返回 null） */
  rethrow?: boolean
}

export function useSubmitState(options: UseSubmitStateOptions = {}) {
  const { successToast, errorToast, autoCloseMs, onAutoClose, rethrow = false } = options
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const autoCloseTimerRef = useRef<number | null>(null)
  const onAutoCloseRef = useRef(onAutoClose)
  onAutoCloseRef.current = onAutoClose

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current !== null) window.clearTimeout(autoCloseTimerRef.current)
    }
  }, [])

  const clearError = useCallback(() => setError(''), [])

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (submitting) return null
      setSubmitting(true)
      setError('')
      try {
        const result = await fn()
        if (successToast !== false) toast.success(typeof successToast === 'string' ? successToast : '操作成功')
        if (autoCloseMs !== undefined && onAutoCloseRef.current) {
          autoCloseTimerRef.current = window.setTimeout(() => {
            autoCloseTimerRef.current = null
            onAutoCloseRef.current?.()
          }, autoCloseMs)
        }
        return result
      } catch (errorObject) {
        const message = errorObject instanceof Error ? errorObject.message : '操作失败，请稍后重试'
        setError(message)
        toast.error(errorToast ? errorToast(message) : message)
        logger.warn('submit.failed', { message })
        if (rethrow) throw errorObject
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [submitting, successToast, errorToast, autoCloseMs, rethrow],
  )

  return { submitting, error, setError, clearError, run }
}
