import { createPortal } from 'react-dom'
import { addMonths, eachDayOfInterval, endOfMonth, format, isToday, parseISO, startOfMonth, subMonths } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'
import { buildContactsByTab } from '../../lib/chatSelectors'
import { useWorkbenchStore } from '../../store/workbenchStore'
import type { CalEvent, ChatMessage, ContactItem, StudentItem } from '../../types'
import { ManageMembersModal } from './ManageMembersModal'
import { NotesModal } from './NotesModal'

const chatLogger = logger.child('chat')

const WS_STATUS_META = {
  connecting: { label: '连接中…', cls: 'bg-gray-100 text-gray-500' },
  open: { label: '已连接', cls: 'bg-green-50 text-green-600' },
  reconnecting: { label: '重连中…', cls: 'bg-orange-50 text-orange-600' },
  closed: { label: '已断开', cls: 'bg-red-50 text-red-500' },
  idle: { label: '', cls: '' },
} as const

const studentStatusConfig = {
  normal: { label: '正常', cls: 'bg-green-100 text-green-600' },
  warning: { label: '异常', cls: 'bg-red-100 text-red-500' },
  new: { label: '新学员', cls: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' },
  leave: { label: '已请假', cls: 'bg-gray-100 text-gray-500' },
  completed: { label: '已完成', cls: 'bg-teal-50 text-teal-700' },
}

const roleBubbleStyle: Record<string, string> = {
  '带教老师': 'bg-[var(--color-primary)] text-white',
  '学生': 'bg-gray-100 text-[var(--color-text-primary)]',
  '诊断老师': 'bg-[#e6f1fb] text-[#185fa5]',
  '学管': 'bg-[#e8f5e2] text-[#2d6a2d]',
  '校长': 'bg-[#f3e8ff] text-[#6b21a8]',
}

const roleAvatarColor: Record<string, string> = {
  '带教老师': '#e8845a',
  '学生': '#888888',
  '诊断老师': '#4a90d9',
  '学管': '#4caf74',
  '校长': '#9c6fcc',
}

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const WEEK_HEADERS = ['日', '一', '二', '三', '四', '五', '六']
const EMOJIS = ['😀', '😁', '😂', '😊', '😉', '😍', '🤔', '😎', '😭', '👍', '👏', '🙏', '🎉', '❤️', '🔥', '💪']

function formatDateLabel(date: string): string {
  if (!date) return ''

  try {
    const parsed = parseISO(date)
    return `${format(parsed, 'M月d日')} 星期${DAY_NAMES[parsed.getDay()]}`
  } catch {
    return date
  }
}

function DatePickerCalendar({
  activeDates,
  selected,
  onSelect,
}: {
  activeDates: Set<string>
  selected: string | null
  onSelect: (date: string | null) => void
}) {
  const [viewDate, setViewDate] = useState(() => {
    const sorted = [...activeDates].sort()
    return sorted.length ? startOfMonth(parseISO(sorted[sorted.length - 1])) : startOfMonth(new Date())
  })

  const days = eachDayOfInterval({ start: startOfMonth(viewDate), end: endOfMonth(viewDate) })
  const leadingBlanks = days[0].getDay()

  return (
    <div className="w-56 select-none">
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          onClick={() => setViewDate((date) => subMonths(date, 1))}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{format(viewDate, 'yyyy年M月')}</span>
        <button
          type="button"
          onClick={() => setViewDate((date) => addMonths(date, 1))}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {WEEK_HEADERS.map((header) => (
          <div key={header} className="text-center text-[10px] text-[var(--color-text-muted)]">{header}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <div key={`blank_${index}`} />
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const hasMessage = activeDates.has(key)
          const selectedDay = selected === key

          return (
            <button
              key={key}
              type="button"
              disabled={!hasMessage}
              onClick={() => onSelect(selectedDay ? null : key)}
              className={[
                'relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors',
                selectedDay
                  ? 'bg-[var(--color-primary)] font-semibold text-white'
                  : hasMessage
                    ? 'font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-light)]'
                    : 'cursor-default text-[var(--color-text-muted)] opacity-40',
              ].join(' ')}
            >
              {format(day, 'd')}
              {isToday(day) && !selectedDay && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--color-primary)]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Bubble({
  msg,
  onContextMenu,
  onResend,
}: {
  msg: ChatMessage
  onContextMenu: (event: React.MouseEvent) => void
  onResend?: (message: ChatMessage) => void
}) {
  const isSelf = msg.sender === '带教老师'
  const bubbleCls = roleBubbleStyle[msg.sender] ?? 'bg-gray-100 text-[var(--color-text-primary)]'
  const avatarColor = roleAvatarColor[msg.sender] ?? '#888'

  return (
    <div className={['flex items-end gap-2', isSelf ? 'flex-row-reverse' : ''].join(' ')} onContextMenu={onContextMenu}>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: avatarColor }}
      >
        {msg.senderName.slice(0, 1)}
      </div>

      <div className={['flex max-w-[65%] flex-col', isSelf ? 'items-end' : 'items-start'].join(' ')}>
        {!isSelf && (
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">{msg.senderName}</span>
            <span className="rounded-full bg-[var(--color-bg-left)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]">{msg.sender}</span>
          </div>
        )}

        {msg.replyTo && (
          <div className="mb-1 max-w-full rounded border-l-2 border-[var(--color-primary)] bg-[var(--color-bg-left)] px-2 py-1">
            <div className="text-[10px] font-semibold text-[var(--color-primary)]">{msg.replyTo.senderName}</div>
            <div className="truncate text-[10px] text-[var(--color-text-secondary)]">{msg.replyTo.text}</div>
          </div>
        )}

        <div
          className={[
            'whitespace-pre-wrap rounded-[var(--radius-bubble)] px-3 py-2 text-sm',
            bubbleCls,
            msg.failed ? 'border border-red-300 opacity-80' : '',
            msg.pending ? 'opacity-60' : '',
          ].join(' ')}
        >
          {msg.text}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
          {msg.failed ? (
            <button
              type="button"
              onClick={() => onResend?.(msg)}
              className="font-medium text-red-500 hover:text-red-600 hover:underline"
            >
              发送失败 · 点击重发
            </button>
          ) : (
            msg.pending && <span className="italic">发送中…</span>
          )}
          <span>{msg.time}</span>
        </div>
      </div>
    </div>
  )
}

function AddEventModal({
  initialText,
  onAdd,
  onClose,
}: {
  initialText: string
  onAdd: (event: CalEvent) => void | Promise<boolean>
  onClose: () => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [title, setTitle] = useState(initialText.slice(0, 30))
  const [date, setDate] = useState(today)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:00')
  const [type, setType] = useState<CalEvent['type']>('meeting')

  function submit() {
    if (!title.trim() || !date || !startTime || !endTime) return
    void Promise.resolve(onAdd({ id: `ev_${crypto.randomUUID()}`, title: title.trim(), date, startTime, endTime, type })).then((ok) => {
      // addCalendarEvent 失败时返回 false（store 已回滚并提示），保留弹窗让用户重试
      if (ok !== false) onClose()
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-[min(480px,94vw)] rounded-[var(--radius-card)] bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">新增日程</div>
        <div className="space-y-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <div className="flex gap-2">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="flex-1 rounded border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="flex-1 rounded border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as CalEvent['type'])} className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]">
            <option value="meeting">会议</option>
            <option value="class">课程</option>
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]">取消</button>
          <button type="button" onClick={submit} className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)]">确认</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="w-64 p-3">
      <div className="mb-2 text-[11px] font-semibold text-[var(--color-text-secondary)]">选择表情</div>
      <div className="grid grid-cols-4 gap-2">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-lg transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function findStudentStatus(contact: ContactItem, student: StudentItem | null) {
  return contact.studentStatus ? studentStatusConfig[contact.studentStatus] : (student ? studentStatusConfig[student.status] : null)
}

export function ChatView() {
  const selectedContactId = useWorkbenchStore((s) => s.selectedContactId)
  const teacherName = useWorkbenchStore((s) => s.teacherName)
  const groupMembersMap = useWorkbenchStore((s) => s.groupMembersMap)
  const openManageMembers = useWorkbenchStore((s) => s.openManageMembers)
  const selectContact = useWorkbenchStore((s) => s.selectContact)
  const addCalendarEvent = useWorkbenchStore((s) => s.addCalendarEvent)
  const openNotes = useWorkbenchStore((s) => s.openNotes)
  const notesMap = useWorkbenchStore((s) => s.notesMap)
  const loadNotes = useWorkbenchStore((s) => s.loadNotes)
  const openStudentProfile = useWorkbenchStore((s) => s.openStudentProfile)
  const openTeacherProfile = useWorkbenchStore((s) => s.openTeacherProfile)
  const chatContacts = useWorkbenchStore((s) => s.chatContacts)
  const students = useWorkbenchStore((s) => s.students)
  const abnormalStudents = useWorkbenchStore((s) => s.abnormalStudents)
  const complaintsMap = useWorkbenchStore((s) => s.complaintsMap)
  const chatMessagesMap = useWorkbenchStore((s) => s.chatMessagesMap)
  const loadChatMessages = useWorkbenchStore((s) => s.loadChatMessages)
  const sendChatMessage = useWorkbenchStore((s) => s.sendChatMessage)
  const removeChatMessage = useWorkbenchStore((s) => s.removeChatMessage)
  const connectChatRoom = useWorkbenchStore((s) => s.connectChatRoom)
  const disconnectChatRoom = useWorkbenchStore((s) => s.disconnectChatRoom)
  const loadGroupMembers = useWorkbenchStore((s) => s.loadGroupMembers)
  const wsStatus = useWorkbenchStore((s) => s.wsStatus)

  const contactsByTab = useMemo(() => buildContactsByTab(chatContacts, complaintsMap), [chatContacts, complaintsMap])
  const studentById = useMemo(() => Object.fromEntries(students.map((student) => [student.id, student])), [students])
  const contactIdToStudentId = useMemo(() => chatContacts.reduce<Record<string, string>>((acc, contact) => {
    if (contact.studentId) acc[contact.id] = contact.studentId
    return acc
  }, {}), [chatContacts])
  const contactSubtitleById = useMemo(() => chatContacts.reduce<Record<string, string>>((acc, contact) => {
    acc[contact.id] = contact.subtitle ?? ''
    return acc
  }, {}), [chatContacts])
  const contact = useMemo(
    () => (selectedContactId ? chatContacts.find((item) => item.id === selectedContactId) ?? null : null),
    [chatContacts, selectedContactId],
  )
  const messages = contact ? (chatMessagesMap[contact.id] ?? []) : []

  const [draft, setDraft] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const [addEventMsg, setAddEventMsg] = useState<ChatMessage | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ msgId: string; x: number; y: number } | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [filterDate, setFilterDate] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [overviewTab, setOverviewTab] = useState<'today' | 'yesterday' | 'complaints'>('today')
  const [showFilePanel, setShowFilePanel] = useState(false)
  const [fileQuery, setFileQuery] = useState('')

  const listRef = useRef<HTMLDivElement | null>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const emojiPanelRef = useRef<HTMLDivElement>(null)
  const datePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contact?.id) {
      disconnectChatRoom()
      return
    }

    void loadChatMessages(contact.id)
    void loadGroupMembers(contact.id)
    void loadNotes(contact.id)
    connectChatRoom(contact.id)

    return () => {
      disconnectChatRoom()
    }
  }, [connectChatRoom, contact?.id, disconnectChatRoom, loadChatMessages, loadGroupMembers, loadNotes])

  useEffect(() => {
    const element = listRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [contact?.id, messages.length])

  useEffect(() => {
    setFilterDate(null)
    setShowDatePicker(false)
    setReplyTarget(null)
    setShowFilePanel(false)
  }, [contact?.id])

  useEffect(() => {
    if (!showEmoji) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      // 表情面板通过 portal 渲染在 document.body 下，不在 emojiRef 子树内，
      // 点击面板内容不算"点击外部"，两个 ref 都要检查
      const insideTrigger = emojiRef.current?.contains(target) ?? false
      const insidePanel = emojiPanelRef.current?.contains(target) ?? false
      if (!insideTrigger && !insidePanel) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showEmoji])

  useEffect(() => {
    if (!showDatePicker) return
    const handleClick = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDatePicker])

  useEffect(() => {
    if (!ctxMenu) return
    const handleClick = () => setCtxMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [ctxMenu])

  async function loadOlderMessages() {
    if (!contact?.id || loadingHistory || filterDate || messages.length === 0) return

    const firstMessage = messages[0]
    if (!firstMessage?.id) return

    setLoadingHistory(true)
    try {
      await loadChatMessages(contact.id, firstMessage.id)
    } finally {
      setLoadingHistory(false)
    }
  }

  function buildLines(targetContacts: ContactItem[]) {
    const lines: string[] = [
      '=== 带教老师工作台 · 聊天记录导出 ===',
      `导出时间：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
      '',
    ]

    targetContacts.forEach((item) => {
      const roomMessages = chatMessagesMap[item.id] ?? []
      if (roomMessages.length === 0) return

      lines.push('─'.repeat(36))
      lines.push(`【${item.name}】${contactSubtitleById[item.id] ?? ''}`)
      lines.push('─'.repeat(36))
      roomMessages.forEach((message) => {
        const replyPart = message.replyTo ? `（引用 ${message.replyTo.senderName}：${message.replyTo.text.slice(0, 20)}）` : ''
        lines.push(`[${message.time}] ${message.senderName}（${message.sender}）：${message.text}${replyPart}`)
      })
      lines.push('')
    })

    return lines
  }

  function downloadTxt(lines: string[], filename: string) {
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleSendMessage() {
    const text = draft.trim()
    if (!contact || !text) return

    try {
      await sendChatMessage(contact.id, text, replyTarget?.id ?? null)
      setDraft('')
      setReplyTarget(null)
    } catch (error) {
      // 失败保留草稿，用户可直接重试；WS 路径的失败由气泡上的"点击重发"兜底
      chatLogger.warn('chat.send.failed', { contactId: contact.id, message: error instanceof Error ? error.message : String(error) })
      toast.error(error instanceof Error ? error.message : '发送失败，请稍后重试')
    }
  }

  async function handleResend(message: ChatMessage) {
    if (!contact || message.pending) return
    removeChatMessage(contact.id, message.id)
    try {
      await sendChatMessage(contact.id, message.text)
    } catch (error) {
      chatLogger.warn('chat.resend.failed', { contactId: contact.id, message: error instanceof Error ? error.message : String(error) })
      toast.error(error instanceof Error ? error.message : '重发失败，请稍后重试')
    }
  }

  function findMsg(id: string) {
    return messages.find((item) => item.id === id || item.clientId === id) ?? null
  }

  if (!contact) {
    const overviewTabs = [
      { key: 'today' as const, label: '今日消息', contacts: contactsByTab.todayMessages },
      { key: 'yesterday' as const, label: '昨日未回', contacts: contactsByTab.yesterdayUnreplied },
      { key: 'complaints' as const, label: '投诉', contacts: contactsByTab.complaints },
    ]
    const activeContacts = overviewTabs.find((item) => item.key === overviewTab)?.contacts ?? []
    const warningStudents = abnormalStudents
      .filter((item) => item.status === 'warning')
      .map((item) => {
        const student = studentById[item.id]
        const abnormalContact = chatContacts.find((entry) => entry.studentId === item.id)
        return student && abnormalContact ? { student, contact: abnormalContact } : null
      })
      .filter((item): item is { student: StudentItem; contact: ContactItem } => Boolean(item))

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">聊天总览</span>
          <button
            type="button"
            onClick={() => downloadTxt(buildLines(chatContacts), `全部聊天记录_${format(new Date(), 'yyyyMMdd_HHmmss')}.txt`)}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
          >
            导出记录
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--color-border)] px-3 py-2">
          {overviewTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setOverviewTab(item.key)}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                overviewTab === item.key ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)]',
              ].join(' ')}
            >
              {item.label}
              {item.contacts.length > 0 && (
                <span className={['ml-1 rounded-full px-1 text-[10px]', overviewTab === item.key ? 'bg-white/30' : 'bg-[var(--color-bg-left)]'].join(' ')}>
                  {item.contacts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-2">
          {overviewTab === 'yesterday' && warningStudents.length > 0 && (
            <div className="mb-3 rounded-[var(--radius-card)] border border-red-100 bg-red-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <span className="text-xs font-semibold text-red-600">异常用户</span>
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-500">{warningStudents.length} 人</span>
              </div>
              <div className="space-y-1">
                {warningStudents.map(({ student, contact: abnormalContact }) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => selectContact(abnormalContact.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-left transition-colors hover:bg-red-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: student.color }}>
                      {student.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[var(--color-text-primary)]">{student.name}</div>
                      <div className="text-[10px] text-[var(--color-text-muted)]">{student.grade} · {student.subject}</div>
                    </div>
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-500">异常</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            {activeContacts.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">暂无消息</div>
            ) : (
              activeContacts.map((item) => {
                const studentId = contactIdToStudentId[item.id]
                const student = studentId ? studentById[studentId] : null
                const statusCfg = findStudentStatus(item, student)
                const recent = [...(chatMessagesMap[item.id] ?? [])].reverse()[0]

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectContact(item.id)}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-card)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-primary-light)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: item.color }}>
                      {item.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.name}</span>
                        {item.tag === 'complaint' && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] text-red-500">投诉</span>}
                        {statusCfg && <span className={['rounded-full px-1.5 py-0.5 text-[9px] font-medium', statusCfg.cls].join(' ')}>{statusCfg.label}</span>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{recent?.text ?? item.preview}</div>
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{recent?.time ?? item.time}</div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    )
  }

  const members = groupMembersMap[contact.id] ?? []
  const studentId = contactIdToStudentId[contact.id]
  const student = studentId ? studentById[studentId] : null
  const isColleague = contact.contactType === 'colleague'
  const statusCfg = findStudentStatus(contact, student)
  const displaySubtitle = isColleague
    ? (contactSubtitleById[contact.id] || '同事')
    : `${contactSubtitleById[contact.id] || '课程信息'} · ${members.length} 个角色`
  const displayMessages = filterDate ? messages.filter((item) => item.date === filterDate) : messages
  const listItems: Array<{ type: 'divider'; date: string } | { type: 'msg'; msg: ChatMessage }> = []
  let lastDate = ''
  displayMessages.forEach((message) => {
    const date = message.date ?? ''
    if (date !== lastDate) {
      listItems.push({ type: 'divider', date })
      lastDate = date
    }
    listItems.push({ type: 'msg', msg: message })
  })

  const filteredFileMessages = (fileQuery.trim()
    ? Object.values(chatMessagesMap).flat().filter((item) => (item.fileName || item.text).toLowerCase().includes(fileQuery.trim().toLowerCase()))
    : Object.values(chatMessagesMap).flat().filter((item) => item.msgType === 'file'))
    .filter((item) => item.msgType === 'file')

  return (
    <>
      <div className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            title="查看资料"
            onClick={() => {
              if (isColleague) {
                openTeacherProfile(contact.name)
              } else if (studentId) {
                openStudentProfile(studentId)
              }
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-80 hover:ring-2 hover:ring-[var(--color-primary)] hover:ring-offset-1"
            style={{ backgroundColor: contact.color }}
          >
            {contact.avatar}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{contact.name}</div>
              {statusCfg && <span className={['rounded-full px-1.5 py-0.5 text-[9px] font-medium', statusCfg.cls].join(' ')}>{statusCfg.label}</span>}
              {WS_STATUS_META[wsStatus].label && (
                <span className={['rounded-full px-1.5 py-0.5 text-[9px] font-medium', WS_STATUS_META[wsStatus].cls].join(' ')}>
                  {WS_STATUS_META[wsStatus].label}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-[var(--color-text-secondary)]">
              <span>{displaySubtitle}</span>
              {(notesMap[contact.id] ?? []).map((note) => (
                <span key={note.id} className="flex items-center gap-0.5">
                  <span className="text-[var(--color-text-muted)]">·</span>
                  <span>{note.text}</span>
                </span>
              ))}
              <button type="button" onClick={() => openNotes(contact.id)} className="text-[var(--color-primary)] hover:underline">+ 备注</button>
            </div>
          </div>

          <div ref={datePickerRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowDatePicker((value) => !value)}
              className={[
                'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                filterDate
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
              ].join(' ')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-full z-20 mt-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-3 shadow-lg">
                <DatePickerCalendar activeDates={new Set(messages.map((item) => item.date).filter(Boolean) as string[])} selected={filterDate} onSelect={(date) => { setFilterDate(date); setShowDatePicker(false) }} />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setShowFilePanel((value) => !value); setFileQuery('') }}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
              showFilePanel
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
            ].join(' ')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
          </button>

          <button
            type="button"
            onClick={() => downloadTxt(buildLines([contact]), `${contact.name}_聊天记录_${format(new Date(), 'yyyyMMdd_HHmmss')}.txt`)}
            className="shrink-0 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[10px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            导出
          </button>
        </div>

        {filterDate && (
          <div className="flex items-center justify-between border-b border-[var(--color-primary-light)] bg-[var(--color-primary-light)] px-4 py-1.5">
            <span className="text-[11px] text-[var(--color-primary)]">正在查看 {formatDateLabel(filterDate)} 的消息</span>
            <button type="button" onClick={() => setFilterDate(null)} className="text-[10px] text-[var(--color-primary)] hover:underline">清除</button>
          </div>
        )}

        {!isColleague && (
          <div className="border-b border-[var(--color-border)] px-4 py-2">
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <span key={`${contact.id}-${member.role}-${member.name}`} className="rounded-full bg-[var(--color-bg-left)] px-2 py-1 text-[10px] text-[var(--color-text-secondary)]">
                  {member.role}：{member.name}
                </span>
              ))}
              <button
                type="button"
                onClick={() => openManageMembers(contact.id)}
                className="ml-auto rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[10px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                管理成员
              </button>
            </div>
          </div>
        )}

        {showFilePanel && (
          <div className="flex flex-col border-b border-[var(--color-border)] bg-[var(--color-bg-left)]" style={{ maxHeight: '45%' }}>
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
              <input autoFocus type="text" value={fileQuery} onChange={(e) => setFileQuery(e.target.value)} placeholder="搜索文件名" className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]" />
              <span className="text-[10px] text-[var(--color-text-muted)]">共 {filteredFileMessages.length} 个文件</span>
            </div>
            <div className="flex-1 overflow-auto">
              {filteredFileMessages.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">未找到相关文件</div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {filteredFileMessages.map((message) => (
                    <div key={message.id} className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)]">{message.fileName || message.text}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          ref={listRef}
          className="flex-1 overflow-auto px-4 py-3"
          onScroll={(e) => {
            if (e.currentTarget.scrollTop <= 0) {
              void loadOlderMessages()
            }
          }}
        >
          {loadingHistory && <div className="mb-3 text-center text-[10px] text-[var(--color-text-muted)]">加载历史中...</div>}
          {listItems.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]">当前暂无聊天记录</div>
          ) : (
            <div className="space-y-3">
              {listItems.map((item, index) => item.type === 'divider' ? (
                <div key={`divider_${item.date}_${index}`} className="flex items-center gap-2 py-1">
                  <div className="h-px flex-1 bg-[var(--color-border)]" />
                  <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{formatDateLabel(item.date)}</span>
                  <div className="h-px flex-1 bg-[var(--color-border)]" />
                </div>
              ) : (
                <Bubble
                  key={item.msg.id}
                  msg={item.msg}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    const x = Math.min(event.clientX, window.innerWidth - 160)
                    const y = Math.min(event.clientY, window.innerHeight - 120)
                    setCtxMenu({ msgId: item.msg.id, x, y })
                  }}
                  onResend={(message) => void handleResend(message)}
                />
              ))}
            </div>
          )}
        </div>

        {replyTarget && (
          <div className="flex items-start gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2">
            <div className="min-w-0 flex-1 border-l-2 border-[var(--color-primary)] pl-2">
              <div className="text-[10px] font-semibold text-[var(--color-primary)]">{replyTarget.senderName}</div>
              <div className="truncate text-[10px] text-[var(--color-text-secondary)]">{replyTarget.text}</div>
            </div>
            <button type="button" onClick={() => setReplyTarget(null)} className="shrink-0 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">×</button>
          </div>
        )}

        <div className="space-y-2 border-t border-[var(--color-border)] px-3 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <div ref={emojiRef} className="relative">
              <button
                type="button"
                onClick={() => setShowEmoji((value) => !value)}
                className={['flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-primary-light)]', showEmoji ? 'bg-[var(--color-primary-light)]' : ''].join(' ')}
              >
                😊
              </button>
              {showEmoji && createPortal(
                <div
                  ref={emojiPanelRef}
                  className="fixed z-50 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white shadow-lg"
                  style={{ bottom: 80, left: 16 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <EmojiPicker onPick={(emoji) => { setDraft((value) => value + emoji); setShowEmoji(false) }} />
                </div>,
                document.body,
              )}
            </div>
            <span className="text-[10px] text-[var(--color-text-muted)]">当前仅发送真实文本消息</span>
            <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">{teacherName || '老师'}</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSendMessage()
                }
              }}
              placeholder="输入消息..."
              className="h-9 flex-1 rounded-[var(--radius-card)] bg-gray-100 px-3 text-sm outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
            <button type="button" onClick={() => void handleSendMessage()} className="h-9 shrink-0 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]">发送</button>
          </div>
        </div>
      </div>

      {ctxMenu && createPortal(
        <div
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 200 }}
          className="min-w-[128px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const message = findMsg(ctxMenu.msgId)
              if (message) setReplyTarget(message)
              setCtxMenu(null)
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-[var(--color-primary-light)]"
          >
            回复
          </button>
          <button
            type="button"
            onClick={() => {
              const message = findMsg(ctxMenu.msgId)
              if (message) setAddEventMsg(message)
              setCtxMenu(null)
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-[var(--color-primary-light)]"
          >
            新增日程
          </button>
        </div>,
        document.body,
      )}

      <ManageMembersModal />
      <NotesModal contactName={contact.name} />
      {addEventMsg && <AddEventModal initialText={addEventMsg.text} onAdd={addCalendarEvent} onClose={() => setAddEventMsg(null)} />}
    </>
  )
}
