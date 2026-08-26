import { useEffect, useMemo, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { fetchStudentLearningPath, updateStudentLearningPathTask, uploadPdf, type LearningPathPayload } from '../../api/learningPath'
import type { QuestionAnswer, StudentDetailMeta, StudentItem, TaskListItem } from '../../types'

type ReportStatus = 'passed' | 'failed'

type SuggestionOption = {
  key: string
  title: string
  body: string
}

type TimelineEntry = {
  label: string
  sublabel: string
  value: number
  type: 'diagnose' | 'practice' | 'exam' | 'remedial'
}

type Draft = {
  reportTitle: string
  studentName: string
  pointName: string
  targetExam: string
  reportDate: string
  scoreLabel: string
  scorePercent: string
  passLinePercent: string
  resultStatus: ReportStatus
  page3Status: ReportStatus
  conclusion: string
  growthNote: string
  remainingCheckpointsText: string
  recommendedCheckpoint: string
  recommendedReason: string
  failedPlanText: string
  selectedSuggestionKeys: string[]
  customSuggestionTitle: string
  customSuggestionBody: string
}

const PAGE_WIDTH = 1240
const PAGE_HEIGHT = 1754
const DRAFT_STORAGE_PREFIX = 'teacher_workbench_checkpoint_report_draft'
const COMMON_METHOD_TITLE = '完善做题思路方法'
const COMMON_METHOD_BODY = '一写、二听、三补。一写：先做题写出答案。二听：听老师讲解，记录老师的做题思路。三补：找到思路方法和老师讲解有哪些对应不上，把欠缺的部分补充进自己的思路里。'
const WEEKLY_PLAN_TEXT = '每周完成对应刷题任务，提交刷题作业，根据指导完成刷题复盘，听直播刷题讲解，不断巩固本次卡点的基础，持续到考前。'
const LEARNING_PATH_TEXT = '预约老师共识课，由老师指导怎么去学习；然后按老师要求学习理论知识，由老师把关纠偏，建立此卡点准确全面的理论知识体系，补充到原有做题思路；接着按老师指导进行运用训练，最后进行考试检验，由老师把关是否通过。'

const PASS_LINE_MAP: Record<string, number> = {
  要点不全不准: 80,
  提炼转述困难: 75,
  对策推导困难: 80,
  分析结构不清: 75,
  公文结构不清: 80,
  作文立意不准: 80,
  作文论证不清: 80,
  作文表达不畅: 80,
}

const STANDARD_TEXT_MAP: Record<string, string> = {
  要点不全不准: '建立稳定的找点意识和路径。',
  提炼转述困难: '建立间接概括的方法，理解特殊作答要素如何答。',
  对策推导困难: '能够分析推导对策，确保针对性、可操作性。',
  分析结构不清: '能够明确综合分析每个部分怎么答。',
  公文结构不清: '能够通过发文目的明确格式和内容。',
  作文立意不准: '达到作文立意二类中上，确保不跑题偏题。',
  作文论证不清: '达到作文论证二类中上，逻辑清晰、充分有效。',
  作文表达不畅: '达到能使用书面用语，语句之间衔接顺畅。',
}

const RECOMMEND_REASON_MAP: Record<string, string> = {
  要点不全不准: '这样可以进一步稳住找点和分类能力，减少面对复杂材料时漏点、误判重点的情况。',
  提炼转述困难: '这样可以帮助你在材料信息零散、口语化时更准确提炼重点，避免总结写不出或写不准。',
  对策推导困难: '这样可以帮助你在面对问题类问法时更快推出针对性、可执行的对策。',
  分析结构不清: '这样可以帮助你在综合分析题中更清楚地搭建结构，避免作答层次混乱。',
  公文结构不清: '这样可以帮助你更快判断格式、内容和语言要求，提升公文题稳定性。',
  作文立意不准: '这样可以帮助你更稳地识别主题词和关键词，避免作文跑题偏题。',
  作文论证不清: '这样可以帮助你把论证结构搭稳，做到观点、论据和论证过程真正闭环。',
  作文表达不畅: '这样可以帮助你提升书面表达和衔接能力，让作文内容更顺、更有完成度。',
}

const SUGGESTION_OPTIONS: Record<string, SuggestionOption[]> = {
  要点不全不准: [
    { key: 'finding', title: '找点能力锻炼', body: '每次做题复盘时可再次对材料进行深度分析，思考题目换个问法找点会有什么区别，持续加强找点能力。' },
    { key: 'selection', title: '取舍能力锻炼', body: '每次做题复盘时可再次对材料进行层级划分，明确重点信息，加强划分层级能力。' },
    { key: 'classification', title: '分类能力锻炼', body: '每次做题复盘后可尝试用 3 种不同标准重新分类，再对照参考答案，分析哪种分类最符合材料逻辑。' },
  ],
  提炼转述困难: [
    { key: 'phrasing', title: '规范词积累', body: '做题后复盘，积累好的规范表达，并按常考主题分类整理，进行二次复习。' },
    { key: 'summary', title: '总结能力锻炼', body: '每读完一个自然段，强制自己用 10-15 个字概括段落大意，把长段转述为“主体+行为+结果”的短句。' },
  ],
  对策推导困难: [
    { key: 'solution-bank', title: '对策积累', body: '每次做完题目复盘时，可积累材料中好的对策做法，不断从真实案例中积累可迁移的解决办法。' },
    { key: 'solution-reasoning', title: '对策推导锻炼', body: '每次做题复盘时都尝试先自行推导对策，再检查自己的对策是否符合实际、是否具有可行性。' },
  ],
  分析结构不清: [
    { key: 'analysis', title: '分析能力锻炼', body: '每次做题复盘后可尝试找一句话或一个词，按题干问法问自己，再按所学知识列出大致内容，提高综合分析能力。' },
  ],
  公文结构不清: [
    { key: 'format', title: '格式积累', body: '对常见公文格式进行记忆并定期回顾，如一个月回顾一次。' },
    { key: 'opening', title: '常见惯用语积累', body: '对一些公文文种回答的常见开头、结尾惯用语进行记忆并定期回顾。' },
    { key: 'language', title: '公文语言要求锻炼', body: '每次公文题复盘时都考虑如果出现语言要求该怎么写，再尝试写一段并检查是否准确表达材料原意。' },
  ],
  作文立意不准: [
    { key: 'keyword', title: '识别主题词、关键词能力锻炼', body: '对于作文题目，重点比对自己每次找的主题词是否正确；对于材料，也可尝试提炼关键词和围绕主题。' },
    { key: 'subpoints', title: '分论点书写能力锻炼', body: '复盘时按提炼出的主题词和关键词进行组合，多写几组分论点，再结合参考答案做对比。' },
  ],
  作文论证不清: [
    { key: 'materials', title: '素材积累', body: '每次做完题目复盘时积累材料中的案例素材，思考可在什么话题下使用。' },
    { key: 'argument', title: '论证书写锻炼', body: '定期写一段并逐字逐句复盘，再结合素材积累思考哪些素材能真正用上。' },
  ],
  作文表达不畅: [
    { key: 'expression', title: '论证书写锻炼', body: '定期写一段、保持书写，再逐句修改表达问题，不断提升书面语言的顺畅度。' },
  ],
}

function formatDateOnly(value?: string | null): string {
  if (!value) return new Date().toLocaleDateString('zh-CN')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('zh-CN')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizePercent(value: string): number {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''))
  if (Number.isNaN(parsed)) return 0
  return clamp(parsed, 0, 100)
}

function parseNumberOr(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildStorageKey(studentId: string, taskId: string, pointName: string): string {
  return [DRAFT_STORAGE_PREFIX, studentId || 'unknown', taskId || 'report', pointName || 'checkpoint'].join('__')
}

function getPassLine(pointName: string): number {
  return PASS_LINE_MAP[pointName] ?? 80
}

function getStandardText(pointName: string): string {
  return STANDARD_TEXT_MAP[pointName] ?? '达到该卡点的阶段性通过标准。'
}

function getSuggestionOptions(pointName: string): SuggestionOption[] {
  return SUGGESTION_OPTIONS[pointName] ?? []
}

function buildRelevantAnswers(answers: QuestionAnswer[], pointName: string): QuestionAnswer[] {
  return [...answers]
    .filter((answer) => {
      const score = typeof answer.score === 'number'
      const matches = String(answer.pointName || answer.checkpoint || '').trim() === String(pointName || '').trim()
      return score && matches
    })
    .sort((left, right) => String(left.submittedAt || '').localeCompare(String(right.submittedAt || '')))
}

function buildTimelineEntries(answers: QuestionAnswer[], pointName: string): TimelineEntry[] {
  const relevant = buildRelevantAnswers(answers, pointName)
  const diagnosis = relevant.filter((answer) => answer.questionType === '入学诊断')
  const exams = relevant.filter((answer) => answer.questionType === '卡点考试')
  const practices = relevant.filter((answer) => answer.questionType !== '入学诊断' && answer.questionType !== '卡点考试')

  const entries: TimelineEntry[] = []

  diagnosis.slice(0, 1).forEach((answer) => {
    entries.push({
      label: '入学诊断',
      sublabel: formatDateOnly(answer.submittedAt),
      value: clamp(parseNumberOr(answer.score, 0), 0, 100),
      type: 'diagnose',
    })
  })

  practices.forEach((answer, index) => {
    entries.push({
      label: `第${index + 1}题`,
      sublabel: formatDateOnly(answer.submittedAt),
      value: clamp(parseNumberOr(answer.score, 0), 0, 100),
      type: 'practice',
    })
  })

  exams.forEach((answer, index) => {
    entries.push({
      label: index === 0 ? '考试' : '补考',
      sublabel: formatDateOnly(answer.submittedAt),
      value: clamp(parseNumberOr(answer.score, 0), 0, 100),
      type: index === 0 ? 'exam' : 'remedial',
    })
  })

  return entries
}

function buildDefaultConclusion(pointName: string, scorePercent: number, passLine: number, status: ReportStatus): string {
  const stateText = status === 'passed' ? '已完成首轮通关' : '未完成首轮通关'
  const compareText = status === 'passed' ? '超过' : '未达到'
  return `报告结论：你在“${pointName}”这一卡点上${stateText}。通过考试情况分析，你的本轮卡点测验得分率${compareText}通过线，当前得分率为 ${scorePercent.toFixed(1)}%，最低通过线为 ${passLine}% ，说明你${status === 'passed' ? '已经达到' : '还未达到'}“${getStandardText(pointName)}”。`
}

function buildInitialDraft({
  item,
  student,
  studentDetailMeta,
  answers,
}: {
  item: TaskListItem
  student: StudentItem | null
  studentDetailMeta: StudentDetailMeta | null
  answers: QuestionAnswer[]
}): Draft {
  const pointName = String(item.pointName || '').trim() || '卡点'
  const timeline = buildTimelineEntries(answers, pointName)
  const latestScore = timeline[timeline.length - 1]?.value ?? 0
  const resultStatus: ReportStatus = latestScore >= getPassLine(pointName) ? 'passed' : 'failed'
  const remainingCheckpoints = (studentDetailMeta?.checkpoints ?? [])
    .map((entry) => entry.name)
    .filter((name) => name && name !== pointName)
  const recommendedCheckpoint = remainingCheckpoints[0] || ''

  return {
    reportTitle: `${pointName}结课报告`,
    studentName: student?.name || item.name || '学员',
    pointName,
    targetExam: studentDetailMeta?.profile.examStatus || student?.subject || '目标考试待填写',
    reportDate: formatDateOnly(new Date().toISOString()),
    scoreLabel: timeline.some((entry) => entry.type === 'remedial') ? '补考得分率' : '考试得分率',
    scorePercent: latestScore ? String(Number(latestScore.toFixed(1))) : '0',
    passLinePercent: String(getPassLine(pointName)),
    resultStatus,
    page3Status: resultStatus,
    conclusion: buildDefaultConclusion(pointName, latestScore, getPassLine(pointName), resultStatus),
    growthNote: timeline.length ? '' : '对应题目还未完成，快去完成解锁吧。',
    remainingCheckpointsText: remainingCheckpoints.join('、'),
    recommendedCheckpoint,
    recommendedReason: RECOMMEND_REASON_MAP[recommendedCheckpoint] || '建议优先学习这个卡点，进一步补足整卷中影响得分的关键能力。',
    failedPlanText: '在学习其他卡点的同时，结合刷题班，继续练题巩固该卡点，再结合每月该卡点的测试进行检验，由老师持续判断和调整，争取在考前达到目标。',
    selectedSuggestionKeys: getSuggestionOptions(pointName).slice(0, 2).map((entry) => entry.key),
    customSuggestionTitle: '',
    customSuggestionBody: '',
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraphs = String(text || '').split('\n')

  paragraphs.forEach((paragraph) => {
    const chars = [...paragraph]
    let current = ''

    if (!chars.length) {
      lines.push('')
      return
    }

    chars.forEach((char) => {
      const next = current + char
      if (ctx.measureText(next).width > maxWidth && current) {
        lines.push(current)
        current = char
      } else {
        current = next
      }
    })

    if (current) {
      lines.push(current)
    }
  })

  return lines
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawRoundedCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { radius?: number; fill?: string; stroke?: string; lineWidth?: number } = {},
) {
  roundedRect(ctx, x, y, width, height, options.radius ?? 28)
  if (options.fill) {
    ctx.fillStyle = options.fill
    ctx.fill()
  }
  if (options.stroke) {
    ctx.lineWidth = options.lineWidth ?? 2
    ctx.strokeStyle = options.stroke
    ctx.stroke()
  }
}

function drawTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  color: string,
  font: string,
): number {
  ctx.font = font
  ctx.fillStyle = color
  const lines = wrapText(ctx, text, maxWidth)
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
  })
  return y + Math.max(lines.length - 1, 0) * lineHeight
}

function buildPage3SuggestionBlocks(draft: Draft): Array<{ title: string; body: string }> {
  const selectedSet = new Set(draft.selectedSuggestionKeys)
  const options = getSuggestionOptions(draft.pointName).filter((entry) => selectedSet.has(entry.key))
  const blocks = [{ title: COMMON_METHOD_TITLE, body: COMMON_METHOD_BODY }, ...options]

  if (draft.customSuggestionTitle.trim() && draft.customSuggestionBody.trim()) {
    blocks.push({
      title: draft.customSuggestionTitle.trim(),
      body: draft.customSuggestionBody.trim(),
    })
  }

  return blocks
}

function buildPageCanvases(draft: Draft, timeline: TimelineEntry[]): HTMLCanvasElement[] {
  const page1 = document.createElement('canvas')
  const page2 = document.createElement('canvas')
  const page3 = document.createElement('canvas')
  ;[page1, page2, page3].forEach((canvas) => {
    canvas.width = PAGE_WIDTH
    canvas.height = PAGE_HEIGHT
  })

  drawPage1(page1.getContext('2d')!, draft)
  drawPage2(page2.getContext('2d')!, draft, timeline)
  drawPage3(page3.getContext('2d')!, draft)

  return [page1, page2, page3]
}

function drawPageShell(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  gradient.addColorStop(0, '#dce9fb')
  gradient.addColorStop(1, '#eaf7ff')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  drawRoundedCard(ctx, 74, 54, PAGE_WIDTH - 148, PAGE_HEIGHT - 108, {
    radius: 34,
    fill: 'rgba(255,255,255,0.82)',
  })
}

function drawSectionTitle(ctx: CanvasRenderingContext2D, title: string, x: number, y: number) {
  ctx.fillStyle = '#2ab5e5'
  roundedRect(ctx, x, y - 20, 8, 44, 4)
  ctx.fill()
  ctx.fillStyle = '#143e75'
  ctx.font = 'bold 28px "Microsoft YaHei", sans-serif'
  ctx.fillText(title, x + 18, y + 8)
}

function drawPage1(ctx: CanvasRenderingContext2D, draft: Draft) {
  drawPageShell(ctx)
  const status = draft.resultStatus
  const score = normalizePercent(draft.scorePercent)
  const passLine = normalizePercent(draft.passLinePercent)
  const title = `${draft.pointName}结课报告`
  const resultText = status === 'passed' ? '通过' : '未通过'
  const resultSummary = status === 'passed'
    ? `你在“${draft.pointName}”这一卡点上已完成首轮通关。`
    : `你在“${draft.pointName}”这一卡点上尚未完成本轮通关。`

  ctx.fillStyle = '#173f73'
  ctx.font = 'bold 44px "Microsoft YaHei", sans-serif'
  ctx.fillText(title, 134, 170)

  drawRoundedCard(ctx, 134, 220, 560, 420, { radius: 30, fill: '#eef5ff', stroke: '#d4e4fb' })
  drawRoundedCard(ctx, 718, 220, 344, 420, { radius: 30, fill: '#effaff', stroke: '#d4ecf7' })

  ctx.fillStyle = '#6784ad'
  ctx.font = '600 20px "Microsoft YaHei", sans-serif'
  ctx.fillText(draft.scoreLabel, 170, 286)
  ctx.fillStyle = '#2d7be1'
  ctx.font = 'bold 92px "Microsoft YaHei", sans-serif'
  ctx.fillText(`${score.toFixed(score % 1 ? 1 : 0)}%`, 170, 410)
  ctx.fillStyle = '#6387b5'
  ctx.font = '600 20px "Microsoft YaHei", sans-serif'
  drawTextLines(ctx, resultSummary, 170, 572, 470, 30, '#6387b5', '600 20px "Microsoft YaHei", sans-serif')

  const infoItems = [
    ['姓名', draft.studentName],
    ['目标考试', draft.targetExam],
    ['报告时间', draft.reportDate],
    ['测试结果', resultText],
  ]

  infoItems.forEach(([label, value], index) => {
    const top = 286 + index * 116
    ctx.fillStyle = '#6d92b3'
    ctx.font = '600 18px "Microsoft YaHei", sans-serif'
    ctx.fillText(label, 744, top)
    ctx.fillStyle = '#143f74'
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif'
    ctx.fillText(value, 744, top + 56)
    if (index < infoItems.length - 1) {
      ctx.strokeStyle = '#d4e8f5'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(744, top + 84)
      ctx.lineTo(1036, top + 84)
      ctx.stroke()
    }
  })

  drawSectionTitle(ctx, '判定依据如下', 134, 718)
  drawRoundedCard(ctx, 134, 770, 928, 192, { radius: 28, fill: '#ffffff', stroke: '#d6e5fb' })

  ctx.fillStyle = '#143f74'
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif'
  ctx.fillText(`你的得分率为 ${score.toFixed(score % 1 ? 1 : 0)}%`, 160, 828)
  ctx.fillStyle = '#6d92b3'
  ctx.font = '600 18px "Microsoft YaHei", sans-serif'
  ctx.fillText(draft.scoreLabel, 160, 876)
  ctx.fillText(`最低通过线为 ${passLine}%`, 900, 876)

  const trackX = 160
  const trackY = 906
  const trackW = 864
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#d8e8ff'
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(trackX, trackY)
  ctx.lineTo(trackX + trackW, trackY)
  ctx.stroke()

  ctx.strokeStyle = '#2d7be1'
  ctx.beginPath()
  ctx.moveTo(trackX, trackY)
  ctx.lineTo(trackX + (trackW * score) / 100, trackY)
  ctx.stroke()

  ctx.strokeStyle = '#35b7df'
  ctx.lineWidth = 4
  const markerX = trackX + (trackW * passLine) / 100
  ctx.beginPath()
  ctx.moveTo(markerX, trackY - 18)
  ctx.lineTo(markerX, trackY + 18)
  ctx.stroke()

  ctx.fillStyle = '#6d92b3'
  ctx.font = '600 18px "Microsoft YaHei", sans-serif'
  ctx.fillText(status === 'passed' ? '得分率超过通过线' : '得分率未达到通过线', 160, 962 - 24)

  drawRoundedCard(ctx, 134, 994, 928, 210, { radius: 28, fill: '#f6fbff', stroke: '#d6e5fb' })
  drawTextLines(ctx, draft.conclusion, 164, 1056, 860, 42, '#173f73', '600 18px "Microsoft YaHei", sans-serif')
}

function drawPage2(ctx: CanvasRenderingContext2D, draft: Draft, timeline: TimelineEntry[]) {
  drawPageShell(ctx)
  ctx.fillStyle = '#173f73'
  ctx.font = 'bold 44px "Microsoft YaHei", sans-serif'
  ctx.fillText(`${draft.pointName}的成长轨迹`, 134, 170)

  drawRoundedCard(ctx, 134, 236, 928, 1060, { radius: 32, fill: 'rgba(255,255,255,0.72)', stroke: '#d6e5fb' })
  drawRoundedCard(ctx, 212, 348, 760, 690, { radius: 28, fill: '#edf5ff', stroke: '#d6e5fb' })

  const chartLeft = 270
  const chartTop = 428
  const chartWidth = 646
  const chartHeight = 520
  const axisLabels = [0, 25, 50, 75, 100]

  axisLabels.forEach((value) => {
    const y = chartTop + chartHeight - (value / 100) * chartHeight
    ctx.strokeStyle = '#d5e6fb'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(chartLeft, y)
    ctx.lineTo(chartLeft + chartWidth, y)
    ctx.stroke()

    ctx.fillStyle = '#6f8fb7'
    ctx.font = '500 18px "Microsoft YaHei", sans-serif'
    ctx.fillText(`${value}%`, chartLeft - 56, y + 6)
  })

  const entries = timeline.length
    ? timeline
    : [{ label: '待解锁', sublabel: '0%', value: 0, type: 'practice' as const }]

  const gap = entries.length > 1 ? chartWidth / (entries.length - 1) : 0
  const points = entries.map((entry, index) => ({
    x: chartLeft + gap * index,
    y: chartTop + chartHeight - (entry.value / 100) * chartHeight,
    ...entry,
  }))

  if (points.length > 1) {
    const areaGradient = ctx.createLinearGradient(0, chartTop, 0, chartTop + chartHeight)
    areaGradient.addColorStop(0, 'rgba(48,163,237,0.20)')
    areaGradient.addColorStop(1, 'rgba(48,163,237,0.04)')
    ctx.fillStyle = areaGradient
    ctx.beginPath()
    ctx.moveTo(points[0].x, chartTop + chartHeight)
    points.forEach((point) => ctx.lineTo(point.x, point.y))
    ctx.lineTo(points[points.length - 1].x, chartTop + chartHeight)
    ctx.closePath()
    ctx.fill()
  }

  ctx.strokeStyle = '#34b7de'
  ctx.lineWidth = 8
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  ctx.stroke()

  points.forEach((point) => {
    ctx.fillStyle = point.type === 'remedial' ? '#23b9d5' : '#3785e2'
    ctx.beginPath()
    ctx.arc(point.x, point.y, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#173f73'
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif'
    const text = `${Number(point.value.toFixed(1))}%`
    ctx.fillText(text, point.x - ctx.measureText(text).width / 2, point.y - 36)
    ctx.fillStyle = '#56769c'
    ctx.font = '600 18px "Microsoft YaHei", sans-serif'
    ctx.fillText(point.label, point.x - ctx.measureText(point.label).width / 2, 1084)
    ctx.fillStyle = '#86a0bf'
    ctx.font = '500 16px "Microsoft YaHei", sans-serif'
    const sub = point.sublabel
    ctx.fillText(sub, point.x - ctx.measureText(sub).width / 2, 1122)
  })

  if (draft.growthNote.trim()) {
    drawTextLines(ctx, draft.growthNote.trim(), 174, 1228, 820, 36, '#6282a9', '600 18px "Microsoft YaHei", sans-serif')
  }
}

function drawPage3(ctx: CanvasRenderingContext2D, draft: Draft) {
  drawPageShell(ctx)
  const passed = draft.page3Status === 'passed'
  const title = passed
    ? `恭喜你！完美通关本次卡点！\n接下来咱们需要继续保持！`
    : `很可惜，本次卡点未通关。\n咱们还需再接再励！`

  ctx.fillStyle = '#173f73'
  ctx.font = 'bold 42px "Microsoft YaHei", sans-serif'
  title.split('\n').forEach((line, index) => {
    const width = ctx.measureText(line).width
    ctx.fillText(line, PAGE_WIDTH / 2 - width / 2, 160 + index * 58)
  })

  drawSectionTitle(ctx, '下一步学习安排', 134, 286)
  drawRoundedCard(ctx, 134, 338, 928, passed ? 520 : 600, { radius: 30, fill: '#f8fbff', stroke: '#d6e5fb' })

  ctx.fillStyle = '#2d7be1'
  ctx.font = 'bold 24px "Microsoft YaHei", sans-serif'
  ctx.fillText('剩余卡点学习规划', 160, 404)
  const checkpointsText = draft.remainingCheckpointsText.trim() || '暂未填写剩余卡点'
  const recommendText = draft.recommendedCheckpoint.trim() || '待补充'
  const intro = `依据当前学习情况，咱们接下来还需要学习“${checkpointsText}”，提高整卷得分能力，达到申论高分。建议优先学习“${recommendText}”。${draft.recommendedReason.trim() || '这里补充老师建议优先的原因。'}`
  drawTextLines(ctx, intro, 160, 450, 860, 40, '#173f73', '600 18px "Microsoft YaHei", sans-serif')

  ctx.fillStyle = '#2d7be1'
  ctx.font = 'bold 24px "Microsoft YaHei", sans-serif'
  ctx.fillText('卡点具体学习路径', 160, passed ? 610 : 670)
  drawTextLines(ctx, LEARNING_PATH_TEXT, 160, passed ? 654 : 714, 860, 40, '#173f73', '600 18px "Microsoft YaHei", sans-serif')

  ctx.fillStyle = '#2d7be1'
  ctx.font = 'bold 24px "Microsoft YaHei", sans-serif'
  ctx.fillText('紧跟每周刷题班', 160, passed ? 770 : 862)
  drawTextLines(ctx, WEEKLY_PLAN_TEXT, 160, passed ? 814 : 906, 860, 40, '#173f73', '600 18px "Microsoft YaHei", sans-serif')

  if (!passed) {
    ctx.fillStyle = '#2d7be1'
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif'
    ctx.fillText('该卡点后续计划', 160, 574)
    drawTextLines(ctx, draft.failedPlanText.trim() || '这里补充该卡点未通过后的后续学习安排。', 160, 618, 860, 40, '#173f73', '600 18px "Microsoft YaHei", sans-serif')
  }

  const cardTop = passed ? 920 : 1048
  drawSectionTitle(ctx, `${draft.pointName}${passed ? '防复发关注点' : '持续提升关注点'}`, 134, cardTop)
  drawRoundedCard(ctx, 134, cardTop + 52, 928, 430, { radius: 30, fill: '#f8fbff', stroke: '#d6e5fb' })

  const suggestionBlocks = buildPage3SuggestionBlocks(draft)
  let currentY = cardTop + 120
  suggestionBlocks.forEach((block) => {
    ctx.fillStyle = '#2d7be1'
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif'
    ctx.fillText(block.title, 160, currentY)
    currentY += 42
    currentY = drawTextLines(ctx, block.body, 160, currentY, 860, 38, '#173f73', '600 18px "Microsoft YaHei", sans-serif') + 54
  })
}

async function buildPdfFile(reportTitle: string, pages: HTMLCanvasElement[]): Promise<File> {
  const pdf = await PDFDocument.create()

  for (const canvas of pages) {
    const png = await pdf.embedPng(canvas.toDataURL('image/png'))
    const page = pdf.addPage([595.28, 841.89])
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: 595.28,
      height: 841.89,
    })
  }

  const bytes = await pdf.save()
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  return new File([blob], `${reportTitle}.pdf`, { type: 'application/pdf' })
}

function EditorInput({
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

function EditorTextarea({
  label,
  value,
  onChange,
  placeholder,
  minHeight = 120,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  minHeight?: number
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">{label}</div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ minHeight }}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-page-bg)] px-4 py-3 text-sm leading-6 text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)] focus:bg-white"
      />
    </label>
  )
}

function SegmentedSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={[
                'rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CheckpointReportEditor({
  item,
  student,
  studentDetailMeta,
  answers,
  loadTaskCounts,
  loadTaskItems,
}: {
  item: TaskListItem
  student: StudentItem | null
  studentDetailMeta: StudentDetailMeta | null
  answers: QuestionAnswer[]
  loadTaskCounts: () => Promise<void>
  loadTaskItems: () => Promise<void>
}) {
  const studentId = item.studentId || ''
  const pointName = item.pointName || ''
  const taskId = item.taskId || ''
  const storageKey = useMemo(() => buildStorageKey(studentId, taskId, pointName), [pointName, studentId, taskId])

  const baseDraft = useMemo(
    () => buildInitialDraft({ item, student, studentDetailMeta, answers }),
    [answers, item, student, studentDetailMeta],
  )
  const [draft, setDraft] = useState<Draft>(() => baseDraft)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [learningPath, setLearningPath] = useState<LearningPathPayload | null>(null)

  const timeline = useMemo(() => buildTimelineEntries(answers, pointName), [answers, pointName])
  const pageImages = useMemo(() => {
    if (typeof document === 'undefined') return []
    const canvases = buildPageCanvases(draft, timeline)
    return canvases.map((canvas) => canvas.toDataURL('image/png'))
  }, [draft, timeline])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (!stored) {
        setDraft(baseDraft)
        return
      }
      const parsed = JSON.parse(stored) as Partial<Draft>
      setDraft({ ...baseDraft, ...parsed })
    } catch {
      window.localStorage.removeItem(storageKey)
      setDraft(baseDraft)
    }
  }, [baseDraft, storageKey])

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(draft))
  }, [draft, storageKey])

  useEffect(() => {
    if (!studentId || !pointName) return
    let cancelled = false

    void fetchStudentLearningPath(studentId, pointName)
      .then((payload) => {
        if (!cancelled) setLearningPath(payload)
      })
      .catch(() => {
        if (!cancelled) setLearningPath(null)
      })

    return () => {
      cancelled = true
    }
  }, [pointName, studentId])

  const learningPathTask = useMemo(() => {
    if (!learningPath || !taskId) return null
    for (const stage of learningPath.stages || []) {
      for (const group of stage.groups || []) {
        for (const currentItem of group.items || []) {
          if (String(currentItem.id || '') === taskId) {
            return currentItem
          }
        }
      }
    }
    return null
  }, [learningPath, taskId])

  function updateDraft<K extends keyof Draft>(field: K, value: Draft[K]) {
    setSaved(false)
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function toggleSuggestion(key: string) {
    setSaved(false)
    setDraft((current) => ({
      ...current,
      selectedSuggestionKeys: current.selectedSuggestionKeys.includes(key)
        ? current.selectedSuggestionKeys.filter((entry) => entry !== key)
        : [...current.selectedSuggestionKeys, key],
    }))
  }

  function resetDraft() {
    setSaved(false)
    const next = buildInitialDraft({ item, student, studentDetailMeta, answers })
    setDraft(next)
    window.localStorage.removeItem(storageKey)
  }

  async function exportPdf(triggerDownload: boolean) {
    const canvases = buildPageCanvases(draft, timeline)
    const file = await buildPdfFile(draft.reportTitle, canvases)
    if (!triggerDownload) return file

    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return file
  }

  async function handleDownload() {
    setDownloading(true)
    setError('')
    try {
      await exportPdf(true)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '导出 PDF 失败')
    } finally {
      setDownloading(false)
    }
  }

  async function handleSave() {
    if (!studentId || !taskId) {
      setError('当前报告任务缺少 studentId 或 taskId，暂时无法保存。')
      return
    }

    setSaving(true)
    setSaved(false)
    setError('')

    try {
      const file = await exportPdf(false)
      const url = await uploadPdf(file)
      await updateStudentLearningPathTask(studentId, taskId, {
        pointName,
        stageKey: item.stageKey || 'report',
        status: learningPathTask?.status || 'current',
        resource: {
          resourceType: 'pdf',
          title: draft.reportTitle,
          url,
        },
      })
      await Promise.all([loadTaskCounts(), loadTaskItems()])
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存到学习路径失败')
    } finally {
      setSaving(false)
    }
  }

  const suggestionOptions = getSuggestionOptions(draft.pointName)

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f2f5f9]">
      <div className="border-b border-[var(--color-border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">卡点结课报告 PDF</div>
            <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              右侧直接生成三页 PDF。第三页支持老师手动切换“已通过 / 未通过”。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetDraft}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              重置草稿
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
            >
              {downloading ? '导出中...' : '导出 PDF'}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={[
                'rounded-xl px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50',
                saved ? 'bg-green-600' : 'bg-[var(--color-primary)] hover:opacity-90',
              ].join(' ')}
            >
              {saving ? '保存中...' : saved ? '已同步到学习路径' : '保存到学习路径'}
            </button>
          </div>
        </div>
        {error ? <div className="mt-3 text-xs text-red-500">{error}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="mx-auto grid max-w-[1760px] gap-6 xl:grid-cols-[minmax(860px,1fr)_420px]">
          <div className="space-y-6">
            {pageImages.map((image, index) => (
              <div key={`checkpoint-page-${index + 1}`} className="rounded-[28px] border border-[#d8e2ef] bg-[#e8eef6] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                <div className="mb-4 flex items-center justify-between gap-3 px-1">
                  <div className="text-xs font-semibold tracking-[0.16em] text-[#6b7280]">PAGE {index + 1}</div>
                  <div className="text-xs text-[#7b8591]">
                    {index === 0 ? '结果页' : index === 1 ? '成长轨迹页' : '学习安排页'}
                  </div>
                </div>
                <div className="overflow-auto rounded-[24px] bg-[#dfe7f1] p-4">
                  <img
                    src={image}
                    alt={`卡点报告第 ${index + 1} 页`}
                    className="mx-auto w-full max-w-[920px] rounded-[10px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                    draggable={false}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="min-w-0 xl:sticky xl:top-5 xl:h-fit">
            <div className="space-y-5">
              <section className="rounded-[28px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xs)]">
                <div className="text-base font-semibold text-[var(--color-text-primary)]">基础信息</div>
                <div className="mt-5 grid gap-4">
                  <EditorInput label="报告标题" value={draft.reportTitle} onChange={(value) => updateDraft('reportTitle', value)} placeholder="例如：要点不全不准结课报告" />
                  <EditorInput label="卡点名称" value={draft.pointName} onChange={(value) => updateDraft('pointName', value)} placeholder="填写卡点名称" />
                  <EditorInput label="学员姓名" value={draft.studentName} onChange={(value) => updateDraft('studentName', value)} placeholder="填写学员姓名" />
                  <EditorInput label="目标考试" value={draft.targetExam} onChange={(value) => updateDraft('targetExam', value)} placeholder="例如：江苏省考" />
                  <EditorInput label="报告时间" value={draft.reportDate} onChange={(value) => updateDraft('reportDate', value)} placeholder="例如：2026/04/09" />
                </div>
              </section>

              <section className="rounded-[28px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xs)]">
                <div className="text-base font-semibold text-[var(--color-text-primary)]">结果设置</div>
                <div className="mt-5 space-y-4">
                  <SegmentedSwitch
                    label="第一页结果"
                    value={draft.resultStatus}
                    options={[
                      { value: 'passed', label: '已通过' },
                      { value: 'failed', label: '未通过' },
                    ]}
                    onChange={(value) => updateDraft('resultStatus', value)}
                  />
                  <EditorInput label="分数字段标题" value={draft.scoreLabel} onChange={(value) => updateDraft('scoreLabel', value)} placeholder="考试得分率 / 补考得分率" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <EditorInput label="当前得分率" value={draft.scorePercent} onChange={(value) => updateDraft('scorePercent', value)} placeholder="例如：83.3" />
                    <EditorInput label="通过线" value={draft.passLinePercent} onChange={(value) => updateDraft('passLinePercent', value)} placeholder="例如：80" />
                  </div>
                  <EditorTextarea label="第一页报告结论" value={draft.conclusion} onChange={(value) => updateDraft('conclusion', value)} placeholder="填写第一页报告结论" minHeight={160} />
                  <EditorTextarea label="第二页备注" value={draft.growthNote} onChange={(value) => updateDraft('growthNote', value)} placeholder="没有成长轨迹数据时，可填写“对应题目还未完成，快去完成解锁吧”" minHeight={90} />
                </div>
              </section>

              <section className="rounded-[28px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xs)]">
                <div className="text-base font-semibold text-[var(--color-text-primary)]">第三页设置</div>
                <div className="mt-5 space-y-4">
                  <SegmentedSwitch
                    label="第三页版本"
                    value={draft.page3Status}
                    options={[
                      { value: 'passed', label: '已通过' },
                      { value: 'failed', label: '未通过' },
                    ]}
                    onChange={(value) => updateDraft('page3Status', value)}
                  />
                  <EditorTextarea label="剩余卡点" value={draft.remainingCheckpointsText} onChange={(value) => updateDraft('remainingCheckpointsText', value)} placeholder="例如：提炼转述困难、对策推导困难、作文立意不准" minHeight={100} />
                  <EditorInput label="建议优先学习的卡点" value={draft.recommendedCheckpoint} onChange={(value) => updateDraft('recommendedCheckpoint', value)} placeholder="例如：提炼转述困难" />
                  <EditorTextarea label="建议优先原因" value={draft.recommendedReason} onChange={(value) => updateDraft('recommendedReason', value)} placeholder="填写为什么建议这个卡点优先学习" minHeight={120} />
                  {draft.page3Status === 'failed' ? (
                    <EditorTextarea label="未通过后的后续计划" value={draft.failedPlanText} onChange={(value) => updateDraft('failedPlanText', value)} placeholder="填写该卡点未通过后的后续安排" minHeight={140} />
                  ) : null}
                </div>
              </section>

              <section className="rounded-[28px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xs)]">
                <div className="text-base font-semibold text-[var(--color-text-primary)]">学习建议</div>
                <div className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                  默认包含“完善做题思路方法”，下面这些是老师可勾选的卡点专属建议。
                </div>
                <div className="mt-5 space-y-3">
                  {suggestionOptions.length ? suggestionOptions.map((option) => {
                    const active = draft.selectedSuggestionKeys.includes(option.key)
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => toggleSuggestion(option.key)}
                        className={[
                          'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                          active
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                            : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]',
                        ].join(' ')}
                      >
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{option.title}</div>
                        <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{option.body}</div>
                      </button>
                    )
                  }) : (
                    <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
                      当前这个卡点暂未配置勾选项，老师可直接填写自定义建议。
                    </div>
                  )}
                  <EditorInput label="自定义建议标题" value={draft.customSuggestionTitle} onChange={(value) => updateDraft('customSuggestionTitle', value)} placeholder="例如：规范词积累" />
                  <EditorTextarea label="自定义建议内容" value={draft.customSuggestionBody} onChange={(value) => updateDraft('customSuggestionBody', value)} placeholder="补充老师自己的建议文案" minHeight={120} />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
