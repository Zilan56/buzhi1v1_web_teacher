import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'
import { useWorkbenchStore } from '../../store/workbenchStore'

const log = logger.child('upload')

type ReplayCategory = '诊断课' | '卡点课'

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim())
}

export function UploadReplayModal() {
  const item = useWorkbenchStore((s) => s.replayUploadItem)
  const close = useWorkbenchStore((s) => s.closeReplayUpload)
  const uploadReplayMaterial = useWorkbenchStore((s) => s.uploadReplayMaterial)
  const [category, setCategory] = useState<ReplayCategory>('卡点课')
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const autoCloseTimerRef = useRef<number | null>(null)
  const wasOpenRef = useRef(false)

  const isOpen = Boolean(item)

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // 关闭→重新打开时清掉上一次会话残留的表单状态
      if (autoCloseTimerRef.current !== null) {
        window.clearTimeout(autoCloseTimerRef.current)
        autoCloseTimerRef.current = null
      }
      setCategory('卡点课')
      setLink('')
      setSubmitted(false)
      setSubmitting(false)
    }
    wasOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => () => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current)
    }
  }, [])

  if (!item) return null

  const eventId = item.eventId
  const trimmedLink = link.trim()
  const hasLink = trimmedLink.length > 0
  const linkInvalid = hasLink && !isHttpUrl(trimmedLink)

  async function handleSubmit() {
    if (!hasLink || linkInvalid || !eventId) return

    setSubmitting(true)
    try {
      await uploadReplayMaterial(eventId, category, trimmedLink)
      setSubmitted(true)
      autoCloseTimerRef.current = window.setTimeout(() => {
        autoCloseTimerRef.current = null
        setSubmitted(false)
        setLink('')
        close()
      }, 900)
    } catch (error) {
      log.warn('replay.upload.failed', { eventId, message: error instanceof Error ? error.message : String(error) })
      toast.error('录播上传失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-[min(560px,94vw)] rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">上传课程录播</div>
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-primary-light)]"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg bg-[var(--color-bg-left)] px-3 py-2">
            <div className="text-xs text-[var(--color-text-secondary)]">课次</div>
            <div className="mt-0.5 text-sm font-medium text-[var(--color-text-primary)]">{item.name}</div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">录播类型</div>
            <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
              {(['诊断课', '卡点课'] as ReplayCategory[]).map((currentCategory) => (
                <button
                  key={currentCategory}
                  type="button"
                  onClick={() => setCategory(currentCategory)}
                  className={[
                    'flex-1 py-1.5 text-xs font-medium transition-colors',
                    category === currentCategory
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]',
                  ].join(' ')}
                >
                  {currentCategory}录播
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
              第一步：在保利威后台找到对应录播，复制学生可访问的播放链接
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
              这里填写的是保利威录播链接，不是腾讯会议回放链接。
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
              第二步：将录播链接粘贴到此处，学生端“去回顾”会按保利威录播打开
            </div>
            <input
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="粘贴保利威录播链接，例如 https://..."
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
            />
            <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">
              需要完整的 `http` 或 `https` 链接。
            </div>
            {linkInvalid && (
              <div className="mt-1 text-[10px] text-red-500">
                录播链接必须是完整的 http 或 https 地址
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!hasLink || linkInvalid || submitted || submitting}
            className={[
              'w-full rounded-lg py-2 text-sm font-semibold transition-colors',
              submitted
                ? 'bg-green-500 text-white'
                : hasLink && !linkInvalid
                  ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400',
            ].join(' ')}
          >
            {submitted ? '上传成功' : submitting ? '上传中...' : '确认上传'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
