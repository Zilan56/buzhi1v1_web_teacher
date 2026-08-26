import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  getDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWorkbenchStore } from '../../store/workbenchStore'
import type { CalEvent } from '../../types'

type PersonalViewMode = 'day' | 'week' | 'month'

type DraftSlot = {
  date: string
  startTime: string
  endTime: string
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

function timeToMinutes(time: string) {
  const [hour, minute] = String(time || '00:00').split(':').map(Number)
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

function addDefaultDuration(startTime: string, minutes = 60) {
  const total = timeToMinutes(startTime) + minutes
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseEventStart(event: CalEvent): number {
  const date = new Date(`${event.date}T${event.startTime || '00:00'}:00`)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function EventModal({
  initialEvent,
  initialSlot,
  onClose,
}: {
  initialEvent: CalEvent | null
  initialSlot: DraftSlot | null
  onClose: () => void
}) {
  const addCalendarEvent = useWorkbenchStore((state) => state.addCalendarEvent)
  const updateCalendarEvent = useWorkbenchStore((state) => state.updateCalendarEvent)
  const deleteCalendarEvent = useWorkbenchStore((state) => state.deleteCalendarEvent)

  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [date, setDate] = useState(initialEvent?.date ?? initialSlot?.date ?? format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(initialEvent?.startTime ?? initialSlot?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(initialEvent?.endTime ?? initialSlot?.endTime ?? '10:00')
  const [type, setType] = useState<CalEvent['type']>(initialEvent?.type ?? 'meeting')
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit() {
    if (!title.trim() || !date || !startTime || !endTime || endTime <= startTime) return
    setSubmitError('')

    const nextEvent: CalEvent = {
      id: initialEvent?.id ?? `event_${Date.now()}`,
      title: title.trim(),
      date,
      startTime,
      endTime,
      type,
      studentId: initialEvent?.studentId,
      link: initialEvent?.link,
    }

    if (initialEvent) {
      updateCalendarEvent(nextEvent)
    } else {
      const saved = await addCalendarEvent(nextEvent)
      if (!saved) {
        setSubmitError('保存失败，刷新后不会保留。请重试。')
        return
      }
    }

    onClose()
  }

  function handleDelete() {
    if (!initialEvent) return
    deleteCalendarEvent(initialEvent.id)
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25" />
      <div
        className="relative w-[min(560px,94vw)] rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(eventObject) => eventObject.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
            {initialEvent ? '编辑日程' : '新增日程'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div>
            <label className="mb-1 block text-[13px] text-[var(--color-text-muted)]">日程名称</label>
            <input
              value={title}
              onChange={(eventObject) => setTitle(eventObject.target.value)}
              placeholder="例如：备课、会议、复盘、课程"
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] text-[var(--color-text-muted)]">类型</label>
            <div className="flex gap-2">
              {(['meeting', 'class'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={[
                    'flex-1 rounded-lg border py-2 text-sm transition-colors',
                    type === value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {value === 'meeting' ? '个人安排' : '课程'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[13px] text-[var(--color-text-muted)]">日期</label>
            <input
              type="date"
              value={date}
              onChange={(eventObject) => setDate(eventObject.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[13px] text-[var(--color-text-muted)]">开始时间</label>
              <input
                type="time"
                value={startTime}
                onChange={(eventObject) => setStartTime(eventObject.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[13px] text-[var(--color-text-muted)]">结束时间</label>
              <input
                type="time"
                value={endTime}
                onChange={(eventObject) => setEndTime(eventObject.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {submitError}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-3">
          {initialEvent ? (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
            >
              删除
            </button>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!title.trim() || endTime <= startTime}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function EventBlock({
  event,
  hourHeight,
  onClick,
}: {
  event: CalEvent
  hourHeight: number
  onClick: (event: CalEvent) => void
}) {
  const layout = getEventLayout(event.startTime, event.endTime, hourHeight)
  const background = event.type === 'meeting' ? '#7b8fc4' : '#e8845a'

  if (!layout) return null

  return (
    <button
      type="button"
      className="absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-md px-2 py-1.5 text-left text-white hover:brightness-95"
      style={{ top: layout.top, height: layout.height, backgroundColor: background, opacity: 0.92 }}
      onClick={(eventObject) => {
        eventObject.stopPropagation()
        onClick(event)
      }}
    >
      <div className="truncate text-sm font-semibold leading-tight">{event.title}</div>
      <div className="text-[13px] opacity-80">{event.startTime} - {event.endTime}</div>
    </button>
  )
}

function TimeGrid({
  days,
  events,
  onSlotClick,
  onEventClick,
  hideHeader = false,
}: {
  days: Date[]
  events: CalEvent[]
  onSlotClick: (date: string, startTime: string) => void
  onEventClick: (event: CalEvent) => void
  hideHeader?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const defaultAnchorRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const scrollKey = useMemo(() => days.map((day) => day.toISOString()).join('|'), [days])
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
      {!hideHeader ? (
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
      ) : null}

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
          const dayEvents = (eventsByDate[date] ?? [])
            .filter((event) => getEventLayout(event.startTime, event.endTime, hourHeight))
            .slice()
            .sort((left, right) => parseEventStart(left) - parseEventStart(right))

          return (
            <div
              key={date}
              className="relative z-10 h-full self-stretch"
              onClick={(eventObject) => {
                // clientY - rect.top 已是相对网格顶部（0:00 线）的偏移，视口坐标天然包含滚动量，不能再加 scrollTop
                const rect = eventObject.currentTarget.getBoundingClientRect()
                const relativeY = eventObject.clientY - rect.top
                const rawHour = HOUR_START + relativeY / hourHeight
                const hour = Math.floor(rawHour)
                const minute = relativeY % hourHeight < hourHeight / 2 ? 0 : 30
                onSlotClick(date, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
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
                <EventBlock key={event.id} event={event} hourHeight={hourHeight} onClick={onEventClick} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthView({
  date,
  events,
  onDayClick,
  onEventClick,
}: {
  date: Date
  events: CalEvent[]
  onDayClick: (day: Date) => void
  onEventClick: (event: CalEvent) => void
}) {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 })
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
          const dayEvents = events.filter((event) => event.date === dayKey).slice(0, 3)
          const hiddenCount = events.filter((event) => event.date === dayKey).length - dayEvents.length

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
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(eventObject) => {
                      eventObject.stopPropagation()
                      onEventClick(event)
                    }}
                    className={[
                      'flex w-full min-w-0 items-center gap-1 truncate rounded-full px-2 py-1 text-[12px] font-semibold text-white hover:brightness-95',
                      event.type === 'meeting' ? 'bg-[#7b8fc4]' : 'bg-[#e8845a]',
                    ].join(' ')}
                  >
                    <span className="shrink-0 opacity-80">{event.startTime}</span>
                    <span className="truncate">{event.title}</span>
                  </button>
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

export function CalendarView() {
  const calendarEvents = useWorkbenchStore((state) => state.calendarEvents)
  const loadCalendarEvents = useWorkbenchStore((state) => state.loadCalendarEvents)

  const [view, setView] = useState<PersonalViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [draftSlot, setDraftSlot] = useState<DraftSlot | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null)

  useEffect(() => {
    void loadCalendarEvents()
  }, [loadCalendarEvents])

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate])
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate])

  const navLabel = useMemo(() => {
    if (view === 'day') return format(currentDate, 'yyyy年M月d日(EEE)', { locale: zhCN })
    if (view === 'week') return `${format(weekStart, 'M月d日', { locale: zhCN })} - ${format(weekEnd, 'M月d日', { locale: zhCN })}`
    return format(currentDate, 'yyyy年M月', { locale: zhCN })
  }, [currentDate, view, weekEnd, weekStart])

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

  function handleSlotClick(date: string, startTime: string) {
    setEditingEvent(null)
    setDraftSlot({
      date,
      startTime,
      endTime: addDefaultDuration(startTime),
    })
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
        <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-[12px] font-bold text-white">
              我
            </div>
            <div>
              <div className="text-base font-semibold text-[var(--color-text-primary)]">我的日程</div>
              <div className="text-[13px] text-[var(--color-text-muted)]">老师个人安排与课程总览</div>
            </div>
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
            <span className="min-w-[200px] text-center text-base font-medium text-[var(--color-text-primary)]">{navLabel}</span>
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

          <button
            type="button"
            onClick={() => {
              setEditingEvent(null)
              setDraftSlot({
                date: format(currentDate, 'yyyy-MM-dd'),
                startTime: '09:00',
                endTime: '10:00',
              })
            }}
            className="rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-[15px] font-semibold text-white hover:opacity-90"
          >
            新增日程
          </button>

          <div className="flex items-center gap-0.5 rounded-lg bg-[var(--color-bg-left)] p-0.5">
            {(['day', 'week', 'month'] as PersonalViewMode[]).map((mode) => (
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
                {mode === 'day' ? '日' : mode === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-0 flex min-h-0 flex-1 overflow-hidden bg-white">
          {view === 'week' ? (
            <TimeGrid
              days={Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))}
              events={calendarEvents}
              onSlotClick={handleSlotClick}
              onEventClick={setEditingEvent}
            />
          ) : view === 'day' ? (
            <TimeGrid
              days={[currentDate]}
              events={calendarEvents}
              onSlotClick={handleSlotClick}
              onEventClick={setEditingEvent}
            />
          ) : (
            <MonthView
              date={currentDate}
              events={calendarEvents}
              onDayClick={(day) => {
                setCurrentDate(day)
                setView('day')
              }}
              onEventClick={setEditingEvent}
            />
          )}
        </div>
      </div>

      {(draftSlot || editingEvent) ? (
        <EventModal
          initialEvent={editingEvent}
          initialSlot={draftSlot}
          onClose={() => {
            setDraftSlot(null)
            setEditingEvent(null)
          }}
        />
      ) : null}
    </div>
  )
}
