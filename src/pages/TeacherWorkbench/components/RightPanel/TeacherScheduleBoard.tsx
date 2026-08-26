import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  getDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../../lib/api'
import { getTeacherIdentityFromToken } from '../../../../lib/auth'
import { teacherColorFromName } from '../../../../lib/color'
import { useWorkbenchStore } from '../../store/workbenchStore'
import type { CalEvent, StudentDetailMeta, StudentItem } from '../../types'

type CalendarViewMode = 'day' | 'week' | 'month'

type TeacherOption = {
  id: string
  name: string
  role?: string
}

type ScheduleRecord = {
  id: string
  opType: '排课' | '调课'
  title: string
  date: string
  startTime: string
  endTime: string
  teacherName: string
  createdAt: string
}

type PendingSlot = {
  date: string
  startTime: string
  endTime: string
}

const VIEW_LABELS: Record<CalendarViewMode, string> = {
  day: '日',
  week: '周',
  month: '月',
}

const HOUR_START = 0
const HOUR_END = 24
const HOUR_COUNT = HOUR_END - HOUR_START
const DEFAULT_VISIBLE_HOUR = 9
const VISIBLE_HOUR_COUNT = 12
const FALLBACK_HOUR_HEIGHT = 60
const TIMELINE_LABEL_WIDTH = 64
const COLUMN_DIVIDER_CLASS = 'border-[#d7e0ea]'
const TIMELINE_DIVIDER_CLASS = 'border-[#d1dae6] shadow-[1px_0_0_0_#e6edf5]'
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const HOURS = Array.from({ length: HOUR_COUNT }, (_, index) => HOUR_START + index)

function getTeacherFromToken(): TeacherOption {
  const identity = getTeacherIdentityFromToken()
  return {
    id: identity.id,
    name: identity.name,
  }
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTop(minutes: number, hourHeight: number) {
  return ((minutes - HOUR_START * 60) / 60) * hourHeight
}

function getEventLayout(startTime: string, endTime: string, hourHeight: number) {
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)

  if (endMinutes <= startMinutes) {
    return null
  }

  return {
    top: minutesToTop(startMinutes, hourHeight),
    height: Math.max(((endMinutes - startMinutes) / 60) * hourHeight, 20),
  }
}

function useTimelineMetrics(
  containerRef: { current: HTMLDivElement | null },
  headerRef: { current: HTMLDivElement | null },
) {
  const [hourHeight, setHourHeight] = useState(FALLBACK_HOUR_HEIGHT)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const containerHeight = container.clientHeight
      const headerHeight = headerRef.current?.offsetHeight ?? 0
      const visibleHeight = Math.max(containerHeight - headerHeight, 360)
      setHourHeight(visibleHeight / VISIBLE_HOUR_COUNT)
    }

    measure()

    if (typeof ResizeObserver !== 'function') return

    const observer = new ResizeObserver(() => measure())
    observer.observe(container)
    if (headerRef.current) observer.observe(headerRef.current)

    return () => observer.disconnect()
  }, [containerRef, headerRef])

  return {
    hourHeight,
    totalHeight: HOUR_COUNT * hourHeight,
    defaultScrollTop: (DEFAULT_VISIBLE_HOUR - HOUR_START) * hourHeight,
  }
}

function addDefaultDuration(startTime: string, minutes = 90) {
  const total = timeToMinutes(startTime) + minutes
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeCalendarDate(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
    if (isoMatch) return isoMatch[1]
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, 'yyyy-MM-dd')
  }

  const fallback = String(value ?? '').trim()
  const fallbackMatch = fallback.match(/^(\d{4}-\d{2}-\d{2})/)
  return fallbackMatch ? fallbackMatch[1] : fallback
}

function mapCalendarRow(row: Record<string, unknown>): CalEvent {
  return {
    id: String(row.id ?? ''),
    date: normalizeCalendarDate(row.date),
    startTime: String(row.start_time ?? row.startTime ?? ''),
    endTime: String(row.end_time ?? row.endTime ?? ''),
    title: String(row.title ?? ''),
    type: row.type === 'meeting' ? 'meeting' : 'class',
    studentId: row.student_id === null || row.student_id === undefined ? undefined : String(row.student_id),
    link: row.link ? String(row.link) : undefined,
  }
}

function buildTeacherOptions(detailMeta: StudentDetailMeta | undefined, fallbackTeacher: TeacherOption) {
  const options = new Map<string, TeacherOption>()

  ;(detailMeta?.teamTeachers ?? []).forEach((teacher) => {
    const id = String(teacher.id || '')
    const key = id || teacher.name
    if (!key) return
    if (!options.has(key)) {
      options.set(key, { id, name: teacher.name, role: teacher.role })
    }
  })

  if (options.size === 0 && fallbackTeacher.name) {
    options.set(fallbackTeacher.id || fallbackTeacher.name, fallbackTeacher)
  }

  return [...options.values()]
}

function mergeTeacherOptions(primary: TeacherOption[], secondary: TeacherOption[]) {
  const options = new Map<string, TeacherOption>()

  ;[...primary, ...secondary].forEach((teacher) => {
    const key = teacher.id || teacher.name
    if (!key) return
    if (!options.has(key)) {
      options.set(key, teacher)
    }
  })

  return [...options.values()]
}

function pickDefaultTeacher(options: TeacherOption[], fallbackTeacher: TeacherOption) {
  const coach = options.find((teacher) => String(teacher.role || '').includes('带教'))
  return coach ?? options[0] ?? fallbackTeacher
}

function StatusTag({ student }: { student: StudentItem }) {
  const map: Record<StudentItem['status'], string> = {
    normal: 'bg-[#eef7f1] text-[#4d8b63]',
    warning: 'bg-[#fff1ee] text-[#d96b4d]',
    new: 'bg-[#eef4ff] text-[#5c7fd6]',
    leave: 'bg-[#f3f4f6] text-[#6b7280]',
    completed: 'bg-[#f3f4f6] text-[#6b7280]',
  }

  const labelMap: Record<StudentItem['status'], string> = {
    normal: '正常',
    warning: '异常',
    new: '新生',
    leave: '请假',
    completed: '结课',
  }

  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${map[student.status]}`}>
      {labelMap[student.status]}
    </span>
  )
}

function StudentListItem({
  student,
  selected,
  onSelect,
}: {
  student: StudentItem
  selected: boolean
  onSelect: (student: StudentItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(student)}
      className={[
        'flex w-full items-start gap-2.5 border-b border-[var(--color-border)] px-3 py-2.5 text-left transition-colors',
        selected ? 'bg-[var(--color-primary-light)]' : 'bg-white hover:bg-[var(--color-bg-left)]',
      ].join(' ')}
    >
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: student.color }}
      >
        {student.avatar}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{student.name}</span>
          <StatusTag student={student} />
        </div>
        <div className="mt-0.5 truncate text-[13px] text-[var(--color-text-muted)]">
          {student.grade || '未填写年级'} · {student.subject || '未填写学科'}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-[var(--color-text-muted)]">
          最近上课：{student.lastSession || '暂无'}
        </div>
      </div>
    </button>
  )
}

function EventActionModal({
  event,
  teacherColor,
  readOnly,
  submitting,
  error,
  onEdit,
  onDelete,
  onCancel,
}: {
  event: CalEvent
  teacherColor: string
  readOnly: boolean
  submitting?: boolean
  error?: string
  onEdit: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/25" />
      <div
        className="relative w-[min(520px,94vw)] rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(eventObject) => eventObject.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">日程详情</div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
          >
            ×
          </button>
        </div>
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-1 rounded-full" style={{ backgroundColor: teacherColor }} />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{event.title}</span>
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">
            {format(parseISO(event.date), 'M月d日(EEE)', { locale: zhCN })} · {event.startTime}–{event.endTime}
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">
            {event.type === 'meeting' ? '会议' : '课程'}
          </div>
          {event.link ? (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-medium text-[var(--color-primary)] underline"
            >
              打开课堂链接
            </a>
          ) : null}
        </div>
        {error ? (
          <div className="px-4 pb-2 text-[13px] text-[#d96b4d]">{error}</div>
        ) : null}
        <div className="flex gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--color-border)] py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
          >
            取消
          </button>
          {!readOnly ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                disabled={submitting}
                className="flex-1 rounded-lg bg-[var(--color-primary)] py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                修改日程（调课）
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true)
                    return
                  }
                  onDelete()
                }}
                disabled={submitting}
                className={[
                  'flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors disabled:opacity-40',
                  confirmDelete
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'border border-red-300 text-red-500 hover:bg-red-50',
                ].join(' ')}
              >
                {submitting ? '正在删除…' : confirmDelete ? '确认删除（调课）' : '删除日程'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function AddSlotModal({
  date,
  startTime,
  selectedStudent,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  date: string
  startTime: string
  selectedStudent: StudentItem | null
  submitting?: boolean
  error?: string
  onConfirm: (title: string, start: string, end: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(selectedStudent ? `课程 · ${selectedStudent.name}` : '')
  const [start, setStart] = useState(startTime)
  const [end, setEnd] = useState(addDefaultDuration(startTime))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-[min(560px,94vw)] rounded-[var(--radius-card)] bg-white p-4 shadow-lg"
        onClick={(eventObject) => eventObject.stopPropagation()}
      >
        <div className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
          添加课程 · {format(parseISO(date), 'M月d日(EEE)', { locale: zhCN })}
        </div>
        <div className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">课程名称</label>
            <input
              value={title}
              onChange={(eventObject) => setTitle(eventObject.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              placeholder="课程 · 学生姓名"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">开始时间</label>
              <input
                type="time"
                value={start}
                onChange={(eventObject) => setStart(eventObject.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">结束时间</label>
              <input
                type="time"
                value={end}
                onChange={(eventObject) => setEnd(eventObject.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          </div>
        </div>
        {error ? (
          <div className="mt-3 text-[13px] text-[#d96b4d]">{error}</div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--color-border)] py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting || !title.trim() || end <= start}
            onClick={() => onConfirm(title.trim(), start, end)}
            className="flex-1 rounded-lg bg-[var(--color-primary)] py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? '正在提交…' : '确认排课'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditEventModal({
  event,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  event: CalEvent
  submitting?: boolean
  error?: string
  onConfirm: (title: string, date: string, start: string, end: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(event.title)
  const [date, setDate] = useState(event.date)
  const [start, setStart] = useState(event.startTime)
  const [end, setEnd] = useState(event.endTime)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-[min(560px,94vw)] rounded-[var(--radius-card)] bg-white p-4 shadow-lg"
        onClick={(eventObject) => eventObject.stopPropagation()}
      >
        <div className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">修改日程（调课）</div>
        <div className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">课程名称</label>
            <input
              value={title}
              onChange={(eventObject) => setTitle(eventObject.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              placeholder="课程 · 学生姓名"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">日期</label>
            <input
              type="date"
              value={date}
              onChange={(eventObject) => setDate(eventObject.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">开始时间</label>
              <input
                type="time"
                value={start}
                onChange={(eventObject) => setStart(eventObject.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">结束时间</label>
              <input
                type="time"
                value={end}
                onChange={(eventObject) => setEnd(eventObject.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          </div>
        </div>
        {error ? (
          <div className="mt-3 text-[13px] text-[#d96b4d]">{error}</div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--color-border)] py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting || !title.trim() || !date || end <= start}
            onClick={() => onConfirm(title.trim(), date, start, end)}
            className="flex-1 rounded-lg bg-[var(--color-primary)] py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? '正在保存…' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EventBlock({
  event,
  hourHeight,
  teacherColor,
  onEventClick,
}: {
  event: CalEvent
  hourHeight: number
  teacherColor: string
  onEventClick: (event: CalEvent) => void
}) {
  const layout = getEventLayout(event.startTime, event.endTime, hourHeight)

  if (!layout) return null

  return (
    <div
      className="absolute left-0.5 right-0.5 z-20 cursor-pointer overflow-hidden rounded-md px-2 py-1.5 text-white hover:brightness-95"
      style={{
        top: layout.top,
        height: layout.height,
        backgroundColor: event.type === 'class' ? teacherColor : '#9b6fcc',
        opacity: 0.92,
      }}
      onClick={(eventObject) => {
        eventObject.stopPropagation()
        onEventClick(event)
      }}
    >
      <div className="truncate text-sm font-semibold leading-tight">{event.title}</div>
      <div className="text-[13px] opacity-80">{event.startTime}–{event.endTime}</div>
    </div>
  )
}

function WeekView({
  weekStart,
  events,
  teacherColor,
  pendingSlot,
  readOnly,
  onCellClick,
  onEventClick,
}: {
  weekStart: Date
  events: CalEvent[]
  teacherColor: string
  pendingSlot: PendingSlot | null
  readOnly: boolean
  onCellClick: (date: string, startTime: string) => void
  onEventClick: (event: CalEvent) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const defaultAnchorRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const scrollKey = useMemo(() => weekStart.toISOString(), [weekStart])
  const { hourHeight, totalHeight, defaultScrollTop } = useTimelineMetrics(scrollRef, headerRef)

  useLayoutEffect(() => {
    const node = scrollRef.current
    const anchor = defaultAnchorRef.current
    if (!node) return

    const applyScroll = () => {
      if (anchor) {
        anchor.scrollIntoView({ block: 'start' })
      }
      node.scrollTop = defaultScrollTop
    }

    applyScroll()
    const frameId = requestAnimationFrame(() => {
      applyScroll()
      requestAnimationFrame(applyScroll)
    })
    const timeoutId = window.setTimeout(applyScroll, 120)

    return () => {
      cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [defaultScrollTop, scrollKey, events.length])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    events.forEach((event) => {
      map[event.date] = [...(map[event.date] ?? []), event]
    })
    return map
  }, [events])
  const gridTemplateColumns = `64px repeat(${days.length}, minmax(0, 1fr))`

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div
        ref={headerRef}
        className="sticky top-0 z-10 grid border-b border-[var(--color-border)] bg-white"
        style={{ gridTemplateColumns }}
      >
        <div />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={`flex flex-col items-center border-l ${COLUMN_DIVIDER_CLASS} py-2`}
          >
            <span className="text-[13px] font-medium text-[var(--color-text-muted)]">{DAY_NAMES[getDay(day)]}</span>
            <div
              className={[
                'mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold',
                isToday(day) ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-primary)]',
              ].join(' ')}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      <div
        className="relative grid"
        style={{ height: totalHeight, gridTemplateColumns, gridTemplateRows: `${totalHeight}px` }}
      >
        <div
          ref={defaultAnchorRef}
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: defaultScrollTop, height: 1 }}
        />
        <div
          className={`sticky left-0 z-10 self-stretch border-r ${TIMELINE_DIVIDER_CLASS} bg-white`}
          style={{ width: TIMELINE_LABEL_WIDTH }}
        >
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute w-full pr-2 text-right text-[13px] font-medium text-[var(--color-text-muted)]"
              style={{ top: (hour - HOUR_START) * hourHeight - 7 }}
            >
              {hour}:00
            </div>
          ))}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-0 grid"
          style={{ left: TIMELINE_LABEL_WIDTH, gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day) => (
            <div key={`${day.toISOString()}_guide`} className={`h-full self-stretch border-l ${COLUMN_DIVIDER_CLASS}`} />
          ))}
        </div>

        {days.map((day) => {
          const date = format(day, 'yyyy-MM-dd')
          const dayEvents = (eventsByDate[date] ?? []).filter((event) => getEventLayout(event.startTime, event.endTime, hourHeight))

          return (
            <div
              key={date}
              className="relative z-10 h-full self-stretch"
              onClick={(eventObject) => {
                if (readOnly) return
                // clientY - rect.top 已是相对网格顶部（0:00 线）的偏移，视口坐标天然包含滚动量，不能再加 scrollTop
                const rect = eventObject.currentTarget.getBoundingClientRect()
                const relativeY = eventObject.clientY - rect.top
                const rawHour = HOUR_START + relativeY / hourHeight
                const hour = Math.floor(rawHour)
                const minute = relativeY % hourHeight < hourHeight / 2 ? 0 : 30
                onCellClick(date, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
              }}
            >
              {HOURS.map((hour) => (
                <div
                  key={`${date}_${hour}`}
                  className="absolute w-full border-t border-[var(--color-border)]/50"
                  style={{ top: (hour - HOUR_START) * hourHeight }}
                />
              ))}
              {HOURS.map((hour) => (
                <div
                  key={`${date}_${hour}_half`}
                  className="absolute w-full border-t border-dashed border-[var(--color-border)]/30"
                  style={{ top: (hour - HOUR_START) * hourHeight + hourHeight / 2 }}
                />
              ))}

              {dayEvents.map((event) => (
                <EventBlock key={event.id} event={event} hourHeight={hourHeight} teacherColor={teacherColor} onEventClick={onEventClick} />
              ))}

              {pendingSlot?.date === date ? (
                <div
                  className="absolute left-0.5 right-0.5 z-20 rounded border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary-light)] px-2 py-1.5"
                  style={getEventLayout(pendingSlot.startTime, pendingSlot.endTime, hourHeight) ?? undefined}
                >
                  <div className="truncate text-sm font-semibold text-[var(--color-primary)]">新排课</div>
                  <div className="text-[13px] text-[var(--color-primary)]">{pendingSlot.startTime}–{pendingSlot.endTime}</div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({
  date,
  events,
  teacherColor,
  pendingSlot,
  readOnly,
  onCellClick,
  onEventClick,
}: {
  date: Date
  events: CalEvent[]
  teacherColor: string
  pendingSlot: PendingSlot | null
  readOnly: boolean
  onCellClick: (date: string, startTime: string) => void
  onEventClick: (event: CalEvent) => void
}) {
  const dayKey = format(date, 'yyyy-MM-dd')
  const scrollRef = useRef<HTMLDivElement>(null)
  const defaultAnchorRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const { hourHeight, totalHeight, defaultScrollTop } = useTimelineMetrics(scrollRef, headerRef)
  const dayEvents = events.filter((event) => event.date === dayKey && getEventLayout(event.startTime, event.endTime, hourHeight))

  useLayoutEffect(() => {
    const node = scrollRef.current
    const anchor = defaultAnchorRef.current
    if (!node) return

    const applyScroll = () => {
      if (anchor) {
        anchor.scrollIntoView({ block: 'start' })
      }
      node.scrollTop = defaultScrollTop
    }

    applyScroll()
    const frameId = requestAnimationFrame(() => {
      applyScroll()
      requestAnimationFrame(applyScroll)
    })
    const timeoutId = window.setTimeout(applyScroll, 120)

    return () => {
      cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [dayKey, dayEvents.length, defaultScrollTop])

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div
        ref={headerRef}
        className="sticky top-0 z-10 grid border-b border-[var(--color-border)] bg-white"
        style={{ gridTemplateColumns: '64px minmax(0, 1fr)' }}
      >
        <div />
        <div className={`flex flex-col items-center border-l ${COLUMN_DIVIDER_CLASS} py-2`}>
          <span className="text-[13px] font-medium text-[var(--color-text-muted)]">{DAY_NAMES[getDay(date)]}</span>
          <div
            className={[
              'mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold',
              isToday(date) ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {format(date, 'd')}
          </div>
        </div>
      </div>

      <div
        className="relative grid"
        style={{ height: totalHeight, gridTemplateColumns: '64px minmax(0, 1fr)', gridTemplateRows: `${totalHeight}px` }}
      >
        <div
          ref={defaultAnchorRef}
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: defaultScrollTop, height: 1 }}
        />
        <div
          className={`sticky left-0 z-10 self-stretch border-r ${TIMELINE_DIVIDER_CLASS} bg-white`}
          style={{ width: TIMELINE_LABEL_WIDTH }}
        >
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute w-full pr-2 text-right text-[13px] font-medium text-[var(--color-text-muted)]"
              style={{ top: (hour - HOUR_START) * hourHeight - 7 }}
            >
              {hour}:00
            </div>
          ))}
        </div>
        <div
          className={`relative h-full self-stretch border-l ${COLUMN_DIVIDER_CLASS}`}
          onClick={(eventObject) => {
            if (readOnly) return
            // clientY - rect.top 已是相对网格顶部（0:00 线）的偏移，视口坐标天然包含滚动量，不能再加 scrollTop
            const rect = eventObject.currentTarget.getBoundingClientRect()
            const relativeY = eventObject.clientY - rect.top
            const rawHour = HOUR_START + relativeY / hourHeight
            const hour = Math.floor(rawHour)
            const minute = relativeY % hourHeight < hourHeight / 2 ? 0 : 30
            onCellClick(dayKey, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
          }}
        >
          {HOURS.map((hour) => (
            <div
              key={`${dayKey}_${hour}`}
              className="absolute w-full border-t border-[var(--color-border)]/50"
              style={{ top: (hour - HOUR_START) * hourHeight }}
            />
          ))}
          {HOURS.map((hour) => (
            <div
              key={`${dayKey}_${hour}_half`}
              className="absolute w-full border-t border-dashed border-[var(--color-border)]/30"
              style={{ top: (hour - HOUR_START) * hourHeight + hourHeight / 2 }}
            />
          ))}

          {dayEvents.map((event) => (
            <EventBlock key={event.id} event={event} hourHeight={hourHeight} teacherColor={teacherColor} onEventClick={onEventClick} />
          ))}

          {pendingSlot?.date === dayKey ? (
            <div
              className="absolute left-1 right-1 z-20 rounded border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary-light)] px-2 py-1.5"
              style={getEventLayout(pendingSlot.startTime, pendingSlot.endTime, hourHeight) ?? undefined}
            >
              <div className="text-sm font-semibold text-[var(--color-primary)]">新排课</div>
              <div className="text-[13px] text-[var(--color-primary)]">{pendingSlot.startTime}–{pendingSlot.endTime}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EventPill({
  event,
  teacherColor,
  onEventClick,
}: {
  event: CalEvent
  teacherColor: string
  onEventClick: (event: CalEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={(eventObject) => {
        eventObject.stopPropagation()
        onEventClick(event)
      }}
      className="flex min-w-0 items-center gap-1 truncate rounded-full px-2 py-1 text-[12px] font-semibold text-white hover:brightness-95"
      style={{ backgroundColor: event.type === 'class' ? teacherColor : '#9b6fcc' }}
    >
      <span className="shrink-0 opacity-80">{event.startTime}</span>
      <span className="truncate">{event.title}</span>
    </button>
  )
}

function MonthView({
  date,
  events,
  teacherColor,
  onDayClick,
  onEventClick,
}: {
  date: Date
  events: CalEvent[]
  teacherColor: string
  onDayClick: (day: Date) => void
  onEventClick: (event: CalEvent) => void
}) {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 })
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
      <div className="grid shrink-0 grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-bg-left)] text-[12px] font-semibold text-[var(--color-text-secondary)]">
        {DAY_NAMES.map((name) => (
          <div key={name} className="px-2 py-2">{name}</div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 overflow-hidden">
        {days.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          const dayEvents = events.filter((event) => event.date === dayKey)
          const visibleEvents = dayEvents.slice(0, 2)
          const hiddenCount = dayEvents.length - visibleEvents.length

          return (
            <button
              key={dayKey}
              type="button"
              className={[
                'min-h-0 border-r border-b border-[var(--color-border)] p-1 text-left align-top',
                isSameMonth(day, date) ? 'bg-white' : 'bg-[var(--color-bg-left)]/40',
                isToday(day) ? 'outline outline-1 outline-[var(--color-primary)] outline-offset-[-1px]' : '',
              ].join(' ')}
              onClick={() => onDayClick(day)}
            >
              <div className="mb-1 flex justify-end">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{format(day, 'd')}</span>
              </div>
              <div className="space-y-1">
                {visibleEvents.map((event) => (
                  <EventPill key={event.id} event={event} teacherColor={teacherColor} onEventClick={onEventClick} />
                ))}
                {hiddenCount > 0 ? (
                  <div className="text-[12px] text-[var(--color-text-muted)]">+{hiddenCount} 条日程</div>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TeacherScheduleBoard() {
  const storeEvents = useWorkbenchStore((state) => state.calendarEvents)
  const students = useWorkbenchStore((state) => state.students)
  const loadStudentInfo = useWorkbenchStore((state) => state.loadStudentInfo)
  const studentDetailMetaMap = useWorkbenchStore((state) => state.studentDetailMetaMap)
  const currentTeacher = useMemo(() => getTeacherFromToken(), [])
  const initialTeacherOptions = useMemo(
    () => (currentTeacher.name ? [currentTeacher] : []),
    [currentTeacher],
  )

  const [view, setView] = useState<CalendarViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedStudent, setSelectedStudent] = useState<StudentItem | null>(null)
  const [allTeacherOptions, setAllTeacherOptions] = useState<TeacherOption[]>(initialTeacherOptions)
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>(initialTeacherOptions)
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherOption>(currentTeacher)
  const [searchQuery, setSearchQuery] = useState('')
  const [scheduleRecords, setScheduleRecords] = useState<ScheduleRecord[]>([])
  const [showRecords, setShowRecords] = useState(false)
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null)
  const [slotSubmitting, setSlotSubmitting] = useState(false)
  const [slotError, setSlotError] = useState('')
  const [actionEvent, setActionEvent] = useState<CalEvent | null>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')
  const [events, setEvents] = useState<CalEvent[]>(storeEvents)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const teacherColor = teacherColorFromName(selectedTeacher.name || currentTeacher.name || '老师')
  const canManage = selectedTeacher.id
    ? selectedTeacher.id === currentTeacher.id
    : selectedTeacher.name === currentTeacher.name
  // 排课必须先选中学生；「查看我的日程」等未选学生场景下日历为只读，不提供点选时间段的能力
  const canCreate = Boolean(selectedStudent) && (canManage || Boolean(selectedTeacher.id))

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  )

  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  )

  const navLabel = useMemo(() => {
    if (view === 'day') return format(currentDate, 'yyyy年M月d日(EEE)', { locale: zhCN })
    if (view === 'week') return `${format(weekStart, 'M月d日', { locale: zhCN })} – ${format(weekEnd, 'M月d日', { locale: zhCN })}`
    return format(currentDate, 'yyyy年M月', { locale: zhCN })
  }, [currentDate, view, weekEnd, weekStart])

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students
    return students.filter((student) =>
      student.name.includes(searchQuery)
      || student.grade.includes(searchQuery)
      || student.subject.includes(searchQuery),
    )
  }, [searchQuery, students])

  useEffect(() => {
    let cancelled = false

    async function loadTeachers() {
      try {
        const list = await api.get<Array<Record<string, unknown>>>('/api/teacher/assignable-teachers')
        if (cancelled) return

        const options = mergeTeacherOptions(
          Array.isArray(list)
            ? list.map((teacher) => ({
                id: String(teacher.id ?? ''),
                name: String(teacher.name ?? ''),
                role: teacher.roleLabel
                  ? String(teacher.roleLabel)
                  : teacher.title
                    ? String(teacher.title)
                    : undefined,
              }))
            : [],
          initialTeacherOptions,
        )

        setAllTeacherOptions(options)
        setTeacherOptions((currentOptions) => {
          if (selectedStudent) {
            return mergeTeacherOptions(currentOptions, options)
          }
          return options
        })
      } catch {
        if (!cancelled) {
          setAllTeacherOptions(initialTeacherOptions)
          if (!selectedStudent) {
            setTeacherOptions(initialTeacherOptions)
          }
        }
      }
    }

    void loadTeachers()

    return () => {
      cancelled = true
    }
  }, [initialTeacherOptions, selectedStudent])

  const loadTeacherSchedule = useCallback(async (
    targetTeacher: TeacherOption,
    relatedStudentId?: string | null,
    isCancelled?: () => boolean,
  ) => {
    setLoading(true)
    setError('')
    try {
      const query = targetTeacher.id && currentTeacher.id && targetTeacher.id !== currentTeacher.id
        ? `?teacherId=${encodeURIComponent(targetTeacher.id)}${relatedStudentId ? `&studentId=${encodeURIComponent(relatedStudentId)}` : ''}`
        : ''
      const data = await api.get<Array<Record<string, unknown>>>(`/api/teacher/calendar${query}`)
      if (isCancelled?.()) return
      setEvents(Array.isArray(data) ? data.map(mapCalendarRow) : [])
    } catch (errorObject) {
      if (isCancelled?.()) return
      setError(errorObject instanceof Error ? errorObject.message : '加载日程失败')
      setEvents([])
    } finally {
      if (!isCancelled?.()) setLoading(false)
    }
  }, [currentTeacher])

  useEffect(() => {
    // 防竞态：依赖变化后旧请求被标记取消，过期响应不再覆盖新数据
    let cancelled = false
    const studentId = selectedStudent?.id ?? null
    void loadTeacherSchedule(selectedTeacher, studentId, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [loadTeacherSchedule, selectedStudent?.id, selectedTeacher])

  async function handleSelectStudent(student: StudentItem) {
    setSelectedStudent(student)
    setShowRecords(false)
    let detailMeta = studentDetailMetaMap[student.id]
    if (!detailMeta) {
      try {
        await loadStudentInfo(student.id)
        detailMeta = useWorkbenchStore.getState().studentDetailMetaMap[student.id]
      } catch (errorObject) {
        setError(errorObject instanceof Error ? errorObject.message : '加载学生详情失败')
      }
    }

    const studentTeachers = buildTeacherOptions(detailMeta, currentTeacher)
    const options = mergeTeacherOptions(studentTeachers, allTeacherOptions)
    const nextTeacher = pickDefaultTeacher(studentTeachers, currentTeacher)
    setTeacherOptions(options)
    setSelectedTeacher(nextTeacher)
  }

  function handleResetTeacher() {
    setSelectedStudent(null)
    setTeacherOptions(allTeacherOptions)
    setSelectedTeacher(currentTeacher)
    setShowRecords(false)
  }

  function goBack() {
    if (view === 'day') setCurrentDate((date) => subDays(date, 1))
    if (view === 'week') setCurrentDate((date) => subWeeks(date, 1))
    if (view === 'month') setCurrentDate((date) => subMonths(date, 1))
  }

  function goForward() {
    if (view === 'day') setCurrentDate((date) => addDays(date, 1))
    if (view === 'week') setCurrentDate((date) => addWeeks(date, 1))
    if (view === 'month') setCurrentDate((date) => addMonths(date, 1))
  }

  function handleCellClick(date: string, startTime: string) {
    if (!canCreate) return
    setSlotError('')
    setPendingSlot({ date, startTime, endTime: addDefaultDuration(startTime) })
  }

  function openActionEvent(event: CalEvent) {
    setActionError('')
    setActionEvent(event)
  }

  async function handleConfirmSlot(title: string, start: string, end: string) {
    if (!pendingSlot) return
    setSlotSubmitting(true)
    setSlotError('')
    try {
      await api.post('/api/teacher/calendar', {
        teacher_id: selectedTeacher.id || undefined,
        title,
        date: pendingSlot.date,
        start_time: start,
        end_time: end,
        type: 'class',
        student_id: selectedStudent?.id ?? null,
      })

      setScheduleRecords((records) => [
        {
          id: `record_${Date.now()}`,
          opType: '排课',
          title,
          date: pendingSlot.date,
          startTime: start,
          endTime: end,
          teacherName: selectedTeacher.name,
          createdAt: format(new Date(), 'HH:mm'),
        },
        ...records,
      ])

      setPendingSlot(null)
      await loadTeacherSchedule(selectedTeacher, selectedStudent?.id ?? null)
    } catch (errorObject) {
      setSlotError(errorObject instanceof Error ? errorObject.message : '排课失败，请稍后重试')
    } finally {
      setSlotSubmitting(false)
    }
  }

  async function handleUpdateEvent(title: string, date: string, start: string, end: string) {
    if (!editEvent) return
    setEditSubmitting(true)
    setEditError('')
    try {
      await api.put(`/api/teacher/calendar/${editEvent.id}`, {
        title,
        date,
        start_time: start,
        end_time: end,
        type: editEvent.type,
      })

      setScheduleRecords((records) => [
        {
          id: `record_${Date.now()}`,
          opType: '调课',
          title,
          date,
          startTime: start,
          endTime: end,
          teacherName: selectedTeacher.name,
          createdAt: format(new Date(), 'HH:mm'),
        },
        ...records,
      ])

      setEditEvent(null)
      setActionEvent(null)
      await loadTeacherSchedule(selectedTeacher, selectedStudent?.id ?? null)
    } catch (errorObject) {
      setEditError(errorObject instanceof Error ? errorObject.message : '修改失败，请稍后重试')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function handleDeleteEvent() {
    if (!actionEvent) return
    setActionSubmitting(true)
    setActionError('')
    try {
      await api.delete(`/api/teacher/calendar/${actionEvent.id}`)

      setScheduleRecords((records) => [
        {
          id: `record_${Date.now()}`,
          opType: '调课',
          title: actionEvent.title,
          date: actionEvent.date,
          startTime: actionEvent.startTime,
          endTime: actionEvent.endTime,
          teacherName: selectedTeacher.name,
          createdAt: format(new Date(), 'HH:mm'),
        },
        ...records,
      ])

      setActionEvent(null)
      await loadTeacherSchedule(selectedTeacher, selectedStudent?.id ?? null)
    } catch (errorObject) {
      setActionError(errorObject instanceof Error ? errorObject.message : '删除失败，请稍后重试')
    } finally {
      setActionSubmitting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-white">
        <div className="border-b border-[var(--color-border)] px-3 py-3">
          <div className="mb-2 text-base font-semibold text-[var(--color-text-secondary)]">学生列表</div>
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={searchQuery}
              onChange={(eventObject) => setSearchQuery(eventObject.target.value)}
              placeholder="搜索学生…"
              className="w-full rounded-lg border border-[var(--color-border)] py-2 pl-7 pr-3 text-[15px] outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          <button
            type="button"
            onClick={handleResetTeacher}
            className="mt-2 w-full rounded-lg border border-[var(--color-border)] py-2 text-[15px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]"
          >
            查看我的日程
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredStudents.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">无匹配学生</div>
          ) : (
            filteredStudents.map((student) => (
              <StudentListItem
                key={student.id}
                student={student}
                selected={selectedStudent?.id === student.id}
                onSelect={handleSelectStudent}
              />
            ))
          )}
        </div>

        {selectedStudent ? (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-primary-light)] px-3 py-2">
            <div className="text-[13px] text-[var(--color-text-muted)]">当前学生</div>
            <div className="mt-0.5 text-base font-semibold text-[var(--color-primary)]">{selectedStudent.name}</div>
            <div className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
              日程展示的是所选老师的全部日程
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: teacherColor }}
            >
              {(selectedTeacher.name || '师').slice(0, 1)}
            </div>
            <select
              value={selectedTeacher.id || selectedTeacher.name}
              onChange={(eventObject) => {
                const next = teacherOptions.find((teacher) => (teacher.id || teacher.name) === eventObject.target.value)
                if (next) setSelectedTeacher(next)
              }}
              className="rounded-lg border border-[var(--color-border)] bg-white py-1.5 pl-2.5 pr-6 text-[15px] outline-none focus:border-[var(--color-primary)]"
            >
              {teacherOptions.map((teacher) => (
                <option key={teacher.id || teacher.name} value={teacher.id || teacher.name}>
                  {teacher.role ? `${teacher.name}（${teacher.role}）` : teacher.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goBack}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--color-bg-left)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="min-w-[180px] text-center text-base font-medium text-[var(--color-text-primary)]">{navLabel}</span>
            <button
              type="button"
              onClick={goForward}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--color-bg-left)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="flex-1" />

          {selectedStudent ? (
            <div className="rounded-full bg-[var(--color-primary-light)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-primary)]">
              {selectedStudent.name}
            </div>
          ) : (
            <div className="text-[13px] text-[var(--color-text-muted)]">先在左侧选择学生，再点击日历时间段排课</div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRecords((value) => !value)}
              className={[
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[15px] font-medium transition-colors',
                showRecords
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
              ].join(' ')}
            >
              排课记录
              {scheduleRecords.length > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[12px] font-bold text-white">
                  {scheduleRecords.length}
                </span>
              ) : null}
            </button>
            {showRecords ? (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">排课记录</span>
                  <button
                    type="button"
                    onClick={() => setShowRecords(false)}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  >
                    ×
                  </button>
                </div>
                <div className="max-h-72 overflow-auto divide-y divide-[var(--color-border)]">
                  {scheduleRecords.length === 0 ? (
                    <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">暂无记录</div>
                  ) : (
                    scheduleRecords.map((record) => (
                      <div key={record.id} className="px-3 py-2.5 hover:bg-[var(--color-bg-left)]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={[
                              'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                              record.opType === '排课'
                                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                                : 'bg-[#eef3fb] text-[#5580b8]',
                            ].join(' ')}
                          >
                            {record.opType}
                          </span>
                          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{record.title}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                          {record.date} {record.startTime}–{record.endTime}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                          {record.teacherName} · {record.createdAt}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg bg-[var(--color-bg-left)] p-0.5">
            {(['day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={[
                  'rounded-md px-3.5 py-1.5 text-[15px] font-medium transition-colors',
                  view === mode
                    ? 'bg-white text-[var(--color-primary)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                ].join(' ')}
              >
                {VIEW_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-0 flex min-h-0 flex-1 overflow-hidden bg-white">
          {error ? (
            <div className="flex h-full items-center justify-center text-sm text-[#d96b4d]">{error}</div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">正在加载日程…</div>
          ) : view === 'week' ? (
            <WeekView
              weekStart={weekStart}
              events={events}
              teacherColor={teacherColor}
              pendingSlot={pendingSlot}
              readOnly={!canCreate}
              onCellClick={handleCellClick}
              onEventClick={openActionEvent}
            />
          ) : view === 'day' ? (
            <DayView
              date={currentDate}
              events={events}
              teacherColor={teacherColor}
              pendingSlot={pendingSlot}
              readOnly={!canCreate}
              onCellClick={handleCellClick}
              onEventClick={openActionEvent}
            />
          ) : (
            <MonthView
              date={currentDate}
              events={events}
              teacherColor={teacherColor}
              onDayClick={(day) => {
                setCurrentDate(day)
                setView('day')
              }}
              onEventClick={openActionEvent}
            />
          )}
        </div>
      </div>

      {pendingSlot && canCreate ? (
        <AddSlotModal
          date={pendingSlot.date}
          startTime={pendingSlot.startTime}
          selectedStudent={selectedStudent}
          submitting={slotSubmitting}
          error={slotError}
          onConfirm={(title, start, end) => void handleConfirmSlot(title, start, end)}
          onCancel={() => {
            setPendingSlot(null)
            setSlotError('')
          }}
        />
      ) : null}

      {editEvent ? (
        <EditEventModal
          event={editEvent}
          submitting={editSubmitting}
          error={editError}
          onConfirm={(title, date, start, end) => void handleUpdateEvent(title, date, start, end)}
          onCancel={() => {
            setEditEvent(null)
            setEditError('')
          }}
        />
      ) : null}

      {actionEvent ? (
        <EventActionModal
          event={actionEvent}
          teacherColor={teacherColor}
          readOnly={!canManage}
          submitting={actionSubmitting}
          error={actionError}
          onEdit={() => {
            setEditEvent(actionEvent)
            setEditError('')
            setActionEvent(null)
          }}
          onDelete={() => void handleDeleteEvent()}
          onCancel={() => {
            setActionEvent(null)
            setActionError('')
          }}
        />
      ) : null}
    </div>
  )
}
