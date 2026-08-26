import { useEffect, useMemo, useState } from 'react'
import { AppButton } from '../../../../components/ui/AppButton'
import { AppCard } from '../../../../components/ui/AppCard'
import { api } from '../../../../lib/api'

interface MailboxItem {
  id: number
  student_id: number
  student_name: string
  real_student_name?: string | null
  student_phone?: string | null
  category: string
  content: string
  anonymous: boolean | number
  status: 'pending' | 'resolved'
  raw_status?: string
  reply?: string | null
  created_at: string
  handled_at?: string | null
  handled_by_name?: string | null
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

function getStatusMeta(status: MailboxItem['status']) {
  return status === 'resolved'
    ? { label: '已处理', className: 'bg-green-50 text-green-600' }
    : { label: '待处理', className: 'bg-orange-50 text-orange-600' }
}

export function MailboxView() {
  const [items, setItems] = useState<MailboxItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function loadMailbox() {
    setLoading(true)
    setError('')

    try {
      const data = await api.get<MailboxItem[]>('/api/teacher/mailbox')
      const nextItems = Array.isArray(data) ? data : []
      setItems(nextItems)
      setSelectedId((current) => {
        if (current && nextItems.some((item) => item.id === current)) {
          return current
        }

        return nextItems[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '信箱加载失败')
      setItems([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMailbox()
  }, [])

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  useEffect(() => {
    setReply(selectedItem?.reply ?? '')
  }, [selectedItem])

  async function updateMailbox(status: 'pending' | 'resolved') {
    if (!selectedItem) return

    setSubmitting(true)
    setError('')

    try {
      await api.put(`/api/teacher/mailbox/${selectedItem.id}`, { status, reply })
      await loadMailbox()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-4">
      <AppCard className="min-h-0 overflow-hidden p-0">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">校长信箱</div>
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">查看学生意见并处理回复</div>
        </div>
        <div className="h-[calc(100%-68px)] overflow-auto px-2 py-2">
          {loading ? <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">加载中…</div> : null}
          {!loading && items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">暂无信箱内容</div>
          ) : null}
          {!loading && items.map((item) => {
            const statusMeta = getStatusMeta(item.status)
            const isActive = item.id === selectedId

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
                  <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.student_name}</div>
                  <span className={['rounded px-2 py-0.5 text-[10px] font-medium', statusMeta.className].join(' ')}>
                    {statusMeta.label}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.category}</div>
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{item.content}</div>
                <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">{formatTime(item.created_at)}</div>
              </button>
            )
          })}
        </div>
      </AppCard>

      <AppCard className="min-h-0 overflow-auto">
        {!selectedItem ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">请选择一条信箱记录</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
              <div>
                <div className="text-lg font-semibold text-[var(--color-text-primary)]">{selectedItem.category}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                  <span>学生：{selectedItem.student_name}</span>
                  <span>匿名：{selectedItem.anonymous ? '是' : '否'}</span>
                  <span>提交：{formatTime(selectedItem.created_at)}</span>
                  <span>处理人：{selectedItem.handled_by_name || '—'}</span>
                  <span>处理时间：{formatTime(selectedItem.handled_at)}</span>
                </div>
                {!selectedItem.anonymous && selectedItem.student_phone ? (
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">手机号：{selectedItem.student_phone}</div>
                ) : null}
              </div>
              <span className={['rounded px-2.5 py-1 text-xs font-medium', getStatusMeta(selectedItem.status).className].join(' ')}>
                {getStatusMeta(selectedItem.status).label}
              </span>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">学生内容</div>
              <div className="rounded-[var(--radius-card)] bg-[var(--color-bg-left)] px-4 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                {selectedItem.content}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">处理回复</div>
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="填写处理说明或回复内容…"
                className="min-h-36 w-full resize-y rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            {error ? (
              <div className="rounded-[var(--radius-card)] bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
            ) : null}

            <div className="flex items-center gap-3">
              <AppButton type="button" variant="primary" size="md" disabled={submitting} onClick={() => void updateMailbox('resolved')}>
                {submitting ? '提交中…' : '标记已处理'}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="md"
                disabled={submitting || selectedItem.status === 'pending'}
                onClick={() => void updateMailbox('pending')}
              >
                恢复待处理
              </AppButton>
              <AppButton type="button" variant="ghost" size="md" disabled={loading || submitting} onClick={() => void loadMailbox()}>
                刷新
              </AppButton>
            </div>
          </div>
        )}
      </AppCard>
    </div>
  )
}
