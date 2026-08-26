import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'
import { api } from '../../../../lib/api'
import { apiUrl } from '../../../../lib/apiBase'
import { fetchSubmissionFileUrl, uploadReviewedSubmissionPdf } from '../../api/submissions'
import type { TaskListItem } from '../../types'
import { useWorkbenchStore } from '../../store/workbenchStore'

const log = logger.child('liveDrill')

const FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.zip'
const LIVE_DRILL_DRAFT_STORAGE_KEY = 'teacher_workbench_live_drill_workspace_v3'
const DRILL_STUDENT_COLORS = ['#e8845a', '#d79c69', '#c48b7a', '#b58f6f', '#c8755c', '#9f7d69', '#d3a57c', '#b88d77']

type WorkspaceSection = 'schedule' | 'materials' | 'review' | 'report'
type ResourceFieldKey = 'question' | 'qaSummary'

interface StudentOption {
  id: string
  name: string
  grade: string
  subject: string
  status: string
  avatar: string
  color: string
}

interface DrillResource {
  url: string
  fileName: string
  storedFile?: string
  size?: number
}

interface PublishDraft {
  title: string
  pointName: string
  notes: string
  liveLink: string
  replayLink: string
  question: DrillResource | null
  qaSummary: DrillResource | null
}

interface ScheduleTask {
  id: string
  date: string
  title: string
  liveTime: string
  dueTime: string
  remark: string
}

interface ScheduleDraft {
  title: string
  liveTime: string
  dueTime: string
  remark: string
}

type ScheduleNotes = [string, string, string]

interface HomeworkRecord {
  id: string
  studentId: string
  studentName: string
  pointName: string
  stageKey: string
  taskId: string
  feedbackTaskId: string
  fileName: string
  submittedAt: string
  graded: boolean
  score: number | null
  feedback: string
  reviewedFileName: string
  hasReviewedFile: boolean
  grade: string
  subject: string
  aiDone: boolean
  aiMeta: Record<string, unknown>
}

interface ReviewDraft {
  score: string
  teacherComment: string
  reviewFile: File | null
  reviewFileName: string
  savedAt: string
}

interface AiResult {
  status: string
  score: number | null
  feedback: string
  reviewedFileName: string
}

interface HistoryRecord {
  pointName: string
  title: string
  notes: string
  resources: {
    question: DrillResource | null
    qaSummary: DrillResource | null
    liveLink: string
    replayLink: string
  }
  scheduleItems: Array<{
    title?: string
    liveAt?: string
    dueAt?: string
    remark?: string
  }>
}

const SECTION_META: Array<{ key: WorkspaceSection; label: string; hint: string; short: string }> = [
  { key: 'schedule', label: '日程安排', hint: '', short: '01' },
  { key: 'materials', label: '资料上传', hint: '维护题目、直播链接、回放链接、答疑总结，并选择刷题学生。', short: '02' },
  { key: 'review', label: 'AI批改', hint: '查看学生作答和 AI 批改结果，老师可以修订后再次上传。', short: '03' },
  { key: 'report', label: '报告上传', hint: '查看刷题学生并跳转到待上传报告里的刷题报告工作区。', short: '04' },
]

const DEFAULT_PUBLISH_DRAFT: PublishDraft = {
  title: '直播刷题',
  pointName: '申论刷题',
  notes: '',
  liveLink: '',
  replayLink: '',
  question: null,
  qaSummary: null,
}

const DEFAULT_SCHEDULE_DRAFT: ScheduleDraft = {
  title: '当日任务',
  liveTime: '',
  dueTime: '',
  remark: '',
}

const DEFAULT_SCHEDULE_NOTES: ScheduleNotes = [
  '所有任务需按当天安排完成，如有调整以老师通知为准。',
  '如当天安排有直播或集中讲解，请按要求提前预约并准时参加。',
  '具体时间和任务内容可能根据学习进度调整，会另行同步。',
]

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function getTodayDate(): string {
  const today = new Date()
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
}

function getCurrentMonthDate(): Date {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

function toDisplayLabel(value = '', fallback = '未设置'): string {
  return String(value || '').trim() || fallback
}

function isHttpUrl(value = ''): boolean {
  return /^https?:\/\//i.test(String(value).trim())
}

function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

function formatWeekLabel(date: string): string {
  return date
}

function formatDateText(value: string): string {
  if (!value) return '未选择日期'
  const [year, month, day] = value.split('-')
  return `${year}年${month}月${day}日`
}

function formatTaskTime(task: ScheduleTask): string {
  const start = String(task.liveTime || '').trim()
  const end = String(task.dueTime || '').trim()
  if (start && end) return `${start}-${end}`
  if (start) return start
  if (end) return `截止 ${end}`
  return '全天'
}

function normalizeResource(raw: unknown): DrillResource | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const url = String(record.url || '').trim()
  const fileName = String(record.fileName || '').trim()
  if (!url && !fileName) return null

  return {
    url,
    fileName,
    storedFile: String(record.storedFile || '').trim() || undefined,
    size: typeof record.size === 'number' ? record.size : undefined,
  }
}

function normalizeStudent(raw: Record<string, unknown>, index: number): StudentOption {
  const name = String(raw.name || '').trim()
  return {
    id: String(raw.id || ''),
    name,
    grade: String(raw.grade || '').trim(),
    subject: String(raw.subject || '').trim(),
    status: String(raw.status || '').trim(),
    avatar: name.slice(0, 1) || '学',
    color: DRILL_STUDENT_COLORS[index % DRILL_STUDENT_COLORS.length],
  }
}

function normalizeHomework(raw: Record<string, unknown>): HomeworkRecord {
  const scoreValue = raw.score
  const parsedScore = scoreValue === null || scoreValue === undefined || scoreValue === ''
    ? null
    : Number(scoreValue)

  return {
    id: String(raw.id || ''),
    studentId: String(raw.studentId || ''),
    studentName: String(raw.studentName || ''),
    pointName: String(raw.pointName || ''),
    stageKey: String(raw.stageKey || ''),
    taskId: String(raw.taskId || ''),
    feedbackTaskId: String(raw.feedbackTaskId || ''),
    fileName: String(raw.fileName || ''),
    submittedAt: String(raw.submittedAt || ''),
    graded: Boolean(raw.graded),
    score: Number.isNaN(parsedScore) ? null : parsedScore,
    feedback: String(raw.feedback || ''),
    reviewedFileName: String(raw.reviewedFileName || ''),
    hasReviewedFile: Boolean(raw.hasReviewedFile),
    grade: String(raw.grade || ''),
    subject: String(raw.subject || ''),
    aiDone: Boolean(raw.aiDone),
    aiMeta: raw.aiMeta && typeof raw.aiMeta === 'object' ? raw.aiMeta as Record<string, unknown> : {},
  }
}

function getAiResult(record: HomeworkRecord): AiResult {
  const result = record.aiMeta.result && typeof record.aiMeta.result === 'object'
    ? record.aiMeta.result as Record<string, unknown>
    : {}
  const rawScore = result.score
  const parsedScore = rawScore === null || rawScore === undefined || rawScore === ''
    ? null
    : Number(rawScore)

  return {
    status: String(result.status || ''),
    score: Number.isNaN(parsedScore) ? null : parsedScore,
    feedback: String(result.feedback || ''),
    reviewedFileName: String(result.reviewedFileName || ''),
  }
}

function buildReviewDraft(record: HomeworkRecord): ReviewDraft {
  const aiResult = getAiResult(record)
  const score = record.score ?? aiResult.score
  const comment = record.feedback || aiResult.feedback

  return {
    score: score === null || score === undefined ? '' : String(score),
    teacherComment: comment,
    reviewFile: null,
    reviewFileName: record.reviewedFileName || aiResult.reviewedFileName || '',
    savedAt: '',
  }
}

function getNowLabel(): string {
  return new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildCalendarDays(monthDate: Date): Array<{ date: string; dayNumber: number; inCurrentMonth: boolean }> {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const weekday = firstDay.getDay()
  const startDay = weekday === 0 ? 6 : weekday - 1
  const startDate = new Date(year, month, 1 - startDay)

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(startDate)
    current.setDate(startDate.getDate() + index)
    const currentMonth = current.getMonth() === month
    const date = `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`

    return {
      date,
      dayNumber: current.getDate(),
      inCurrentMonth: currentMonth,
    }
  })
}

function sortScheduleTasks(tasks: ScheduleTask[]): ScheduleTask[] {
  return [...tasks].sort((left, right) => {
    const leftKey = `${left.date} ${left.liveTime}`
    const rightKey = `${right.date} ${right.liveTime}`
    return leftKey.localeCompare(rightKey)
  })
}

function parseDateTimeParts(value = ''): { date: string; time: string } {
  const [date = '', time = ''] = String(value || '').trim().split(/\s+/)
  return { date, time }
}

function normalizeHistoryRecord(raw: unknown): HistoryRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const resources = record.resources && typeof record.resources === 'object'
    ? record.resources as Record<string, unknown>
    : {}

  return {
    pointName: String(record.pointName || '').trim(),
    title: String(record.title || '').trim(),
    notes: String(record.notes || '').trim(),
    resources: {
      question: normalizeResource(resources.question),
      qaSummary: normalizeResource(resources.qaSummary),
      liveLink: String(resources.liveLink || '').trim(),
      replayLink: String(resources.replayLink || '').trim(),
    },
    scheduleItems: Array.isArray(record.scheduleItems)
      ? record.scheduleItems.map((item) => (item && typeof item === 'object' ? item as HistoryRecord['scheduleItems'][number] : {}))
      : [],
  }
}

function getStudentReportItems(items: TaskListItem[], studentId: string): TaskListItem[] {
  return items.filter((item) => item.studentId === studentId)
}

function readStoredDraft(): {
  publishDraft?: PublishDraft
  scheduleItems?: ScheduleTask[]
  selectedStudentIds?: string[]
  scheduleNotes?: ScheduleNotes
} | null {
  try {
    const raw = window.localStorage.getItem(LIVE_DRILL_DRAFT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as {
      publishDraft?: PublishDraft
      scheduleItems?: ScheduleTask[]
      selectedStudentIds?: string[]
      scheduleNotes?: ScheduleNotes
    }
  } catch {
    window.localStorage.removeItem(LIVE_DRILL_DRAFT_STORAGE_KEY)
    return null
  }
}

function writeStoredDraft(payload: {
  publishDraft: PublishDraft
  scheduleItems: ScheduleTask[]
  selectedStudentIds: string[]
  scheduleNotes: ScheduleNotes
}) {
  window.localStorage.setItem(LIVE_DRILL_DRAFT_STORAGE_KEY, JSON.stringify(payload))
}

function NavItem({
  active,
  section,
  onClick,
}: {
  active: boolean
  section: typeof SECTION_META[number]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-[26px] border px-4 py-4 text-left transition-all duration-200',
        active
          ? 'border-[rgba(15,23,42,0.12)] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]'
          : 'border-[rgba(15,23,42,0.08)] bg-white/84 hover:-translate-y-0.5 hover:border-[rgba(15,23,42,0.14)] hover:bg-white',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold tracking-[0.18em]',
            active ? 'bg-[var(--color-primary)] text-white' : 'bg-[rgba(148,163,184,0.12)] text-[var(--color-primary)]',
          ].join(' ')}
        >
          {section.short}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{section.label}</div>
          <div className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{section.hint}</div>
        </div>
      </div>
    </button>
  )
}

function Panel({
  title,
  desc,
  action,
  children,
}: {
  title: string
  desc?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[30px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(15,23,42,0.06)] pb-4">
        <div>
          <div className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</div>
          {desc ? (
            <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{desc}</div>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-[28px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[rgba(248,250,252,0.9)] px-6 text-center text-sm text-[var(--color-text-muted)]">
      {text}
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-page-bg)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)] focus:bg-white"
      />
    </label>
  )
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  rows?: number
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">{label}</div>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-page-bg)] px-4 py-3 text-sm leading-6 text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)] focus:bg-white"
      />
    </label>
  )
}

function FileUploadCard({
  title,
  desc,
  resource,
  uploading,
  onPick,
  onPreview,
}: {
  title: string
  desc: string
  resource: DrillResource | null
  uploading: boolean
  onPick: () => void
  onPreview: () => void
}) {
  return (
    <div className="rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
          <div className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{desc}</div>
        </div>
        <span className="rounded-full bg-[rgba(148,163,184,0.12)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
          {uploading ? '上传中' : resource ? '已上传' : '待上传'}
        </span>
      </div>
      <div className="mt-4 rounded-[22px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[rgba(248,250,252,0.96)] px-4 py-5">
        <div className="text-sm font-medium text-[var(--color-text-primary)]">
          {resource?.fileName || '点击上传文件'}
        </div>
        <div className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
          {resource?.url || '支持 PDF / Office / 图片 / 压缩包'}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onPick}
            disabled={uploading}
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? '上传中...' : resource ? '重新上传' : '上传文件'}
          </button>
          <button
            type="button"
            onClick={onPreview}
            disabled={!resource?.url}
            className="rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            预览
          </button>
        </div>
      </div>
    </div>
  )
}

function LinkCard({
  title,
  desc,
  value,
  onChange,
  placeholder,
  onOpen,
}: {
  title: string
  desc: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  onOpen: () => void
}) {
  return (
    <div className="rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
      <div className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{desc}</div>
      <div className="mt-4 space-y-3">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-page-bg)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)] focus:bg-white"
        />
        <button
          type="button"
          onClick={onOpen}
          disabled={!value.trim()}
          className="rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          打开链接
        </button>
      </div>
    </div>
  )
}

export function LiveDrillModal() {
  const openTaskKey = useWorkbenchStore((state) => state.openTaskKey)
  const closeTaskModal = useWorkbenchStore((state) => state.closeTaskModal)
  const openReportUpload = useWorkbenchStore((state) => state.openReportUpload)
  const taskItemsMap = useWorkbenchStore((state) => state.taskItemsMap)
  const loadTaskItems = useWorkbenchStore((state) => state.loadTaskItems)
  const loadTaskCounts = useWorkbenchStore((state) => state.loadTaskCounts)

  const [activeSection, setActiveSection] = useState<WorkspaceSection>('schedule')
  const [students, setStudents] = useState<StudentOption[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [publishDraft, setPublishDraft] = useState<PublishDraft>(DEFAULT_PUBLISH_DRAFT)
  const [uploadingMap, setUploadingMap] = useState<Record<ResourceFieldKey, boolean>>({
    question: false,
    qaSummary: false,
  })
  const [scheduleItems, setScheduleItems] = useState<ScheduleTask[]>([])
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(DEFAULT_SCHEDULE_DRAFT)
  const [scheduleNotes, setScheduleNotes] = useState<ScheduleNotes>(DEFAULT_SCHEDULE_NOTES)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(getTodayDate())
  const [currentMonth, setCurrentMonth] = useState<Date>(getCurrentMonthDate())
  const [homeworks, setHomeworks] = useState<HomeworkRecord[]>([])
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({})
  const [selectedReviewStudentId, setSelectedReviewStudentId] = useState<string | null>(null)
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string | null>(null)
  const [selectedReportStudentId, setSelectedReportStudentId] = useState<string | null>(null)
  const [bannerMessage, setBannerMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null)
  const [draftReady, setDraftReady] = useState(false)

  const questionInputRef = useRef<HTMLInputElement>(null)
  const summaryInputRef = useRef<HTMLInputElement>(null)
  const reviewFileInputRef = useRef<HTMLInputElement>(null)

  const drillReportItems = useMemo(
    () => (taskItemsMap.pendingReport || []).filter((item) => (item.reportCategory || 'checkpoint') === 'drill'),
    [taskItemsMap.pendingReport],
  )

  const reviewStudentSummaries = useMemo(() => {
    return students.map((student) => {
      const items = homeworks.filter((record) => record.studentId === student.id)
      return {
        student,
        total: items.length,
        aiDone: items.filter((record) => record.aiDone).length,
      }
    })
  }, [homeworks, students])

  const selectedReviewStudent = useMemo(
    () => students.find((student) => student.id === selectedReviewStudentId) || null,
    [selectedReviewStudentId, students],
  )

  const selectedStudentHomeworks = useMemo(() => {
    if (!selectedReviewStudentId) return []
    return [...homeworks]
      .filter((record) => record.studentId === selectedReviewStudentId)
      .sort((left, right) => String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')))
  }, [homeworks, selectedReviewStudentId])

  const selectedHomework = useMemo(
    () => selectedStudentHomeworks.find((record) => record.id === selectedHomeworkId) || selectedStudentHomeworks[0] || null,
    [selectedHomeworkId, selectedStudentHomeworks],
  )

  const selectedHomeworkDraft = selectedHomework
    ? (reviewDrafts[selectedHomework.id] || buildReviewDraft(selectedHomework))
    : null

  const selectedHomeworkAiResult = selectedHomework ? getAiResult(selectedHomework) : null

  const selectedReportStudent = useMemo(
    () => students.find((student) => student.id === selectedReportStudentId) || null,
    [selectedReportStudentId, students],
  )

  const selectedReportItems = useMemo(
    () => selectedReportStudentId ? getStudentReportItems(drillReportItems, selectedReportStudentId) : [],
    [drillReportItems, selectedReportStudentId],
  )

  const selectedDateTasks = useMemo(
    () => sortScheduleTasks(scheduleItems.filter((task) => task.date === selectedDate)),
    [scheduleItems, selectedDate],
  )

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth])

  const drillOpen = openTaskKey === 'liveDrill'
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!drillOpen) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    // 关闭→重新打开时重置上一次会话的内部状态，数据由下方加载逻辑重新拉取
    setActiveSection('schedule')
    setStudents([])
    setSelectedStudentIds([])
    setPublishDraft(DEFAULT_PUBLISH_DRAFT)
    setUploadingMap({ question: false, qaSummary: false })
    setScheduleItems([])
    setScheduleDraft(DEFAULT_SCHEDULE_DRAFT)
    setScheduleNotes(DEFAULT_SCHEDULE_NOTES)
    setEditingScheduleId(null)
    setSelectedDate(getTodayDate())
    setCurrentMonth(getCurrentMonthDate())
    setHomeworks([])
    setReviewDrafts({})
    setSelectedReviewStudentId(null)
    setSelectedHomeworkId(null)
    setSelectedReportStudentId(null)
    setBannerMessage('')
    setErrorMessage('')
    setLoading(false)
    setPublishBusy(false)
    setReviewBusyId(null)
    setDraftReady(false)
  }, [drillOpen])

  useEffect(() => {
    if (openTaskKey !== 'liveDrill') return

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setErrorMessage('')

      try {
        const [studentRows, homeworkRows, historyRows] = await Promise.all([
          api.get<Array<Record<string, unknown>>>('/api/teacher/drill/students'),
          api.get<Array<Record<string, unknown>>>('/api/teacher/drill/homeworks'),
          api.get<Array<Record<string, unknown>>>('/api/teacher/drill/history'),
          loadTaskItems(),
          loadTaskCounts(),
        ])

        if (cancelled) return

        const normalizedStudents = Array.isArray(studentRows)
          ? studentRows.map((item, index) => normalizeStudent(item, index))
          : []
        const normalizedHomeworks = Array.isArray(homeworkRows)
          ? homeworkRows.map((item) => normalizeHomework(item))
          : []

        setStudents(normalizedStudents)
        setHomeworks(normalizedHomeworks)

        const initialReviewDrafts = normalizedHomeworks.reduce<Record<string, ReviewDraft>>((acc, record) => {
          acc[record.id] = buildReviewDraft(record)
          return acc
        }, {})
        setReviewDrafts(initialReviewDrafts)

        const stored = typeof window !== 'undefined' ? readStoredDraft() : null
        const latestHistory = Array.isArray(historyRows) && historyRows.length > 0
          ? normalizeHistoryRecord(historyRows[0])
          : null

        if (stored?.publishDraft) {
          setPublishDraft({
            ...DEFAULT_PUBLISH_DRAFT,
            ...stored.publishDraft,
            question: normalizeResource(stored.publishDraft.question),
            qaSummary: normalizeResource(stored.publishDraft.qaSummary),
          })
        } else if (latestHistory) {
          setPublishDraft({
            ...DEFAULT_PUBLISH_DRAFT,
            title: latestHistory.title || DEFAULT_PUBLISH_DRAFT.title,
            pointName: latestHistory.pointName || DEFAULT_PUBLISH_DRAFT.pointName,
            notes: latestHistory.notes,
            liveLink: latestHistory.resources.liveLink,
            replayLink: latestHistory.resources.replayLink,
            question: latestHistory.resources.question,
            qaSummary: latestHistory.resources.qaSummary,
          })
        } else {
          setPublishDraft(DEFAULT_PUBLISH_DRAFT)
        }

        if (Array.isArray(stored?.scheduleItems) && stored?.scheduleItems.length) {
          setScheduleItems(sortScheduleTasks(stored.scheduleItems.map((task) => ({
            id: String(task.id || ''),
            date: String(task.date || ''),
            title: String(task.title || ''),
            liveTime: String(task.liveTime || ''),
            dueTime: String(task.dueTime || ''),
            remark: String(task.remark || ''),
          }))))
        } else if (latestHistory?.scheduleItems?.length) {
          const parsedHistoryTasks = latestHistory.scheduleItems
            .map((item, index) => {
              const live = parseDateTimeParts(item.liveAt || '')
              const due = parseDateTimeParts(item.dueAt || '')
              if (!live.date) return null
              return {
                id: `history_${index}_${live.date}`,
                date: live.date,
                title: String(item.title || '').trim() || DEFAULT_SCHEDULE_DRAFT.title,
                liveTime: live.time || DEFAULT_SCHEDULE_DRAFT.liveTime,
                dueTime: due.time || DEFAULT_SCHEDULE_DRAFT.dueTime,
                remark: String(item.remark || '').trim(),
              }
            })
            .filter((task): task is ScheduleTask => Boolean(task))
          setScheduleItems(sortScheduleTasks(parsedHistoryTasks))
        } else {
          setScheduleItems([])
        }

        if (Array.isArray(stored?.scheduleNotes) && stored.scheduleNotes.length === 3) {
          setScheduleNotes([
            String(stored.scheduleNotes[0] || ''),
            String(stored.scheduleNotes[1] || ''),
            String(stored.scheduleNotes[2] || ''),
          ])
        } else {
          setScheduleNotes(DEFAULT_SCHEDULE_NOTES)
        }

        const validStoredIds = (stored?.selectedStudentIds || []).filter((studentId) =>
          normalizedStudents.some((student) => student.id === studentId),
        )
        const nextSelectedIds = validStoredIds.length
          ? validStoredIds
          : normalizedStudents.map((student) => student.id)
        setSelectedStudentIds(nextSelectedIds)

        const firstStudentId = normalizedStudents[0]?.id || null
        const firstStudentWithHomework = normalizedHomeworks[0]?.studentId || firstStudentId
        setSelectedReviewStudentId(firstStudentWithHomework)
        setSelectedHomeworkId(normalizedHomeworks.find((record) => record.studentId === firstStudentWithHomework)?.id || null)
        setSelectedReportStudentId(firstStudentId)
        setDraftReady(true)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '直播刷题数据读取失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [loadTaskCounts, loadTaskItems, openTaskKey])

  useEffect(() => {
    if (openTaskKey !== 'liveDrill' || !draftReady || typeof window === 'undefined') return

    // 防抖写入草稿，避免每次按键都写 localStorage；cleanup 同时负责取消未落盘的写入
    const draftTimer = window.setTimeout(() => {
      writeStoredDraft({
        publishDraft,
        scheduleItems,
        selectedStudentIds,
        scheduleNotes,
      })
    }, 400)

    return () => {
      window.clearTimeout(draftTimer)
    }
  }, [draftReady, openTaskKey, publishDraft, scheduleItems, scheduleNotes, selectedStudentIds])

  useEffect(() => {
    if (selectedStudentHomeworks.length === 0) {
      setSelectedHomeworkId(null)
      return
    }

    if (!selectedHomeworkId || !selectedStudentHomeworks.some((record) => record.id === selectedHomeworkId)) {
      setSelectedHomeworkId(selectedStudentHomeworks[0].id)
    }
  }, [selectedHomeworkId, selectedStudentHomeworks])

  useEffect(() => {
    if (!students.length) return

    const preferredStudentId = students.find((student) =>
      drillReportItems.some((item) => item.studentId === student.id),
    )?.id || students[0].id

    if (!selectedReportStudentId || !students.some((student) => student.id === selectedReportStudentId)) {
      setSelectedReportStudentId(preferredStudentId)
    }
  }, [drillReportItems, selectedReportStudentId, students])

  if (openTaskKey !== 'liveDrill') return null

  function setPublishField<K extends keyof PublishDraft>(key: K, value: PublishDraft[K]) {
    setPublishDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function setScheduleField<K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) {
    setScheduleDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    )
  }

  function selectAllStudents() {
    setSelectedStudentIds(students.map((student) => student.id))
  }

  function clearSelectedStudents() {
    setSelectedStudentIds([])
  }

  function resetScheduleEditor() {
    setEditingScheduleId(null)
    setScheduleDraft(DEFAULT_SCHEDULE_DRAFT)
  }

  function loadScheduleIntoEditor(task: ScheduleTask) {
    setEditingScheduleId(task.id)
    setScheduleDraft({
      title: task.title,
      liveTime: task.liveTime,
      dueTime: task.dueTime,
      remark: task.remark,
    })
    setSelectedDate(task.date)
  }

  function saveScheduleTask() {
    const title = scheduleDraft.title.trim()
    if (!selectedDate) {
      setErrorMessage('请先选择日期')
      return
    }
    if (!title) {
      setErrorMessage('请先填写任务标题')
      return
    }

    setErrorMessage('')

    const payload: ScheduleTask = {
      id: editingScheduleId || `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: selectedDate,
      title,
      liveTime: scheduleDraft.liveTime.trim() || DEFAULT_SCHEDULE_DRAFT.liveTime,
      dueTime: scheduleDraft.dueTime.trim() || DEFAULT_SCHEDULE_DRAFT.dueTime,
      remark: scheduleDraft.remark.trim(),
    }

    setScheduleItems((current) => {
      if (editingScheduleId) {
        return sortScheduleTasks(current.map((item) => item.id === editingScheduleId ? payload : item))
      }
      return sortScheduleTasks([...current, payload])
    })

    setBannerMessage(editingScheduleId ? '当天日程已更新' : '当天日程已添加')
    resetScheduleEditor()
  }

  function removeScheduleTask(taskId: string) {
    setScheduleItems((current) => current.filter((task) => task.id !== taskId))
    if (editingScheduleId === taskId) {
      resetScheduleEditor()
    }
    setBannerMessage('当天日程已删除')
  }

  function setScheduleNote(index: number, value: string) {
    setScheduleNotes((current) => {
      const next = [...current] as ScheduleNotes
      next[index] = value
      return next
    })
  }

  function applyRestDay() {
    setScheduleDraft({
      title: '休息',
      liveTime: '',
      dueTime: '',
      remark: '',
    })
  }

  async function uploadFieldFile(key: ResourceFieldKey, file: File | null) {
    if (!file) return

    setUploadingMap((current) => ({ ...current, [key]: true }))
    setErrorMessage('')

    try {
      const form = new FormData()
      form.append('file', file)
      const response = await api.postForm<{
        ok?: boolean
        url?: string
        fileName?: string
        storedFile?: string
        size?: number
        message?: string
      }>('/api/teacher/drill/upload-file', form)

      if (!response?.ok || !response.url) {
        throw new Error(response?.message || '文件上传失败')
      }

      const resource: DrillResource = {
        url: response.url,
        fileName: response.fileName || file.name,
        storedFile: response.storedFile,
        size: response.size,
      }

      setPublishField(key, resource as PublishDraft[typeof key])
      setBannerMessage(`${resource.fileName} 已上传`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '文件上传失败')
    } finally {
      setUploadingMap((current) => ({ ...current, [key]: false }))
    }
  }

  async function previewSubmission(submissionId: string) {
    try {
      const fileUrl = await fetchSubmissionFileUrl(submissionId)
      window.open(fileUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '打开学生作答失败')
    }
  }

  function updateReviewDraft(submissionId: string, patch: Partial<ReviewDraft>) {
    setReviewDrafts((current) => {
      const baseRecord = homeworks.find((record) => record.id === submissionId)
      const base = current[submissionId] || (baseRecord ? buildReviewDraft(baseRecord) : {
        score: '',
        teacherComment: '',
        reviewFile: null,
        reviewFileName: '',
        savedAt: '',
      })

      return {
        ...current,
        [submissionId]: {
          ...base,
          ...patch,
        },
      }
    })
  }

  function saveReviewDraft(submissionId: string) {
    updateReviewDraft(submissionId, { savedAt: getNowLabel() })
    setBannerMessage('老师修订内容已暂存')
  }

  async function submitReview(record: HomeworkRecord) {
    const draft = reviewDrafts[record.id] || buildReviewDraft(record)
    const comment = draft.teacherComment.trim()
    const scoreText = draft.score.trim()
    const parsedScore = scoreText ? Number(scoreText) : null
    const hasExistingReviewedFile = record.hasReviewedFile || Boolean(record.reviewedFileName) || Boolean(draft.reviewFileName)

    if (!comment) {
      setErrorMessage('请先填写老师修订后的批改意见')
      return
    }
    if (scoreText && Number.isNaN(parsedScore)) {
      setErrorMessage('分数必须是数字')
      return
    }
    if (!draft.reviewFile && !hasExistingReviewedFile) {
      setErrorMessage('请先上传批改版 PDF，再提交修订结果')
      return
    }

    setReviewBusyId(record.id)
    setErrorMessage('')
    setBannerMessage('')

    try {
      let reviewedFileName = draft.reviewFileName || record.reviewedFileName

      if (draft.reviewFile) {
        const uploadResult = await uploadReviewedSubmissionPdf(record.id, draft.reviewFile)
        reviewedFileName = uploadResult.reviewedFileName || draft.reviewFile.name
      }

      await api.put(`/api/submissions/${record.id}/grade`, {
        score: parsedScore,
        feedback: comment,
      })

      const refreshedRows = await api.get<Array<Record<string, unknown>>>('/api/teacher/drill/homeworks')
      const refreshedHomeworks = Array.isArray(refreshedRows)
        ? refreshedRows.map((item) => normalizeHomework(item))
        : []

      setHomeworks(refreshedHomeworks)
      setReviewDrafts((current) => ({
        ...current,
        [record.id]: {
          ...draft,
          reviewFile: null,
          reviewFileName: reviewedFileName,
          savedAt: getNowLabel(),
        },
      }))
      setBannerMessage('AI 批改结果已按老师修订重新上传')
      await loadTaskCounts()
    } catch (error) {
      const message = error instanceof Error ? error.message : '二次上传失败'
      log.warn('drill.reviewSubmit.failed', { submissionId: record.id, message: error instanceof Error ? error.message : String(error) })
      setErrorMessage(message)
      toast.error(`批改结果重新上传失败：${message}`)
    } finally {
      setReviewBusyId(null)
    }
  }

  function getPublishPayload() {
    const tasks = sortScheduleTasks(scheduleItems)
    const firstTask = tasks[0]
    const lastTask = tasks[tasks.length - 1] || firstTask

    return {
      studentIds: selectedStudentIds,
      pointName: publishDraft.pointName.trim(),
      weekLabel: firstTask ? formatWeekLabel(firstTask.date) : formatWeekLabel(getTodayDate()),
      title: publishDraft.title.trim(),
      liveDate: firstTask?.date || getTodayDate(),
      liveTime: firstTask?.liveTime || DEFAULT_SCHEDULE_DRAFT.liveTime,
      dueDate: lastTask?.date || firstTask?.date || getTodayDate(),
      dueTime: lastTask?.dueTime || DEFAULT_SCHEDULE_DRAFT.dueTime,
      notes: publishDraft.notes.trim(),
      liveLink: publishDraft.liveLink.trim(),
      replayLink: publishDraft.replayLink.trim(),
      question: publishDraft.question,
      handout: null,
      qaSummary: publishDraft.qaSummary,
      report: null,
      scheduleItems: tasks.map((task) => ({
        id: task.id,
        weekLabel: formatWeekLabel(task.date),
        title: task.title,
        liveAt: `${task.date} ${task.liveTime}`.trim(),
        dueAt: `${task.date} ${task.dueTime}`.trim(),
        remark: task.remark,
      })),
    }
  }

  async function publishDrill() {
    const payload = getPublishPayload()

    if (!payload.studentIds.length) {
      setErrorMessage('请先选择刷题学生')
      setActiveSection('materials')
      return
    }
    if (!payload.pointName) {
      setErrorMessage('请先填写卡点名称')
      setActiveSection('materials')
      return
    }
    if (!payload.title) {
      setErrorMessage('请先填写本期刷题标题')
      setActiveSection('materials')
      return
    }
    if (!payload.question?.url) {
      setErrorMessage('请先上传题目')
      setActiveSection('materials')
      return
    }
    if (!payload.liveLink || !isHttpUrl(payload.liveLink)) {
      setErrorMessage('请先填写可访问的直播链接')
      setActiveSection('materials')
      return
    }
    if (payload.replayLink && !isHttpUrl(payload.replayLink)) {
      setErrorMessage('回放链接必须是 http 或 https 地址')
      setActiveSection('materials')
      return
    }
    if (!payload.scheduleItems.length) {
      setErrorMessage('请先在日程安排里至少添加一天任务')
      setActiveSection('schedule')
      return
    }

    setPublishBusy(true)
    setErrorMessage('')
    setBannerMessage('')

    try {
      const result = await api.post<{ ok?: boolean; assignedCount?: number }>('/api/teacher/drill/publish', payload)
      if (!result?.ok) {
        throw new Error('刷题发布失败')
      }

      setBannerMessage(`直播刷题已发布，覆盖 ${result.assignedCount || payload.studentIds.length} 名学生`)
      await Promise.all([
        loadTaskItems(),
        loadTaskCounts(),
      ])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '刷题发布失败')
    } finally {
      setPublishBusy(false)
    }
  }

  function openExternal(target = '') {
    if (!target.trim()) return
    const url = isHttpUrl(target) ? target : apiUrl(target)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function openDrillReport(item: TaskListItem) {
    closeTaskModal()
    openReportUpload(item)
  }

  const renderScheduleSection = () => (
    <div className="space-y-5">
      <Panel
        title={`月度任务表（${currentMonth.getMonth() + 1}月）`}
      action={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              上月
            </button>
            <div className="min-w-[110px] text-center text-sm font-semibold text-[var(--color-text-primary)]">
              {formatMonthTitle(currentMonth)}
            </div>
            <button
              type="button"
              onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              下月
            </button>
          </div>
        )}
      >
        <div className="overflow-hidden rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white">
          <div className="grid grid-cols-7 border-b border-[rgba(15,23,42,0.08)] bg-[rgba(241,245,249,0.8)]">
            {['一', '二', '三', '四', '五', '六', '日'].map((label) => (
              <div
                key={label}
                className="border-r border-[rgba(15,23,42,0.08)] px-3 py-3 text-sm font-semibold text-[var(--color-text-secondary)] last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              const dayTasks = sortScheduleTasks(scheduleItems.filter((task) => task.date === day.date))
              const selected = day.date === selectedDate
              const today = day.date === getTodayDate()
              const lastInRow = index % 7 === 6
              const isLastRow = index >= 35

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={[
                    'min-h-[158px] border-r border-b border-[rgba(15,23,42,0.08)] px-3 py-3 text-left align-top transition-colors',
                    selected ? 'bg-[rgba(59,130,246,0.08)]' : 'bg-white hover:bg-[rgba(248,250,252,0.92)]',
                    day.inCurrentMonth ? '' : 'bg-[rgba(248,250,252,0.82)] text-[var(--color-text-muted)]',
                    lastInRow ? 'border-r-0' : '',
                    isLastRow ? 'border-b-0' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={['text-sm font-semibold', today ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'].join(' ')}>
                      {day.dayNumber}
                    </span>
                    {today ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)] shadow-[0_4px_10px_rgba(59,130,246,0.12)]">
                        今日
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {dayTasks.length > 0 ? dayTasks.map((task) => (
                      <div key={task.id}>
                        <div className="font-medium text-[var(--color-text-primary)]">
                          {task.remark || task.title}
                        </div>
                        <div className="mt-1 text-[var(--color-text-muted)]">
                          {task.title !== '休息' ? formatTaskTime(task) : '休息'}
                        </div>
                      </div>
                    )) : null}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="border-t border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.76)] px-4 py-4">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">注意事项：</div>
            <div className="mt-3 space-y-3">
              {scheduleNotes.map((note, index) => (
                <div key={index} className="flex items-start gap-3">
                  <span className="pt-3 text-sm font-semibold text-[var(--color-text-secondary)]">{index + 1}.</span>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(event) => setScheduleNote(index, event.target.value)}
                    className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel
          title="当天安排"
        >
          <div className="space-y-5">
            <div className="rounded-[24px] bg-[var(--color-page-bg)] px-4 py-4">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">{formatDateText(selectedDate)}</div>
              <div className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                当前已安排 {selectedDateTasks.length} 个任务
              </div>
            </div>

            <div className="space-y-3">
              {selectedDateTasks.length > 0 ? selectedDateTasks.map((task) => (
                <div key={task.id} className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-text-primary)]">{task.title}</div>
                      <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{formatTaskTime(task)}</div>
                      <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{task.remark || '暂无任务内容'}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => loadScheduleIntoEditor(task)}
                        className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => removeScheduleTask(task.id)}
                        className="rounded-xl border border-[rgba(239,68,68,0.18)] px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              )) : (
                <EmptyState text="这一天还没有安排任务，右侧可以直接新增。" />
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title={editingScheduleId ? '编辑当天任务' : '新增当天任务'}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="rounded-[24px] bg-[var(--color-page-bg)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                当前日期：<span className="font-semibold text-[var(--color-text-primary)]">{formatDateText(selectedDate)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyRestDay}
                  className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  快速填入“休息”
                </button>
                {editingScheduleId ? (
                  <button
                    type="button"
                    onClick={resetScheduleEditor}
                    className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    取消编辑
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InputField
                label="任务名称"
                value={scheduleDraft.title}
                onChange={(value) => setScheduleField('title', value)}
                placeholder="例如：提交刷题作业 / 休息 / 参加讲评"
              />
              <InputField
                label="时间段"
                value={scheduleDraft.liveTime}
                onChange={(value) => setScheduleField('liveTime', value)}
                placeholder="例如：19:00"
              />
              <InputField
                label="结束时间"
                value={scheduleDraft.dueTime}
                onChange={(value) => setScheduleField('dueTime', value)}
                placeholder="例如：20:30，可留空"
              />
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={saveScheduleTask}
                  className="w-full rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
                >
                  {editingScheduleId ? '保存修改' : '写入月度任务表'}
                </button>
              </div>
            </div>

            <TextareaField
              label="任务内容"
              value={scheduleDraft.remark}
              onChange={(value) => setScheduleField('remark', value)}
              placeholder="例如：完成 1 道作文立意错误题，提交后根据反馈完成修改。"
              rows={6}
            />
          </div>
        </Panel>
      </div>
    </div>
  )

  const renderMaterialsSection = () => (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel
          title="本期资料"
          desc="这里保留你指定的四个板块：题目上传、直播链接、回放链接、答疑总结上传。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FileUploadCard
              title="题目上传"
              desc="学生刷题前会先读取这里的题目文件。"
              resource={publishDraft.question}
              uploading={uploadingMap.question}
              onPick={() => questionInputRef.current?.click()}
              onPreview={() => openExternal(publishDraft.question?.url || '')}
            />
            <LinkCard
              title="直播链接上传"
              desc="直播课入口，发布前会校验链接格式。"
              value={publishDraft.liveLink}
              onChange={(value) => setPublishField('liveLink', value)}
              placeholder="https://..."
              onOpen={() => openExternal(publishDraft.liveLink)}
            />
            <LinkCard
              title="回放链接上传"
              desc="直播结束后给学生补充回看入口。"
              value={publishDraft.replayLink}
              onChange={(value) => setPublishField('replayLink', value)}
              placeholder="https://..."
              onOpen={() => openExternal(publishDraft.replayLink)}
            />
            <FileUploadCard
              title="答疑总结上传"
              desc="汇总直播后的补充说明、讲评或答疑资料。"
              resource={publishDraft.qaSummary}
              uploading={uploadingMap.qaSummary}
              onPick={() => summaryInputRef.current?.click()}
              onPreview={() => openExternal(publishDraft.qaSummary?.url || '')}
            />
          </div>
        </Panel>

        <Panel
          title="发布信息"
          desc="这里补充本期标题、卡点名称和面向哪些刷题学生发布，然后一键同步到学生端刷题流程。"
          action={(
            <button
              type="button"
              onClick={() => void publishDrill()}
              disabled={publishBusy}
              className="rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {publishBusy ? '发布中...' : '保存并发布本次刷题'}
            </button>
          )}
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <InputField
                label="本期标题"
                value={publishDraft.title}
                onChange={(value) => setPublishField('title', value)}
                placeholder="例如：直播刷题第 1 期"
              />
              <InputField
                label="卡点名称"
                value={publishDraft.pointName}
                onChange={(value) => setPublishField('pointName', value)}
                placeholder="例如：概括归纳题"
              />
            </div>
            <TextareaField
              label="本期说明"
              value={publishDraft.notes}
              onChange={(value) => setPublishField('notes', value)}
              placeholder="写给学生的补充说明，也会一起进入本次刷题配置。"
            />

            <div className="rounded-[26px] border border-[var(--color-border)] bg-[rgba(248,250,252,0.92)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">刷题学生选择</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    默认已勾选全部刷题学生。你可以按本次发布范围做增减。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllStudents}
                    className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedStudents}
                    className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    清空
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {students.length > 0 ? students.map((student) => {
                  const selected = selectedStudentIds.includes(student.id)
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => toggleStudent(student.id)}
                      className={[
                        'flex items-center gap-3 rounded-full border px-4 py-2.5 text-left transition-all',
                        selected
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                          : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]',
                      ].join(' ')}
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: student.color }}
                      >
                        {student.avatar}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--color-text-primary)]">{student.name}</span>
                        <span className="block text-xs text-[var(--color-text-secondary)]">{student.grade} {student.subject}</span>
                      </span>
                    </button>
                  )
                }) : (
                  <div className="text-sm text-[var(--color-text-muted)]">当前没有可选的刷题学生</div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4">
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-text-muted)]">已选学生</div>
                <div className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">{selectedStudentIds.length}</div>
              </div>
              <div className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4">
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-text-muted)]">已排日程</div>
                <div className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">{scheduleItems.length}</div>
              </div>
              <div className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4">
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-text-muted)]">已上传资料</div>
                <div className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
                  {[publishDraft.question, publishDraft.qaSummary].filter(Boolean).length}/2
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )

  const renderReviewSection = () => (
    <div className="grid gap-5 xl:grid-cols-[280px_320px_1fr]">
      <Panel
        title="刷题学生"
        desc="先选学生，再看他的作答、AI 批改结果和老师修订内容。"
      >
        <div className="space-y-3">
          {reviewStudentSummaries.length > 0 ? reviewStudentSummaries.map(({ student, total, aiDone }) => {
            const active = student.id === selectedReviewStudentId
            return (
              <button
                key={student.id}
                type="button"
                onClick={() => setSelectedReviewStudentId(student.id)}
                className={[
                  'w-full rounded-[24px] border px-4 py-4 text-left transition-all',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: student.color }}
                  >
                    {student.avatar}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">{student.name}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{student.grade} {student.subject}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[var(--color-primary)]">作答 {total}</span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[var(--color-primary)]">AI 完成 {aiDone}</span>
                    </div>
                  </div>
                </div>
              </button>
            )
          }) : (
            <EmptyState text="当前没有刷题学生数据。" />
          )}
        </div>
      </Panel>

      <Panel
        title="学生作答"
        desc={selectedReviewStudent ? `当前查看 ${selectedReviewStudent.name} 的刷题提交。` : '先从左边选择一名刷题学生。'}
      >
        <div className="space-y-3">
          {selectedStudentHomeworks.length > 0 ? selectedStudentHomeworks.map((record) => {
            const active = record.id === selectedHomework?.id
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelectedHomeworkId(record.id)}
                className={[
                  'w-full rounded-[24px] border px-4 py-4 text-left transition-all',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{record.fileName}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{record.pointName || '未设置卡点'}</div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
                    {record.aiDone ? 'AI 已跑完' : 'AI 处理中'}
                  </span>
                </div>
                <div className="mt-3 text-xs text-[var(--color-text-muted)]">提交时间：{toDisplayLabel(record.submittedAt, '未记录')}</div>
              </button>
            )
          }) : (
            <EmptyState text="这个刷题学生目前还没有可查看的作答记录。" />
          )}
        </div>
      </Panel>

      <Panel
        title="AI 批改与老师修订"
        desc="老师可以查看 AI 结果，修改分数和评语，并重新上传批改版 PDF。"
      >
        {selectedHomework && selectedHomeworkDraft && selectedHomeworkAiResult ? (
          <div className="space-y-5">
            <div className="rounded-[24px] bg-[var(--color-page-bg)] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-[var(--color-text-primary)]">{selectedHomework.studentName}</div>
                  <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {selectedHomework.grade} {selectedHomework.subject ? `· ${selectedHomework.subject}` : ''}
                    {selectedHomework.pointName ? ` · ${selectedHomework.pointName}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void previewSubmission(selectedHomework.id)}
                  className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
                >
                  打开学生作答
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">AI 批改结果</div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                  <div className="rounded-2xl bg-[var(--color-page-bg)] px-4 py-3">
                    当前状态：{selectedHomeworkAiResult.status || (selectedHomework.aiDone ? 'reviewed' : 'pending_review')}
                  </div>
                  <div className="rounded-2xl bg-[var(--color-page-bg)] px-4 py-3">
                    AI 分数：{selectedHomeworkAiResult.score ?? '未设置'}
                  </div>
                  <div className="rounded-2xl bg-[var(--color-page-bg)] px-4 py-3">
                    AI 评语：{selectedHomeworkAiResult.feedback || '暂无'}
                  </div>
                  <div className="rounded-2xl bg-[var(--color-page-bg)] px-4 py-3">
                    AI 批改文件：{selectedHomeworkAiResult.reviewedFileName || '暂无'}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">老师二次上传</div>
                <div className="mt-4 rounded-2xl bg-[var(--color-page-bg)] px-4 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                  这里的分数和评语会直接按老师修订结果写回批改记录。上传新的 PDF 后，会覆盖之前的批改版文件。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => reviewFileInputRef.current?.click()}
                    className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    上传批改版 PDF
                  </button>
                </div>
                <div className="mt-3 text-xs text-[var(--color-text-muted)]">
                  当前批改文件：{selectedHomeworkDraft.reviewFileName || '未上传'}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InputField
                label="老师修订分数"
                value={selectedHomeworkDraft.score}
                onChange={(value) => updateReviewDraft(selectedHomework.id, { score: value })}
                placeholder="例如：72"
              />
              <div className="flex items-end">
                <div className="w-full rounded-[24px] bg-[var(--color-page-bg)] px-4 py-4 text-xs leading-6 text-[var(--color-text-secondary)]">
                  最近暂存：{selectedHomeworkDraft.savedAt || '无'}
                </div>
              </div>
            </div>

            <TextareaField
              label="老师修订评语"
              value={selectedHomeworkDraft.teacherComment}
              onChange={(value) => updateReviewDraft(selectedHomework.id, { teacherComment: value })}
              placeholder="老师确认 AI 结果后，可以在这里直接改成最终评语。"
              rows={8}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => saveReviewDraft(selectedHomework.id)}
                disabled={reviewBusyId === selectedHomework.id}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                暂存老师修订
              </button>
              <button
                type="button"
                onClick={() => void submitReview(selectedHomework)}
                disabled={reviewBusyId === selectedHomework.id}
                className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reviewBusyId === selectedHomework.id ? '重新上传中...' : '按老师修订重新上传'}
              </button>
            </div>
          </div>
        ) : (
          <EmptyState text="先选择一名学生和一条刷题作答，再查看 AI 批改与老师修订区。" />
        )}
      </Panel>
    </div>
  )

  const renderReportSection = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
      <Panel
        title="刷题学生"
        desc="这里保留所有刷题学生，点击后看他有没有待上传的刷题报告。"
      >
        <div className="space-y-3">
          {students.length > 0 ? students.map((student) => {
            const active = student.id === selectedReportStudentId
            const reportCount = getStudentReportItems(drillReportItems, student.id).length
            return (
              <button
                key={student.id}
                type="button"
                onClick={() => setSelectedReportStudentId(student.id)}
                className={[
                  'w-full rounded-[24px] border px-4 py-4 text-left transition-all',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: student.color }}
                  >
                    {student.avatar}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">{student.name}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{student.grade} {student.subject}</div>
                    <div className="mt-3 text-[11px] text-[var(--color-text-muted)]">待上传刷题报告：{reportCount}</div>
                  </div>
                </div>
              </button>
            )
          }) : (
            <EmptyState text="当前没有刷题学生。" />
          )}
        </div>
      </Panel>

      <Panel
        title="报告上传入口"
        desc={selectedReportStudent ? `选中 ${selectedReportStudent.name} 后，可以直接跳转到“待上传报告”的“刷题报告”工作区。` : '先从左边选一个刷题学生。'}
      >
        {selectedReportStudent ? (
          <div className="space-y-4">
            <div className="rounded-[24px] bg-[var(--color-page-bg)] px-4 py-4">
              <div className="text-base font-semibold text-[var(--color-text-primary)]">{selectedReportStudent.name}</div>
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {selectedReportStudent.grade} {selectedReportStudent.subject}
              </div>
            </div>

            {selectedReportItems.length > 0 ? (
              <div className="space-y-3">
                {selectedReportItems.map((item) => (
                  <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{item.pointName || '刷题报告'}</div>
                        <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{item.subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openDrillReport(item)}
                        className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
                      >
                        去上传报告
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="这个刷题学生当前没有待上传的刷题报告任务。" />
            )}
          </div>
        ) : (
          <EmptyState text="先从左边选择一名刷题学生。" />
        )}
      </Panel>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/35">
      <div className="h-[92vh] w-[94vw] overflow-hidden rounded-[34px] bg-[#eef2f6] shadow-[0_28px_60px_rgba(15,23,42,0.22)]">
        <div className="flex h-full min-h-0">
          <aside className="flex w-[330px] shrink-0 flex-col border-r border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f6_100%)] px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-primary)]">Live Drill</div>
                <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">直播刷题</div>
                <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                  左边固定四个工作区，右边按所选板块切换内容。
                </div>
              </div>
              <button
                type="button"
                onClick={closeTaskModal}
                className="rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                关闭
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {SECTION_META.map((section) => (
                <NavItem
                  key={section.key}
                  active={activeSection === section.key}
                  section={section}
                  onClick={() => setActiveSection(section.key)}
                />
              ))}
            </div>

            <div className="mt-auto rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-text-muted)]">工作区概览</div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl bg-[var(--color-page-bg)] px-4 py-3">
                  <div className="text-[11px] text-[var(--color-text-muted)]">刷题学生</div>
                  <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{students.length}</div>
                </div>
                <div className="rounded-2xl bg-[var(--color-page-bg)] px-4 py-3">
                  <div className="text-[11px] text-[var(--color-text-muted)]">本期日程</div>
                  <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{scheduleItems.length}</div>
                </div>
                <div className="rounded-2xl bg-[var(--color-page-bg)] px-4 py-3">
                  <div className="text-[11px] text-[var(--color-text-muted)]">待上传刷题报告</div>
                  <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{drillReportItems.length}</div>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[rgba(15,23,42,0.08)] bg-white px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-[var(--color-text-primary)]">
                      {SECTION_META.find((item) => item.key === activeSection)?.label}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                      {SECTION_META.find((item) => item.key === activeSection)?.hint}
                    </div>
                  </div>
                  {activeSection === 'materials' ? (
                    <button
                      type="button"
                      onClick={() => void publishDrill()}
                      disabled={publishBusy}
                      className="rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {publishBusy ? '发布中...' : '保存并发布'}
                    </button>
                  ) : null}
                </div>

                {bannerMessage ? (
                  <div className="mt-4 rounded-2xl bg-[rgba(16,185,129,0.12)] px-4 py-3 text-sm text-emerald-700">
                    {bannerMessage}
                  </div>
                ) : null}
                {errorMessage ? (
                  <div className="mt-4 rounded-2xl bg-[rgba(239,68,68,0.12)] px-4 py-3 text-sm text-red-600">
                    {errorMessage}
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                {loading ? (
                  <EmptyState text="正在读取直播刷题数据..." />
                ) : activeSection === 'schedule' ? renderScheduleSection()
                  : activeSection === 'materials' ? renderMaterialsSection()
                    : activeSection === 'review' ? renderReviewSection()
                      : renderReportSection()}
              </div>
            </div>
          </main>
        </div>

        <input
          ref={questionInputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            void uploadFieldFile('question', event.target.files?.[0] || null)
            event.currentTarget.value = ''
          }}
        />
        <input
          ref={summaryInputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            void uploadFieldFile('qaSummary', event.target.files?.[0] || null)
            event.currentTarget.value = ''
          }}
        />
        <input
          ref={reviewFileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            if (selectedHomework && file) {
              updateReviewDraft(selectedHomework.id, {
                reviewFile: file,
                reviewFileName: file.name,
              })
              setBannerMessage(`${file.name} 已加入二次上传队列`)
            }
            event.currentTarget.value = ''
          }}
        />
      </div>
    </div>,
    document.body,
  )
}
