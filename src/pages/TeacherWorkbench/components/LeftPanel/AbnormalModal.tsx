import { createPortal } from 'react-dom'
import { useMemo, useState } from 'react'
import { useWorkbenchStore } from '../../store/workbenchStore'

const severityCfg = {
  high: { label: '高风险', badge: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500' },
  medium: { label: '需关注', badge: 'bg-orange-50 text-orange-600 border-orange-200', dot: 'bg-orange-400' },
  low: { label: '轻提醒', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
}

function UserCard({
  name,
  avatar,
  color,
  grade,
  subject,
  reason,
  updatedAt,
  severity,
  transferred,
  onTransfer,
  onContact,
}: {
  name: string
  avatar: string
  color: string
  grade: string
  subject: string
  reason: string
  updatedAt: string
  severity: 'high' | 'medium' | 'low'
  transferred: boolean
  onTransfer: () => void
  onContact: () => void
}) {
  const scfg = severityCfg[severity]

  return (
    <div
      className={[
        'rounded-[var(--radius-card)] border transition-colors',
        transferred ? 'border-[var(--color-border)] opacity-60' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 p-3">
        <div className={['mt-0.5 h-2 w-2 shrink-0 self-start rounded-full', scfg.dot].join(' ')} />
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {avatar}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{name}</span>
            <span className={['rounded-full border px-1.5 py-0.5 text-[9px] font-medium', scfg.badge].join(' ')}>
              {scfg.label}
            </span>
            {transferred && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[9px] text-gray-400">
                已移交学管
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
            {[grade, subject, reason].filter(Boolean).join(' · ') || '异常跟进'}
          </div>
          {updatedAt && (
            <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">最近更新时间：{updatedAt}</div>
          )}
        </div>
      </div>

      {!transferred && (
        <div className="flex gap-2 border-t border-[var(--color-border)] px-3 py-2.5">
          <button
            type="button"
            onClick={onContact}
            className="flex-1 rounded-lg border border-[var(--color-border)] py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            联系跟进
          </button>
          <button
            type="button"
            onClick={onTransfer}
            className="flex-1 rounded-lg bg-orange-500 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
          >
            移交学管
          </button>
        </div>
      )}
    </div>
  )
}

export function AbnormalModal() {
  const openTaskKey = useWorkbenchStore((s) => s.openTaskKey)
  const close = useWorkbenchStore((s) => s.closeTaskModal)
  const selectContact = useWorkbenchStore((s) => s.selectContact)
  const abnormalStudents = useWorkbenchStore((s) => s.abnormalStudents)
  const students = useWorkbenchStore((s) => s.students)
  const chatContacts = useWorkbenchStore((s) => s.chatContacts)

  const [transferred, setTransferred] = useState<Set<string>>(new Set())

  const items = useMemo(() => (
    abnormalStudents
      .filter((item) => item.status === 'warning')
      .map((item) => {
        const student = students.find((entry) => entry.id === item.id)
        const contact = chatContacts.find((entry) => entry.studentId === item.id)

        return {
          id: item.id,
          name: student?.name ?? item.name,
          avatar: student?.avatar ?? (item.name || '学').slice(0, 1),
          color: student?.color ?? '#e8845a',
          grade: student?.grade ?? '',
          subject: student?.subject ?? '',
          reason: item.reason,
          severity: item.severity,
          updatedAt: item.updatedAt,
          contactId: contact?.id ?? '',
        }
      })
  ), [abnormalStudents, chatContacts, students])

  if (openTaskKey !== 'abnormalUser') return null

  const pending = items.filter((item) => !transferred.has(item.id))
  const done = items.filter((item) => transferred.has(item.id))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={close}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative flex max-h-[86vh] w-[50vw] max-w-[96vw] flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-left)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-white px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">异常用户</div>
            <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
              {pending.length} 待处理 · {done.length} 已移交
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-auto p-3">
          {pending.length === 0 && done.length === 0 && (
            <div className="py-10 text-center text-xs text-[var(--color-text-muted)]">暂无异常用户</div>
          )}

          {pending.map((item) => (
            <UserCard
              key={item.id}
              {...item}
              transferred={false}
              onTransfer={() => setTransferred((prev) => new Set([...prev, item.id]))}
              onContact={() => {
                if (!item.contactId) return
                close()
                selectContact(item.contactId)
              }}
            />
          ))}

          {done.length > 0 && (
            <>
              <div className="pt-1 text-[10px] font-semibold text-[var(--color-text-muted)]">已移交</div>
              {done.map((item) => (
                <UserCard
                  key={item.id}
                  {...item}
                  transferred={true}
                  onTransfer={() => {}}
                  onContact={() => {
                    if (!item.contactId) return
                    close()
                    selectContact(item.contactId)
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
