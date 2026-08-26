import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppButton } from '../../../../components/ui/AppButton'
import { api } from '../../../../lib/api'
import { apiUrl } from '../../../../lib/apiBase'
import { useWorkbenchStore } from '../../store/workbenchStore'

const CHECKPOINTS = [
  '要点不全不准',
  '提炼转述困难',
  '分析结构不清',
  '公文结构不清',
  '对策推导困难',
  '作文立意不准',
  '作文论证不清',
  '作文表达不畅',
] as const

type FeedbackTab = 'recorded_lesson' | 'find_teacher'
type CheckpointFilter = 'all' | typeof CHECKPOINTS[number]

interface FeedbackAttachment {
  id: string
  name: string
  url: string
  mimeType?: string
}

interface StudentFeedbackItem {
  id: string
  studentId: string
  studentName: string
  studentPhone?: string
  source: FeedbackTab
  sourceLabel: string
  title: string
  pointName: string
  content: string
  attachments: FeedbackAttachment[]
  status: 'pending' | 'read'
  reviewedAt?: string | null
  reviewedByName?: string
  createdAt?: string | null
  meta?: {
    videoTitle?: string
    recordedDoneCount?: number
    recordedTasksTotal?: number
  }
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveAssetUrl(url = '') {
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : apiUrl(url)
}

function statusMeta(status: StudentFeedbackItem['status']) {
  return status === 'read'
    ? { label: '已查看', className: 'bg-slate-100 text-slate-600' }
    : { label: '待查看', className: 'bg-orange-50 text-orange-600' }
}

function normalizeCheckpoint(pointName = ''): CheckpointFilter {
  const normalizedCheckpoints = [
    '要点不全不准',
    '提炼转述困难',
    '分析结构不清',
    '公文结构不清',
    '对策推导困难',
    '作文立意不准',
    '作文论证不清',
    '作文表达不畅',
  ] as const
  const normalizedFound = normalizedCheckpoints.find((checkpoint) => pointName.includes(checkpoint))
  if (normalizedFound) return normalizedFound

  const found = CHECKPOINTS.find((checkpoint) => pointName.includes(checkpoint))
  return found ?? 'all'
}

export function StudentFeedbackModal() {
  const isOpen = useWorkbenchStore((state) => state.studentFeedbackOpen)
  const close = useWorkbenchStore((state) => state.closeStudentFeedbackModal)
  const openStudentProfile = useWorkbenchStore((state) => state.openStudentProfile)
  const loadTaskCounts = useWorkbenchStore((state) => state.loadTaskCounts)
  const loadTaskItems = useWorkbenchStore((state) => state.loadTaskItems)

  const [items, setItems] = useState<StudentFeedbackItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FeedbackTab>('recorded_lesson')
  const [checkpointFilter, setCheckpointFilter] = useState<CheckpointFilter>('all')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function loadFeedbacks() {
    setLoading(true)
    setError('')

    try {
      const data = await api.get<StudentFeedbackItem[]>('/api/teacher/student-feedbacks')
      const nextItems = Array.isArray(data) ? data : []
      setItems(nextItems)
    } catch (err) {
      setItems([])
      setSelectedId(null)
      setError(err instanceof Error ? err.message : '加载学生反馈失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setActiveTab('recorded_lesson')
    setCheckpointFilter('all')
    void loadFeedbacks()
  }, [isOpen])

  const recordedItems = useMemo(
    () => items.filter((item) => item.source === 'recorded_lesson'),
    [items],
  )
  const findTeacherItems = useMemo(
    () => items.filter((item) => item.source === 'find_teacher'),
    [items],
  )

  const checkpointStats = useMemo(() => {
    const result = CHECKPOINTS.map((checkpoint) => ({
      checkpoint,
      total: 0,
      pending: 0,
      latestAt: '',
    }))

    recordedItems.forEach((item) => {
      const checkpoint = normalizeCheckpoint(item.pointName || item.title)
      if (checkpoint === 'all') return
      const stat = result.find((entry) => entry.checkpoint === checkpoint)
      if (!stat) return

      stat.total += 1
      if (item.status === 'pending') stat.pending += 1
      const createdAt = String(item.createdAt || '')
      if (createdAt && (!stat.latestAt || new Date(createdAt).getTime() > new Date(stat.latestAt).getTime())) {
        stat.latestAt = createdAt
      }
    })

    return result
  }, [recordedItems])

  const visibleItems = useMemo(() => {
    if (activeTab === 'find_teacher') return findTeacherItems

    return recordedItems.filter((item) => (
      checkpointFilter === 'all'
      || normalizeCheckpoint(item.pointName || item.title) === checkpointFilter
    ))
  }, [activeTab, checkpointFilter, findTeacherItems, recordedItems])

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null,
    [selectedId, visibleItems],
  )

  useEffect(() => {
    if (!isOpen) return
    setSelectedId((current) => {
      if (current && visibleItems.some((item) => item.id === current)) return current
      return visibleItems[0]?.id ?? null
    })
  }, [isOpen, visibleItems])

  async function markAsRead() {
    if (!selectedItem || selectedItem.status === 'read') return

    setSubmitting(true)
    setError('')

    try {
      await api.patch(`/api/teacher/student-feedbacks/${selectedItem.id}/read`, {})
      await Promise.all([
        loadFeedbacks(),
        loadTaskCounts(),
        loadTaskItems(),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新反馈状态失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const unreadRecorded = recordedItems.filter((item) => item.status === 'pending').length
  const unreadFindTeacher = findTeacherItems.filter((item) => item.status === 'pending').length
  const doneCount = Math.max(0, Number(selectedItem?.meta?.recordedDoneCount) || 0)
  const totalCount = Math.max(0, Number(selectedItem?.meta?.recordedTasksTotal) || 0)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative grid h-[min(880px,92vh)] w-[50vw] max-w-[96vw] grid-cols-[430px_minmax(0,1fr)] overflow-hidden rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">学生反馈</div>
                <div className="mt-1 text-xs text-[var(--color-text-muted)]">按录播课卡点统计，或查看“找老师”入口反馈</div>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-bg-left)] p-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('recorded_lesson')
                  setCheckpointFilter('all')
                }}
                className={[
                  'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                  activeTab === 'recorded_lesson' ? 'bg-white text-[var(--color-primary)] shadow-sm' : 'text-[var(--color-text-secondary)]',
                ].join(' ')}
              >
                录播课反馈 {unreadRecorded ? `(${unreadRecorded})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('find_teacher')}
                className={[
                  'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                  activeTab === 'find_teacher' ? 'bg-white text-[var(--color-primary)] shadow-sm' : 'text-[var(--color-text-secondary)]',
                ].join(' ')}
              >
                找老师入口 {unreadFindTeacher ? `(${unreadFindTeacher})` : ''}
              </button>
            </div>
          </div>

          <div className="h-[calc(100%-116px)] overflow-auto p-3">
            {activeTab === 'recorded_lesson' ? (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCheckpointFilter('all')}
                  className={[
                    'rounded-xl border px-3 py-2 text-left transition-colors',
                    checkpointFilter === 'all'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/40'
                      : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-bg-left)]',
                  ].join(' ')}
                >
                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">全部卡点</div>
                  <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    {recordedItems.length} 条 / 待看 {unreadRecorded}
                  </div>
                </button>
                {checkpointStats.map((stat) => (
                  <button
                    key={stat.checkpoint}
                    type="button"
                    onClick={() => setCheckpointFilter(stat.checkpoint)}
                    className={[
                      'rounded-xl border px-3 py-2 text-left transition-colors',
                      checkpointFilter === stat.checkpoint
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/40'
                        : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-bg-left)]',
                    ].join(' ')}
                  >
                    <div className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{stat.checkpoint}</div>
                    <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      {stat.total} 条 / 待看 {stat.pending}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2">
                <div className="text-xs font-semibold text-[var(--color-text-primary)]">找老师入口反馈</div>
                <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  共 {findTeacherItems.length} 条，待查看 {unreadFindTeacher} 条
                </div>
              </div>
            )}

            {loading ? <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">加载中…</div> : null}
            {!loading && visibleItems.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">暂无反馈</div>
            ) : null}

            {!loading && visibleItems.map((item) => {
              const isActive = item.id === selectedItem?.id
              const meta = statusMeta(item.status)

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={[
                    'mb-2 w-full rounded-[var(--radius-card)] border px-3 py-3 text-left transition-colors',
                    isActive
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/40'
                      : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-bg-left)]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.studentName}</div>
                    <span className={['rounded px-2 py-0.5 text-[10px] font-medium', meta.className].join(' ')}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">
                    {item.source === 'recorded_lesson'
                      ? item.pointName || item.title || '录播课反馈'
                      : item.title || '找老师入口反馈'}
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">
                    {item.content || '该反馈仅包含图片附件'}
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">{formatTime(item.createdAt)}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="min-h-0 overflow-auto p-5">
          {!selectedItem ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">请选择一条反馈</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-[var(--color-text-primary)]">
                      {selectedItem.source === 'recorded_lesson'
                        ? selectedItem.pointName || selectedItem.title || '录播课反馈'
                        : selectedItem.title || '找老师入口反馈'}
                    </div>
                    <span className="rounded bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                      {selectedItem.source === 'recorded_lesson' ? '录播课' : '找老师入口'}
                    </span>
                    <span className={['rounded px-2.5 py-1 text-xs font-medium', statusMeta(selectedItem.status).className].join(' ')}>
                      {statusMeta(selectedItem.status).label}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                    <span>学生：{selectedItem.studentName}</span>
                    <span>提交时间：{formatTime(selectedItem.createdAt)}</span>
                    <span>查看时间：{formatTime(selectedItem.reviewedAt)}</span>
                    {selectedItem.reviewedByName ? <span>处理老师：{selectedItem.reviewedByName}</span> : null}
                  </div>

                  {selectedItem.studentPhone ? (
                    <div className="text-xs text-[var(--color-text-muted)]">手机号：{selectedItem.studentPhone}</div>
                  ) : null}

                  {selectedItem.source === 'recorded_lesson' ? (
                    <div className="text-xs text-[var(--color-text-muted)]">
                      卡点：{normalizeCheckpoint(selectedItem.pointName || selectedItem.title) === 'all' ? '未归类' : normalizeCheckpoint(selectedItem.pointName || selectedItem.title)}
                      {totalCount > 0 ? ` · 任务完成 ${doneCount}/${totalCount}` : ''}
                      {selectedItem.meta?.videoTitle ? ` · ${selectedItem.meta.videoTitle}` : ''}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap gap-3">
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => {
                        close()
                        openStudentProfile(selectedItem.studentId)
                      }}
                    >
                      学生档案
                    </AppButton>
                    <AppButton type="button" variant="ghost" size="md" disabled={loading || submitting} onClick={() => void loadFeedbacks()}>
                      刷新
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={submitting || selectedItem.status === 'read'}
                      onClick={() => void markAsRead()}
                    >
                      {submitting ? '提交中…' : selectedItem.status === 'read' ? '已查看' : '标记已查看'}
                    </AppButton>
                  </div>
                  {error ? (
                    <div className="rounded-[var(--radius-card)] bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">反馈内容</div>
                <div className="rounded-[var(--radius-card)] bg-[var(--color-bg-left)] px-4 py-3 text-sm leading-7 text-[var(--color-text-secondary)]">
                  {selectedItem.content || '该反馈未填写文字内容。'}
                </div>
              </div>

              {selectedItem.attachments.length > 0 ? (
                <div>
                  <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">截图附件</div>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {selectedItem.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={resolveAssetUrl(attachment.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white transition-colors hover:border-[var(--color-primary)]"
                      >
                        <img
                          src={resolveAssetUrl(attachment.url)}
                          alt={attachment.name}
                          className="h-40 w-full object-cover"
                        />
                        <div className="truncate border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                          {attachment.name}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
