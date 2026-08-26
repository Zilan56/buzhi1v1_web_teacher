import { buildContactsByTab } from '../../lib/chatSelectors'
import { useWorkbenchStore } from '../../store/workbenchStore'
import { ChatListItem } from './ChatListItem'

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function ChatList() {
  const tab = useWorkbenchStore((s) => s.leftMessageTab)
  const selectedContactId = useWorkbenchStore((s) => s.selectedContactId)
  const selectContact = useWorkbenchStore((s) => s.selectContact)
  const chatContacts = useWorkbenchStore((s) => s.chatContacts)
  const students = useWorkbenchStore((s) => s.students)
  const abnormalStudents = useWorkbenchStore((s) => s.abnormalStudents)
  const complaintsMap = useWorkbenchStore((s) => s.complaintsMap)

  const contactsByTab = buildContactsByTab(chatContacts, complaintsMap)

  if (tab === 'abnormalUsers') {
    const abnormalByStudentId = new Set(
      abnormalStudents
        .filter((item) => item.status === 'warning')
        .map((item) => item.id),
    )

    const abnormalItems = students.filter((student) => abnormalByStudentId.has(student.id))

    return (
      <div className="mt-2 flex-1 overflow-auto px-4 pb-3">
        {abnormalItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--color-text-muted)]">暂无异常用户</div>
        ) : (
          <div className="space-y-2">
            {abnormalItems.map((student) => {
              const contact = chatContacts.find((item) => item.studentId === student.id)

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => contact && selectContact(contact.id)}
                  disabled={!contact}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-red-100 bg-red-50 px-3 py-2 text-left transition-colors hover:bg-red-100 disabled:opacity-50"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: student.color }}
                  >
                    {student.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--color-text-primary)]">{student.name}</div>
                    <div className="truncate text-[10px] text-[var(--color-text-muted)]">{student.grade}.{student.subject}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-500">异常</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const contacts = contactsByTab[tab] ?? []
  const studentContacts = chatContacts
    .filter((contact) => contact.contactType !== 'colleague')
    .sort((left, right) => toTimestamp(right.lastMessageAt) - toTimestamp(left.lastMessageAt))
  const showStudentFallback =
    (tab === 'todayMessages' || tab === 'yesterdayUnreplied')
    && contacts.length === 0
    && studentContacts.length > 0
  const displayContacts = showStudentFallback ? studentContacts : contacts

  return (
    <div className="mt-2 flex-1 overflow-auto px-2 pb-3">
      {showStudentFallback ? (
        <div className="px-2 pb-2 text-[11px] text-[var(--color-text-muted)]">
          当前筛选下暂无消息，已显示全部学生联系人
        </div>
      ) : null}
      <div className="space-y-1 px-2">
        {displayContacts.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--color-text-muted)]">暂无消息</div>
        ) : (
          displayContacts.map((contact) => (
            <ChatListItem
              key={contact.id}
              item={contact}
              selected={contact.id === selectedContactId}
              onClick={() => selectContact(contact.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
