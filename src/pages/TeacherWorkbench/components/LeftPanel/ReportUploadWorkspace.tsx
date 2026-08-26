import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from '../../../../components/ui/toastCore'
import { dateKeyOf } from '../../../../lib/datetime'
import type { QuestionAnswer } from '../../types'
import { useWorkbenchStore } from '../../store/workbenchStore'
import reportPage1Image from '../../../../assets/report-page-1.png'
import reportPage2Image from '../../../../assets/report-page-2.png'
import reportPage3Image from '../../../../assets/report-page-3.png'

type ReportCategory = 'diagnose' | 'checkpoint' | 'drill'
type DrillArchetypeKey = 'reluctant' | 'intuition' | 'perfectionist' | 'logic'

interface DrillReportMetrics {
  total: number
  reviewed: number
  pending: number
  averageScore: number | null
  activeDays: number
  monthLabel: string
  latestSubmittedAt: string
  topPoints: string[]
  pointFrequency: Array<{ label: string; count: number }>
  uniquePointCount: number
  latestComments: string[]
}

interface DrillReportDraft {
  reportTitle: string
  studentName: string
  targetExam: string
  targetScore: string
  reportDate: string
  conclusionType: DrillArchetypeKey
  conclusionLabel: string
  conclusionBody: string
  surpassPercent: string
  currentScore: string
  unresolvedLossCount: string
  pendingCheckpointCount: string
  primaryBreakthrough: string
  secondaryBreakthrough: string
}

interface DrillArchetypeOption {
  key: DrillArchetypeKey
  label: string
  body: string
}

type OverlayTheme = 'header' | 'chip' | 'paper' | 'number' | 'accent'
type OverlayFieldMode = 'text' | 'textarea'

interface OverlayFieldConfig {
  id: string
  page: number
  field: keyof DrillReportDraft
  mode: OverlayFieldMode
  theme: OverlayTheme
  top: number
  left: number
  width: number
  height: number
  placeholder?: string
  fontSize?: string
  lineHeight?: string
  fontWeight?: number
  align?: CSSProperties['textAlign']
  displayValue?: (draft: DrillReportDraft) => string
}

const DRILL_DRAFT_STORAGE_PREFIX = 'teacher_workbench_drill_report_draft_hollow_v1'
const MONTHLY_DRILL_TARGET = 5
const EMPTY_ANSWERS: QuestionAnswer[] = []

const DRILL_ARCHETYPE_OPTIONS: DrillArchetypeOption[] = [
  {
    key: 'reluctant',
    label: '不愿动笔型选手',
    body: '你当前的问题不是完全不会，而是输出频率偏低。建议先把动笔次数提上来，在稳定提交的基础上再做针对性复盘。',
  },
  {
    key: 'intuition',
    label: '直觉型选手',
    body: '你有一定找点能力，但在材料信息复杂时容易遗漏重点。后续要把阅读方法和材料结构分析固定下来，减少凭感觉作答。',
  },
  {
    key: 'perfectionist',
    label: '死磕完美型选手',
    body: '你有基础，但容易在局部表达上投入过多时间。后续要兼顾规范表达和限时作答，避免因为纠结细节拖慢整体节奏。',
  },
  {
    key: 'logic',
    label: '逻辑不顺型选手',
    body: '你能拿到基础分，但复杂题型中逻辑组织不够稳定。后续要强化审题、搭框架和分点表达，把思路先排清楚再落笔。',
  },
]

const PDF_PAGES = [
  { image: reportPage1Image, page: 1 },
  { image: reportPage2Image, page: 2 },
  { image: reportPage3Image, page: 3 },
]

const PAGE_ONE_OVERLAY_FIELDS: OverlayFieldConfig[] = [
  {
    id: 'reportTitle',
    page: 1,
    field: 'reportTitle',
    mode: 'text',
    theme: 'header',
    top: 1.82,
    left: 4.2,
    width: 22.4,
    height: 3.25,
    fontSize: '2.45vw',
    fontWeight: 800,
    placeholder: '申论4月刷题报告',
  },
  {
    id: 'studentNameChip',
    page: 1,
    field: 'studentName',
    mode: 'text',
    theme: 'chip',
    top: 1.82,
    left: 39.4,
    width: 10.6,
    height: 1.9,
    fontSize: '1.08vw',
    fontWeight: 700,
    displayValue: (draft) => draft.studentName,
    placeholder: '学员姓名',
  },
  {
    id: 'targetExamChip',
    page: 1,
    field: 'targetExam',
    mode: 'text',
    theme: 'chip',
    top: 1.82,
    left: 60.8,
    width: 11.8,
    height: 1.9,
    fontSize: '1.05vw',
    fontWeight: 700,
    displayValue: (draft) => draft.targetExam,
    placeholder: '目标考试',
  },
  {
    id: 'targetScoreChip',
    page: 1,
    field: 'targetScore',
    mode: 'text',
    theme: 'chip',
    top: 1.82,
    left: 79.4,
    width: 2.4,
    height: 1.9,
    fontSize: '1.08vw',
    fontWeight: 800,
    align: 'center',
    displayValue: (draft) => draft.targetScore,
    placeholder: '70',
  },
  {
    id: 'reportDateChip',
    page: 1,
    field: 'reportDate',
    mode: 'text',
    theme: 'chip',
    top: 1.82,
    left: 91.0,
    width: 4.8,
    height: 1.9,
    fontSize: '1.02vw',
    fontWeight: 700,
    align: 'center',
    displayValue: (draft) => draft.reportDate.replace(/\//g, ''),
    placeholder: '20260408',
  },
  {
    id: 'conclusionLabel',
    page: 1,
    field: 'conclusionLabel',
    mode: 'text',
    theme: 'paper',
    top: 13.0,
    left: 28.8,
    width: 16.4,
    height: 2.1,
    fontSize: '1.4vw',
    fontWeight: 800,
    placeholder: '直觉型选手',
  },
  {
    id: 'conclusionBody',
    page: 1,
    field: 'conclusionBody',
    mode: 'textarea',
    theme: 'paper',
    top: 15.8,
    left: 17.4,
    width: 75.4,
    height: 9.6,
    fontSize: '1.06vw',
    lineHeight: '1.65',
    fontWeight: 600,
    placeholder: '填写本月报告结论',
  },
  {
    id: 'surpassPercent',
    page: 1,
    field: 'surpassPercent',
    mode: 'text',
    theme: 'paper',
    top: 31.18,
    left: 5.7,
    width: 4.1,
    height: 1.8,
    fontSize: '1.25vw',
    fontWeight: 800,
    align: 'center',
    placeholder: '20',
  },
  {
    id: 'currentScore',
    page: 1,
    field: 'currentScore',
    mode: 'text',
    theme: 'number',
    top: 36.75,
    left: 10.2,
    width: 8.7,
    height: 2.75,
    fontSize: '2.25vw',
    fontWeight: 800,
    align: 'center',
    placeholder: '57-61',
  },
  {
    id: 'targetScoreCard',
    page: 1,
    field: 'targetScore',
    mode: 'text',
    theme: 'number',
    top: 36.75,
    left: 34.9,
    width: 7.2,
    height: 2.75,
    fontSize: '2.25vw',
    fontWeight: 800,
    align: 'center',
    placeholder: '70',
  },
  {
    id: 'unresolvedLossCount',
    page: 1,
    field: 'unresolvedLossCount',
    mode: 'text',
    theme: 'number',
    top: 36.75,
    left: 59.4,
    width: 7.0,
    height: 2.75,
    fontSize: '2.25vw',
    fontWeight: 800,
    align: 'center',
    placeholder: '19',
  },
  {
    id: 'pendingCheckpointCount',
    page: 1,
    field: 'pendingCheckpointCount',
    mode: 'text',
    theme: 'number',
    top: 36.75,
    left: 84.0,
    width: 5.2,
    height: 2.75,
    fontSize: '2.25vw',
    fontWeight: 800,
    align: 'center',
    placeholder: '5',
  },
  {
    id: 'primaryBreakthrough',
    page: 1,
    field: 'primaryBreakthrough',
    mode: 'text',
    theme: 'accent',
    top: 89.9,
    left: 16.8,
    width: 22.6,
    height: 1.95,
    fontSize: '1.18vw',
    fontWeight: 800,
    placeholder: '要点不全不准、总结转述难',
  },
  {
    id: 'secondaryBreakthrough',
    page: 1,
    field: 'secondaryBreakthrough',
    mode: 'text',
    theme: 'accent',
    top: 92.12,
    left: 16.2,
    width: 29.2,
    height: 1.95,
    fontSize: '1.12vw',
    fontWeight: 800,
    placeholder: '分析结构不清、作文立意不准、作文逻辑不清',
  },
]

function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatMonthLabel(value?: string | null): string {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return '本月'
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
  })
}

function formatReportDateValue(value?: string | null): string {
  if (!value) return formatDateOnly(dateKeyOf(new Date()))
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function isCurrentNaturalMonth(value?: string | null): boolean {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatScoreRange(value: number | null): string {
  if (value === null) return '--'
  const low = clampNumber(value - 2, 0, 100)
  const high = clampNumber(value + 2, 0, 100)
  return low === high ? String(value) : `${low}-${high}`
}

function sortAnswersByRecent(answers: QuestionAnswer[]): QuestionAnswer[] {
  return [...answers].sort((left, right) =>
    String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')),
  )
}

function getReportCategoryLabel(category: ReportCategory): string {
  switch (category) {
    case 'diagnose':
      return '诊断报告'
    case 'checkpoint':
      return '卡点报告'
    case 'drill':
      return '刷题报告'
    default:
      return '报告'
  }
}

function getArchetypeOption(key: DrillArchetypeKey): DrillArchetypeOption {
  return DRILL_ARCHETYPE_OPTIONS.find((option) => option.key === key) || DRILL_ARCHETYPE_OPTIONS[0]
}

function detectDrillArchetype(
  total: number,
  comments: string[],
  pointFrequency: Array<{ label: string; count: number }>,
): DrillArchetypeKey {
  if (total <= 1) return 'reluctant'

  const signalText = `${pointFrequency.map((item) => item.label).join(' ')} ${comments.join(' ')}`

  if (/(要点|提炼|总结|转述|阅读)/.test(signalText)) return 'intuition'
  if (/(表达|对策|规范|限时|完美)/.test(signalText)) return 'perfectionist'
  if (/(逻辑|结构|作文|分析|论证)/.test(signalText)) return 'logic'

  return total < 3 ? 'reluctant' : 'intuition'
}

function buildDrillMetrics(entries: QuestionAnswer[]): DrillReportMetrics {
  const reviewedAnswers = entries.filter((answer) => answer.status === 'reviewed')
  const scores = reviewedAnswers
    .map((answer) => (typeof answer.score === 'number' ? answer.score : null))
    .filter((score): score is number => score !== null)
  const averageScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null
  const pointMap = new Map<string, number>()

  entries.forEach((answer) => {
    const point = String(answer.pointName || '').trim()
    if (!point) return
    pointMap.set(point, (pointMap.get(point) || 0) + 1)
  })

  const pointFrequency = [...pointMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, count]) => ({ label, count }))

  const latestComments = reviewedAnswers
    .map((answer) => String(answer.teacherComment || '').trim())
    .filter(Boolean)
    .slice(0, 3)

  const latestSubmittedAt = entries[0]?.submittedAt || ''

  return {
    total: entries.length,
    reviewed: reviewedAnswers.length,
    pending: entries.length - reviewedAnswers.length,
    averageScore,
    activeDays: new Set(entries.map((answer) => formatDateOnly(answer.submittedAt)).filter((value) => value !== '-')).size,
    monthLabel: formatMonthLabel(latestSubmittedAt),
    latestSubmittedAt: latestSubmittedAt ? formatDateTime(latestSubmittedAt) : '-',
    topPoints: pointFrequency.slice(0, 3).map((item) => item.label),
    pointFrequency,
    uniquePointCount: pointFrequency.length,
    latestComments,
  }
}

function buildDrillReportDraft(studentName: string, metrics: DrillReportMetrics, pointName: string): DrillReportDraft {
  const archetype = detectDrillArchetype(metrics.total, metrics.latestComments, metrics.pointFrequency)
  const archetypeOption = getArchetypeOption(archetype)
  const primaryPoint = metrics.pointFrequency[0]?.label || pointName || '核心卡点'
  const secondaryPoints = metrics.pointFrequency.slice(1, 3).map((item) => item.label).join('、') || '相关题型能力'
  const surpassPercent = metrics.total <= 0
    ? '0'
    : String(clampNumber(8 + metrics.total * 9 + (metrics.averageScore ?? 55) - 45, 5, 95))
  const unresolvedLossCount = metrics.total >= MONTHLY_DRILL_TARGET
    ? Math.max(1, metrics.pointFrequency.reduce((sum, item) => sum + item.count, 0))
    : Math.max(1, MONTHLY_DRILL_TARGET - metrics.total + metrics.pending + metrics.uniquePointCount)

  return {
    reportTitle: `${metrics.monthLabel}刷题报告`,
    studentName,
    targetExam: '浙江省考、国考',
    targetScore: '70',
    reportDate: formatReportDateValue(),
    conclusionType: archetypeOption.key,
    conclusionLabel: archetypeOption.label,
    conclusionBody: archetypeOption.body,
    surpassPercent,
    currentScore: formatScoreRange(metrics.averageScore),
    unresolvedLossCount: String(unresolvedLossCount),
    pendingCheckpointCount: String(Math.max(1, metrics.uniquePointCount || (primaryPoint ? 1 : 0))),
    primaryBreakthrough: primaryPoint,
    secondaryBreakthrough: secondaryPoints,
  }
}

function buildEditableShellDraft(base: DrillReportDraft): DrillReportDraft {
  return {
    ...base,
    reportTitle: '',
    studentName: '',
    targetExam: '',
    targetScore: '',
    reportDate: '',
    conclusionLabel: '',
    conclusionBody: '',
    surpassPercent: '',
    currentScore: '',
    unresolvedLossCount: '',
    pendingCheckpointCount: '',
    primaryBreakthrough: '',
    secondaryBreakthrough: '',
  }
}

function areDrillDraftsEqual(left: DrillReportDraft, right: DrillReportDraft): boolean {
  return (
    left.reportTitle === right.reportTitle
    && left.studentName === right.studentName
    && left.targetExam === right.targetExam
    && left.targetScore === right.targetScore
    && left.reportDate === right.reportDate
    && left.conclusionType === right.conclusionType
    && left.conclusionLabel === right.conclusionLabel
    && left.conclusionBody === right.conclusionBody
    && left.surpassPercent === right.surpassPercent
    && left.currentScore === right.currentScore
    && left.unresolvedLossCount === right.unresolvedLossCount
    && left.pendingCheckpointCount === right.pendingCheckpointCount
    && left.primaryBreakthrough === right.primaryBreakthrough
    && left.secondaryBreakthrough === right.secondaryBreakthrough
  )
}

function buildDrillDraftStorageKey(studentId: string, taskId: string, pointName: string): string {
  return [DRILL_DRAFT_STORAGE_PREFIX, studentId || 'unknown', taskId || 'report', pointName || 'default'].join('__')
}

function buildDrillReportCopy(draft: DrillReportDraft): string {
  return [
    draft.reportTitle,
    `目标考试：${draft.targetExam}`,
    `目标分数：${draft.targetScore}`,
    `报告日期：${draft.reportDate}`,
    `学员姓名：${draft.studentName}`,
    '',
    '一、本月报告结论',
    draft.conclusionLabel,
    draft.conclusionBody,
    '',
    '二、你本月的申论刷题进度',
    `仅超过 ${draft.surpassPercent}% 的学员`,
    `你的得分：${draft.currentScore}`,
    `你的目标：${draft.targetScore}`,
    `待解决失分点：${draft.unresolvedLossCount}`,
    `待攻关卡点：${draft.pendingCheckpointCount}`,
    '',
    '三、突破顺序',
    `优先解决 ${draft.primaryBreakthrough}，提升底层阅读能力。`,
    `其次突破 ${draft.secondaryBreakthrough}，提升专项题型应试能力。`,
  ].join('\n')
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[11px] text-[var(--color-text-secondary)]">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="ml-1 font-medium text-[var(--color-text-primary)]">{value || '-'}</span>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-white px-4 text-center text-sm text-[var(--color-text-muted)]">
      {text}
    </div>
  )
}

function SplitResizeHandle({ onDragStart }: { onDragStart: (clientX: number) => void }) {
  return (
    <div
      className="group flex h-full w-4 shrink-0 cursor-col-resize items-center justify-center"
      onMouseDown={(event) => {
        event.preventDefault()
        onDragStart(event.clientX)
      }}
    >
      <div className="relative h-full w-px bg-[var(--color-border)] transition-colors group-hover:bg-[var(--color-primary)]">
        <div className="absolute left-1/2 top-1/2 flex h-10 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-white shadow-sm transition-colors group-hover:border-[var(--color-primary)]">
          <svg width="8" height="18" viewBox="0 0 8 18" fill="none">
            <line x1="2" y1="2" x2="2" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-gray-300" />
            <line x1="6" y1="2" x2="6" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-gray-300" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  desc,
  children,
  action,
}: {
  title: string
  desc: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-[var(--color-text-primary)]">{title}</div>
          <div className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{desc}</div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function TemplateInput({
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

function TemplateTextarea({
  label,
  value,
  onChange,
  placeholder,
  minHeight = 140,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  minHeight?: number
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">{value.trim().length} 字</span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ minHeight: `${minHeight}px` }}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-page-bg)] px-4 py-3 text-sm leading-6 text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)] focus:bg-white"
      />
    </label>
  )
}

function DrillAnswerCard({ answer }: { answer: QuestionAnswer }) {
  const reviewed = answer.status === 'reviewed'

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {answer.questionTitle || answer.fileName || '刷题记录'}
          </div>
          <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
            提交时间：{formatDateTime(answer.submittedAt)}
          </div>
        </div>
        <span
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-medium',
            reviewed ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600',
          ].join(' ')}
        >
          {reviewed ? '已批改' : '待批改'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {answer.pointName ? <MetaPill label="卡点" value={answer.pointName} /> : null}
        {answer.score !== null && answer.score !== undefined ? <MetaPill label="分数" value={String(answer.score)} /> : null}
        {answer.fileName ? <MetaPill label="文件" value={answer.fileName} /> : null}
      </div>

      {answer.teacherComment ? (
        <div className="mt-4 rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary-light)] px-4 py-3 text-sm leading-6 text-[var(--color-text-primary)]">
          {answer.teacherComment}
        </div>
      ) : null}
    </div>
  )
}

function LeftDataPanel({
  category,
  answers,
  loading,
}: {
  category: ReportCategory
  answers: QuestionAnswer[]
  loading: boolean
}) {
  const drillAnswers = useMemo(
    () => sortAnswersByRecent(answers.filter((answer) => answer.stageKey === 'drill' && isCurrentNaturalMonth(answer.submittedAt))),
    [answers],
  )

  if (loading) {
    return <EmptyState text="正在加载学员学习数据..." />
  }

  if (category !== 'drill') {
    return <EmptyState text="当前先处理刷题报告的 PDF 模板预览，其他报告类型后续接入。" />
  }

  if (!drillAnswers.length) {
    return <EmptyState text="当前自然月还没有可用于生成刷题报告的提交记录。" />
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">本月刷题记录</div>
        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
          左侧展示本月提交，右侧 PDF 预览第一页已经支持直接挖空编辑。
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {drillAnswers.map((answer) => (
          <DrillAnswerCard key={answer.id} answer={answer} />
        ))}
      </div>
    </div>
  )
}

function getOverlayThemeClass(theme: OverlayTheme): string {
  switch (theme) {
    case 'header':
      return 'text-white'
    case 'chip':
      return 'text-white'
    case 'number':
      return 'text-[#123d82]'
    case 'accent':
      return 'text-[#b86f1f]'
    case 'paper':
    default:
      return 'text-[#24364b]'
  }
}

function getOverlayMaskStyle(theme: OverlayTheme): CSSProperties {
  switch (theme) {
    case 'header':
      return {
        backgroundColor: '#173a76',
        borderRadius: '2px',
      }
    case 'chip':
      return {
        backgroundColor: '#345790',
        borderRadius: '999px',
      }
    case 'number':
      return {
        backgroundColor: '#ffffff',
        borderRadius: '8px',
      }
    case 'accent':
      return {
        backgroundColor: '#d8e6f5',
        borderRadius: '2px',
      }
    case 'paper':
    default:
      return {
        backgroundColor: '#ffffff',
        borderRadius: '2px',
      }
  }
}

function PdfOverlayField({
  config,
  draft,
  onChange,
}: {
  config: OverlayFieldConfig
  draft: DrillReportDraft
  onChange: (field: keyof DrillReportDraft, value: string) => void
}) {
  const value = draft[config.field]
  const displayValue = config.displayValue ? config.displayValue(draft) : value
  const style: CSSProperties = {
    position: 'absolute',
    top: `${config.top}%`,
    left: `${config.left}%`,
    width: `${config.width}%`,
    height: `${config.height}%`,
    ...getOverlayMaskStyle(config.theme),
  }

  const textStyle: CSSProperties = {
    fontSize: config.fontSize,
    lineHeight: config.lineHeight,
    fontWeight: config.fontWeight,
    textAlign: config.align,
  }

  const themeClass = getOverlayThemeClass(config.theme)
  const inputClass = [
    'h-full w-full bg-transparent outline-none',
    config.mode === 'textarea' ? 'resize-none' : '',
  ].join(' ')

  const innerSpacing =
    config.theme === 'header'
      ? 'px-1.5 py-0.5'
      : config.theme === 'chip'
        ? 'px-1.5 py-0'
        : config.theme === 'number'
          ? 'px-1 py-0'
          : config.mode === 'textarea'
            ? 'px-1.5 py-0.5'
            : 'px-1 py-0'

  const frameClass = [
    themeClass,
    'overflow-hidden transition-shadow',
    'focus-within:shadow-[0_0_0_1px_rgba(74,134,217,0.65)]',
  ].join(' ')

  if (config.displayValue) {
    return (
      <div className={frameClass} style={style}>
        <input
          value={displayValue}
          onChange={(event) => onChange(config.field, event.target.value)}
          placeholder=""
          className={`${inputClass} ${innerSpacing}`}
          style={textStyle}
        />
      </div>
    )
  }

  return (
    <div className={frameClass} style={style}>
      {config.mode === 'textarea' ? (
        <textarea
          value={value}
          onChange={(event) => onChange(config.field, event.target.value)}
          placeholder=""
          className={`${inputClass} ${innerSpacing}`}
          style={textStyle}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(config.field, event.target.value)}
          placeholder=""
          className={`${inputClass} ${innerSpacing}`}
          style={textStyle}
        />
      )}
    </div>
  )
}

function DrillReportTemplate({
  draft,
  onChange,
  onReset,
}: {
  draft: DrillReportDraft
  onChange: (field: keyof DrillReportDraft, value: string) => void
  onReset: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')
  const reportText = useMemo(() => buildDrillReportCopy(draft), [draft])
  const conclusionOptions = DRILL_ARCHETYPE_OPTIONS

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportText)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = reportText
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopyState('done')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  function handleSelectConclusion(key: DrillArchetypeKey) {
    const option = getArchetypeOption(key)
    onChange('conclusionType', option.key)
    onChange('conclusionLabel', option.label)
    onChange('conclusionBody', option.body)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f2f4f7]">
      <div className="border-b border-[var(--color-border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">刷题报告前三页</div>
            <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              第一页已按技术对接表挖出可编辑字段，第 2、3 页先保持 PDF 原稿预览。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              恢复系统草稿
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--color-primary-dark)]"
            >
              复制报告文本
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="mx-auto grid max-w-[1760px] gap-6 xl:grid-cols-[minmax(880px,1fr)_380px]">
          <div className="min-w-0">
            <div className="rounded-[32px] border border-[#dde3ea] bg-[#e9edf3] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div className="mb-4 flex items-center justify-between gap-3 px-1">
                <div className="text-xs font-semibold tracking-[0.16em] text-[#6b7280]">PDF PREVIEW</div>
                <div className="text-xs text-[#7b8591]">第一页支持挖空编辑，后三页连续展示</div>
              </div>
              <div className="overflow-auto rounded-[24px] bg-[#dfe5ec] p-5">
                <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
                  {PDF_PAGES.map((pageItem) => (
                    <div
                      key={pageItem.page}
                      className="relative aspect-[210/297] overflow-hidden rounded-[8px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                    >
                      <img
                        src={pageItem.image}
                        alt={`刷题报告 PDF 第 ${pageItem.page} 页模板`}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />

                      {pageItem.page === 1 ? (
                        <>
                          {PAGE_ONE_OVERLAY_FIELDS.map((field) => (
                            <PdfOverlayField
                              key={field.id}
                              config={field}
                              draft={draft}
                              onChange={onChange}
                            />
                          ))}

                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 xl:sticky xl:top-5 xl:h-fit">
            <div className="space-y-5">
              <SectionCard
                title="第一页字段调整"
                desc="这批字段来自你技术对接表里的“刷题报告第一页”。现在既可以在右侧维护，也可以直接在 PDF 上改。"
                action={(
                  <span
                    className={[
                      'rounded-full px-3 py-1 text-[11px] font-semibold',
                      copyState === 'done'
                        ? 'bg-green-50 text-green-600'
                        : copyState === 'error'
                          ? 'bg-red-50 text-red-500'
                          : 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
                    ].join(' ')}
                  >
                    {copyState === 'done' ? '已复制' : copyState === 'error' ? '复制失败' : '复制第一页文案'}
                  </span>
                )}
              >
                <div className="space-y-5">
                  <div className="grid gap-4">
                    <TemplateInput label="标题" value={draft.reportTitle} onChange={(value) => onChange('reportTitle', value)} placeholder="例如：申论4月刷题报告" />
                    <TemplateInput label="学员姓名" value={draft.studentName} onChange={(value) => onChange('studentName', value)} placeholder="填写学员姓名" />
                    <TemplateInput label="目标考试" value={draft.targetExam} onChange={(value) => onChange('targetExam', value)} placeholder="例如：浙江省考、国考" />
                    <TemplateInput label="目标分数" value={draft.targetScore} onChange={(value) => onChange('targetScore', value)} placeholder="例如：70" />
                    <TemplateInput label="报告时间" value={draft.reportDate} onChange={(value) => onChange('reportDate', value)} placeholder="例如：2026/04/08" />
                  </div>

                  <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-page-bg)] p-4">
                    <div className="text-xs font-semibold tracking-[0.12em] text-[var(--color-text-muted)]">报告结论分型</div>
                    <div className="mt-4 space-y-3">
                      {conclusionOptions.map((option) => {
                        const active = option.key === draft.conclusionType
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => handleSelectConclusion(option.key)}
                            className={[
                              'w-full rounded-2xl border px-4 py-3 text-left transition-all',
                              active ? 'border-[var(--color-primary)] bg-white shadow-[var(--shadow-xs)]' : 'border-[var(--color-border)] bg-white/80 hover:border-[var(--color-primary)]/40',
                            ].join(' ')}
                          >
                            <div className="text-sm font-semibold text-[var(--color-text-primary)]">{option.label}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <TemplateInput label="分型名称" value={draft.conclusionLabel} onChange={(value) => onChange('conclusionLabel', value)} placeholder="例如：直觉型选手" />
                  <TemplateTextarea label="评价文案" value={draft.conclusionBody} onChange={(value) => onChange('conclusionBody', value)} placeholder="填写报告结论文案" minHeight={220} />

                  <div className="grid gap-4 md:grid-cols-2">
                    <TemplateInput label="超过学员比例" value={draft.surpassPercent} onChange={(value) => onChange('surpassPercent', value)} placeholder="例如：20" />
                    <TemplateInput label="你的得分" value={draft.currentScore} onChange={(value) => onChange('currentScore', value)} placeholder="例如：57-61" />
                    <TemplateInput label="待解决失分点" value={draft.unresolvedLossCount} onChange={(value) => onChange('unresolvedLossCount', value)} placeholder="例如：19" />
                    <TemplateInput label="待攻关卡点" value={draft.pendingCheckpointCount} onChange={(value) => onChange('pendingCheckpointCount', value)} placeholder="例如：5" />
                    <TemplateInput label="优先突破" value={draft.primaryBreakthrough} onChange={(value) => onChange('primaryBreakthrough', value)} placeholder="例如：要点不全不准、总结转述困难" />
                    <TemplateInput label="其次突破" value={draft.secondaryBreakthrough} onChange={(value) => onChange('secondaryBreakthrough', value)} placeholder="例如：分析结构不清、作文立意不准、作文逻辑不清" />
                  </div>
                </div>
              </SectionCard>

              <div className="rounded-[28px] bg-[#1f2937] px-5 py-5 text-xs leading-6 text-slate-100 shadow-[0_10px_24px_rgba(17,24,39,0.24)]">
                <div className="mb-3 text-sm font-semibold text-white">第一页文案复制预览</div>
                <pre className="whitespace-pre-wrap">{reportText}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlaceholderTemplate({
  category,
}: {
  category: ReportCategory
}) {
  return (
    <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-8 text-center">
      <div className="max-w-xl rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-left)] px-6 py-10">
        <div className="text-base font-semibold text-[var(--color-text-primary)]">
          {getReportCategoryLabel(category)}模板待细化
        </div>
        <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          当前先把刷题报告做成 PDF 预览模式，其他报告类型后续再接。
        </div>
      </div>
    </div>
  )
}

export function ReportUploadWorkspace() {
  const item = useWorkbenchStore((state) => state.reportUploadItem)
  const close = useWorkbenchStore((state) => state.closeReportUpload)
  const loadStudentInfo = useWorkbenchStore((state) => state.loadStudentInfo)
  const students = useWorkbenchStore((state) => state.students)
  const studentAnswersMap = useWorkbenchStore((state) => state.studentAnswersMap)

  const [loading, setLoading] = useState(false)
  const [leftPaneWidth, setLeftPaneWidth] = useState(460)
  const [drillDraft, setDrillDraft] = useState<DrillReportDraft>(() =>
    buildEditableShellDraft(buildDrillReportDraft('学员', buildDrillMetrics([]), '')),
  )
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const leftPaneWidthRef = useRef(460)
  const draftSaveTimerRef = useRef<number | null>(null)

  const studentId = item?.studentId || ''
  const pointName = item?.pointName || ''
  const category = (item?.reportCategory || 'checkpoint') as ReportCategory
  const student = useMemo(
    () => students.find((entry) => entry.id === studentId) || null,
    [studentId, students],
  )
  const answers = useMemo(() => {
    if (!studentId) return EMPTY_ANSWERS
    return studentAnswersMap[studentId] ?? EMPTY_ANSWERS
  }, [studentAnswersMap, studentId])
  const drillAnswers = useMemo(
    () => sortAnswersByRecent(answers.filter((answer) => answer.stageKey === 'drill' && isCurrentNaturalMonth(answer.submittedAt))),
    [answers],
  )
  const drillMetrics = useMemo(() => buildDrillMetrics(drillAnswers), [drillAnswers])
  const generatedDrillDraft = useMemo(
    () => buildEditableShellDraft(buildDrillReportDraft(student?.name || item?.name || '学员', drillMetrics, pointName)),
    [drillMetrics, item?.name, pointName, student?.name],
  )
  const draftStorageKey = useMemo(
    () => buildDrillDraftStorageKey(studentId, item?.taskId || '', pointName),
    [item?.taskId, pointName, studentId],
  )

  useEffect(() => {
    leftPaneWidthRef.current = leftPaneWidth
  }, [leftPaneWidth])

  useEffect(() => {
    if (!studentId) return

    let cancelled = false

    async function loadData() {
      setLoading(true)
      try {
        await loadStudentInfo(studentId)
      } catch (errorObject) {
        if (!cancelled) {
          toast.error(errorObject instanceof Error ? errorObject.message : '加载学员学习数据失败')
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
  }, [loadStudentInfo, studentId])

  useEffect(() => {
    if (!item || category !== 'drill') return

    let nextDraft = generatedDrillDraft

    try {
      const stored = window.localStorage.getItem(draftStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DrillReportDraft>
        nextDraft = {
          ...generatedDrillDraft,
          ...parsed,
        }
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey)
    }

    setDrillDraft((current) => (areDrillDraftsEqual(current, nextDraft) ? current : nextDraft))
  }, [category, draftStorageKey, generatedDrillDraft, item])

  useEffect(() => {
    if (!item || category !== 'drill') return
    // 草稿每次击键都会变化，本地写入做 400ms 防抖；卸载或再次调度时清掉旧定时器
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current)
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null
      window.localStorage.setItem(draftStorageKey, JSON.stringify(drillDraft))
    }, 400)

    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current)
        draftSaveTimerRef.current = null
      }
    }
  }, [category, draftStorageKey, drillDraft, item])

  if (!item) return null

  function handleStartResize(startX: number) {
    const containerWidth = layoutRef.current?.offsetWidth || 0
    if (!containerWidth) return

    const startWidth = leftPaneWidthRef.current
    const minWidth = 360
    const maxWidth = Math.max(minWidth, containerWidth - 420)

    const handleMove = (event: MouseEvent) => {
      const delta = event.clientX - startX
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta))
      leftPaneWidthRef.current = nextWidth
      setLeftPaneWidth(nextWidth)
    }

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function updateDrillDraft(field: keyof DrillReportDraft, value: string) {
    setDrillDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function resetDrillDraft() {
    setDrillDraft(generatedDrillDraft)
    window.localStorage.removeItem(draftStorageKey)
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#eef1f5]">
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--color-border)] bg-white px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                返回
              </button>
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: item.color }}
              >
                {item.avatar}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-base font-semibold text-[var(--color-text-primary)]">
                    {student?.name || item.name}
                  </div>
                  <span className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)]">
                    {getReportCategoryLabel(category)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {student?.grade || ''}{student?.grade && student?.subject ? ' · ' : ''}{student?.subject || ''}
                  {pointName ? `${student?.grade || student?.subject ? ' · ' : ''}${pointName}` : ''}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {item.taskId ? <MetaPill label="任务" value={item.taskId} /> : null}
              {item.stageKey ? <MetaPill label="阶段" value={item.stageKey} /> : null}
              <MetaPill label="数据范围" value={category === 'drill' ? '当前自然月刷题记录' : '当前学员报告任务'} />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <div ref={layoutRef} className="flex h-full min-h-0 items-stretch">
            <section
              className="min-h-0 shrink-0 overflow-hidden bg-[var(--color-bg-left)] px-4 py-4"
              style={{ width: `${leftPaneWidth}px` }}
            >
              <div className="mb-4">
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">学员学习数据</div>
              </div>
              <div className="h-[calc(100%-3.5rem)] min-h-0">
                <LeftDataPanel category={category} answers={answers} loading={loading} />
              </div>
            </section>

            <div className="bg-[#eef1f5] px-1">
              <SplitResizeHandle onDragStart={handleStartResize} />
            </div>

            <section className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white">
              {category === 'drill' ? (
                <DrillReportTemplate
                  draft={drillDraft}
                  onChange={updateDrillDraft}
                  onReset={resetDrillDraft}
                />
              ) : (
                <PlaceholderTemplate category={category} />
              )}
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
