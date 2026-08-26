import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useWorkbenchStore } from '../../store/workbenchStore'

const COURSE_LABEL: Record<string, string> = {
  diagnose: '1v1诊断',
  consensus: '1v1共识',
  correction: '1v1纠偏',
}

export function UploadLinkModal() {
  const item = useWorkbenchStore((s) => s.linkUploadItem)
  const close = useWorkbenchStore((s) => s.closeLinkUpload)
  const setEventLink = useWorkbenchStore((s) => s.setEventLink)
  const calendarEvents = useWorkbenchStore((s) => s.calendarEvents)

  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [copied, setCopied] = useState(false)

  if (!item) return null

  const event = item.eventId ? calendarEvents.find((e) => e.id === item.eventId) : null
  const timeText = event ? `${event.date} ${event.startTime}-${event.endTime}` : item.name
  const isReplay = item.linkType === 'replay'
  const courseLabel = item.courseType ? COURSE_LABEL[item.courseType] : ''
  const typeLabel = isReplay ? '回放课' : '直播课'

  function openMeeting() {
    window.location.href = 'wemeet://'
    setTimeout(() => {
      if (!document.hidden) window.open('https://meeting.tencent.com', '_blank')
    }, 1500)
  }

  function handleCopy() {
    void navigator.clipboard.writeText(timeText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleClose() {
    setLink('')
    setSubmitted(false)
    setSubmitting(false)
    setUploadError('')
    close()
  }

  async function handleSubmit() {
    if (!link.trim() || !item?.studentId || !item.courseType || !item.pointName) return

    setSubmitting(true)
    setUploadError('')
    try {
      await setEventLink(
        item.studentId,
        item.courseType,
        isReplay ? 'replay' : 'live',
        link.trim(),
        item.pointName,
        item.eventId,
      )

      setSubmitted(true)
      setTimeout(() => {
        setSubmitted(false)
        setLink('')
        close()
      }, 1200)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-[min(560px,94vw)] rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">上传链接</span>
            {courseLabel && (
              <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                {courseLabel} · {typeLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg bg-[var(--color-bg-left)] px-3 py-2.5">
            <div className="text-xs text-[var(--color-text-secondary)]">课次</div>
            <div className="mt-0.5 text-sm font-semibold text-[var(--color-text-primary)]">{item.name}</div>
            {event && (
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-[var(--color-text-secondary)]">
                  上课时间：<span className="font-medium text-[var(--color-text-primary)]">{timeText}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={[
                    'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                    copied
                      ? 'bg-green-100 text-green-600'
                      : 'border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {copied ? '已复制' : '复制时间'}
                </button>
              </div>
            )}
          </div>

          {!isReplay && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                第一步：前往腾讯会议预约本次课程，复制邀请内容
              </div>
              <button
                type="button"
                onClick={openMeeting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                打开腾讯会议 App
              </button>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
              {isReplay ? '粘贴保利威视频 ID' : '第二步：可直接粘贴腾讯会议邀请全文，系统会自动识别时间和入会链接'}
            </div>
            <textarea
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={isReplay ? '粘贴保利威视频 ID，如 1e6eaa05af..._1' : '粘贴腾讯会议邀请全文，或单独粘贴入会链接...'}
              rows={isReplay ? 2 : 6}
              className="w-full resize-none rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
            />
            {!isReplay && (
              <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                支持识别类似“会议时间：2026/04/29 11:30-12:00”和 `https://meeting.tencent.com/...` 的邀请内容，并同步到老师日程。
              </div>
            )}
            {isReplay && (
              <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                在保利威后台上传视频后，复制视频 ID 粘贴到此处。
              </div>
            )}
          </div>

          {!!uploadError && (
            <div className="text-[10px] text-red-500">{uploadError}</div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!link.trim() || submitted || submitting}
            className={[
              'w-full rounded-lg py-2 text-sm font-semibold transition-colors',
              submitted
                ? 'bg-green-500 text-white'
                : link.trim()
                  ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400',
            ].join(' ')}
          >
            {submitted ? '上传成功 ✓' : submitting ? '上传中...' : '确认上传'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
