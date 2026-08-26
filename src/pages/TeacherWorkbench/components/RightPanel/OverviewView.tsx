import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppStatusTag } from '../../../../components/ui/AppStatusTag'
import { toDate } from '../../../../lib/datetime'
import { useWorkbenchStore } from '../../store/workbenchStore'

type RiskLevel = 'high' | 'medium' | 'low'

type DerivedStudent = {
  id: string
  name: string
  grade: string
  subject: string
  status: string
  avgProgress: number
  totalHours: number
  pendingReviews: number
  nextClassLabel: string
  lastSession: string
  riskLevel: RiskLevel
  riskReason: string
}

const riskMeta: Record<RiskLevel, { label: string; text: string; bg: string; border: string }> = {
  high: { label: '高风险', text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  medium: { label: '需关注', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  low: { label: '稳定', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
}

function parseDateTime(value: string): Date | null {
  // 统一走 lib/datetime（非法值/'暂无' 等哨兵串返回 null）
  return toDate(value)
}

function formatDateLabel(value: string): string {
  const date = parseDateTime(value)
  if (!date) return '暂无'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return date.getHours() === 0 && date.getMinutes() === 0
    ? `${month}-${day}`
    : `${month}-${day} ${hour}:${minute}`
}

function formatEventLabel(date: string, startTime: string, endTime: string): string {
  const safeDate = formatDateLabel(date)
  if (!startTime) return safeDate
  return `${safeDate} ${startTime}${endTime ? ` - ${endTime}` : ''}`
}

function formatHours(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}h`
}

function SummaryCard({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4">
      <div className="text-[11px] text-[var(--color-text-muted)]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</div>
      <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">{hint}</div>
    </div>
  )
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-white px-4 py-8 text-center text-[12px] text-[var(--color-text-muted)]">
      {text}
    </div>
  )
}

export function OverviewView() {
  const students = useWorkbenchStore((state) => state.students)
  const abnormalStudents = useWorkbenchStore((state) => state.abnormalStudents)
  const taskCounts = useWorkbenchStore((state) => state.taskCounts)
  const calendarEvents = useWorkbenchStore((state) => state.calendarEvents)
  const studentDetailMetaMap = useWorkbenchStore((state) => state.studentDetailMetaMap)
  const studentAnswersMap = useWorkbenchStore((state) => state.studentAnswersMap)
  const loadTaskCounts = useWorkbenchStore((state) => state.loadTaskCounts)
  const loadStudents = useWorkbenchStore((state) => state.loadStudents)
  const loadAbnormalStudents = useWorkbenchStore((state) => state.loadAbnormalStudents)
  const loadCalendarEvents = useWorkbenchStore((state) => state.loadCalendarEvents)
  const loadStudentInfo = useWorkbenchStore((state) => state.loadStudentInfo)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // “即将开始”的判断基准：仅在挂载时通过 useState 初始化器捕获一次，避免 render 期间调用 Date.now()
  const [nowTs] = useState(() => Date.now())

  // 概览四类数据由根组件 TeacherWorkbench 统一轮询（挂载即加载 + 每 30s 刷新），
  // 这里不再重复拉取，仅在用户点击“刷新/重新加载”时手动拉一次
  const handleRefresh = useCallback(() => {
    setLoading(true)
    setError('')

    void Promise.all([
      loadTaskCounts(),
      loadStudents(),
      loadAbnormalStudents(),
      loadCalendarEvents(),
    ])
      .catch(() => {
        setError('概览数据加载失败，请重试')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [loadAbnormalStudents, loadCalendarEvents, loadStudents, loadTaskCounts])

  const studentIdsKey = useMemo(() => students.map((student) => student.id).join('|'), [students])

  useEffect(() => {
    // students 数组每次轮询都会被替换，不能作为依赖：仅当学员名单真正变化时才补拉详情
    if (!studentIdsKey) return
    void Promise.all(studentIdsKey.split('|').map(async (studentId) => {
      try {
        await loadStudentInfo(studentId)
      } catch {
        return null
      }
      return null
    }))
  }, [loadStudentInfo, studentIdsKey])

  const abnormalReasonMap = useMemo(
    () => abnormalStudents.reduce<Record<string, string>>((acc, student) => {
      acc[student.id] = student.reason
      return acc
    }, {}),
    [abnormalStudents],
  )

  const derivedStudents = useMemo<DerivedStudent[]>(() => {
    return students.map((student) => {
      const detailMeta = studentDetailMetaMap[student.id]
      const answers = studentAnswersMap[student.id] ?? []
      const courses = detailMeta?.courses ?? []
      const avgProgress = courses.length > 0
        ? Math.round(courses.reduce((sum, course) => sum + course.progress, 0) / courses.length)
        : 0
      const pendingReviews = answers.filter((answer) => answer.status === 'pending').length
      const nextEvent = calendarEvents
        // 只按 studentId 归属筛选；按标题包含学生姓名做启发式匹配会误伤同名学员
        .filter((event) => event.studentId === student.id)
        .filter((event) => {
          const start = parseDateTime(`${event.date}T${event.startTime || '00:00'}:00`)
          return start ? start.getTime() >= nowTs : false
        })
        .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`))[0]

      let riskLevel: RiskLevel = 'low'
      let riskReason = '当前学习节奏稳定'

      if (abnormalReasonMap[student.id]) {
        riskLevel = 'high'
        riskReason = abnormalReasonMap[student.id]
      } else if (pendingReviews > 0) {
        riskLevel = 'medium'
        riskReason = `还有 ${pendingReviews} 份作业待处理`
      } else if (student.status === 'new') {
        riskLevel = 'medium'
        riskReason = '新学员，建议优先完成入班跟进'
      } else if (avgProgress > 0 && avgProgress < 35) {
        riskLevel = 'medium'
        riskReason = '课程进度偏低，建议补强推进'
      }

      return {
        id: student.id,
        name: student.name,
        grade: student.grade || '未填写',
        subject: student.subject || '未分科',
        status: student.status,
        avgProgress,
        totalHours: Number(detailMeta?.totalHours ?? 0),
        pendingReviews,
        nextClassLabel: nextEvent ? formatEventLabel(nextEvent.date, nextEvent.startTime, nextEvent.endTime) : '暂无',
        lastSession: student.lastSession || '暂无',
        riskLevel,
        riskReason,
      }
    })
  }, [abnormalReasonMap, calendarEvents, nowTs, studentAnswersMap, studentDetailMetaMap, students])

  const upcomingEvents = useMemo(() => {
    return calendarEvents
      .filter((event) => {
        const start = parseDateTime(`${event.date}T${event.startTime || '00:00'}:00`)
        return start ? start.getTime() >= nowTs : false
      })
      .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`))
      .slice(0, 6)
  }, [calendarEvents, nowTs])

  const subjectStats = useMemo(() => {
    const grouped = derivedStudents.reduce<Record<string, { subject: string; total: number; flagged: number; avgProgress: number }>>((acc, student) => {
      const key = student.subject || '未分科'
      if (!acc[key]) {
        acc[key] = { subject: key, total: 0, flagged: 0, avgProgress: 0 }
      }
      acc[key].total += 1
      acc[key].avgProgress += student.avgProgress
      if (student.riskLevel === 'high') {
        acc[key].flagged += 1
      }
      return acc
    }, {})

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        avgProgress: item.total > 0 ? Math.round(item.avgProgress / item.total) : 0,
      }))
      .sort((left, right) => right.total - left.total)
  }, [derivedStudents])

  const focusStudents = useMemo(() => {
    return [...derivedStudents]
      .filter((student) => student.riskLevel !== 'low')
      .sort((left, right) => {
        const levelWeight = { high: 3, medium: 2, low: 1 }
        return levelWeight[right.riskLevel] - levelWeight[left.riskLevel] || right.pendingReviews - left.pendingReviews
      })
      .slice(0, 6)
  }, [derivedStudents])

  if (loading && students.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <EmptyBlock text="正在加载概览数据..." />
      </div>
    )
  }

  if (error && students.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="space-y-3 text-center">
          <EmptyBlock text={error} />
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto px-5 py-5">
      <div className="space-y-5 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">工作台概览</div>
            <div className="mt-1 text-[12px] text-[var(--color-text-muted)]">概览信息全部来自真实接口</div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]"
          >
            刷新
          </button>
        </div>

        <div className="grid grid-cols-6 gap-3">
          <SummaryCard title="学员总数" value={students.length} hint="当前带教名下学员" />
          <SummaryCard title="待批改" value={taskCounts.pendingReview} hint="来自真实提交记录" />
          <SummaryCard title="待分配" value={taskCounts.pendingAssign} hint="来自分配任务接口" />
          <SummaryCard title="待上传报告" value={taskCounts.pendingReport} hint="来自学习路径报告节点" />
          <SummaryCard title="异常学员" value={abnormalStudents.length} hint="来自异常学员接口" />
          <SummaryCard title="近期开课" value={upcomingEvents.length} hint="未来课程排期" />
        </div>

        <div className="grid grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">重点跟进学员</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">按风险与待批改优先级排序</div>
            </div>
            {focusStudents.length === 0 ? (
              <EmptyBlock text="当前没有需要重点跟进的学员" />
            ) : (
              <div className="space-y-2.5">
                {focusStudents.map((student) => {
                  const meta = riskMeta[student.riskLevel]
                  return (
                    <div key={student.id} className="rounded-xl border border-[var(--color-border)] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{student.name}</span>
                            <span className={[meta.bg, meta.text, meta.border, 'rounded-full border px-2 py-0.5 text-[10px] font-medium'].join(' ')}>
                              {meta.label}
                            </span>
                            <AppStatusTag status={student.status} />
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                            {student.grade} · {student.subject} · 下节课 {student.nextClassLabel}
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-[var(--color-text-muted)]">
                          <div>进度 {student.avgProgress}%</div>
                          <div className="mt-1">待批改 {student.pendingReviews}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{student.riskReason}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">最近课程排期</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">按时间正序</div>
            </div>
            {upcomingEvents.length === 0 ? (
              <EmptyBlock text="最近没有待上的课程" />
            ) : (
              <div className="space-y-2.5">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border border-[var(--color-border)] px-3 py-3">
                    <div className="text-sm font-medium text-[var(--color-text-primary)]">{event.title}</div>
                    <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      {formatEventLabel(event.date, event.startTime, event.endTime)}
                    </div>
                    <div className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
                      {event.link ? '已上传链接' : '链接待上传'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">学科进度分布</div>
            <div className="text-[11px] text-[var(--color-text-muted)]">按已加载学员详情实时汇总</div>
          </div>
          {subjectStats.length === 0 ? (
            <EmptyBlock text="暂无学科数据" />
          ) : (
            <div className="space-y-3">
              {subjectStats.map((item) => (
                <div key={item.subject} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-sm text-[var(--color-text-primary)]">{item.subject}</div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-left)]">
                    <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${item.avgProgress}%` }} />
                  </div>
                  <div className="w-24 shrink-0 text-right text-[11px] text-[var(--color-text-muted)]">
                    {item.total} 人 · 平均 {item.avgProgress}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">学员快照</div>
            <div className="text-[11px] text-[var(--color-text-muted)]">课程进度、学时和风险一屏查看</div>
          </div>
          {derivedStudents.length === 0 ? (
            <EmptyBlock text="暂无学员数据" />
          ) : (
            <div className="space-y-2.5">
              {derivedStudents.map((student) => {
                const meta = riskMeta[student.riskLevel]
                return (
                  <div key={student.id} className="grid grid-cols-[1.3fr_0.8fr_0.8fr_0.9fr_1.3fr] items-center gap-3 rounded-xl border border-[var(--color-border)] px-3 py-3 text-[12px]">
                    <div>
                      <div className="font-medium text-[var(--color-text-primary)]">{student.name}</div>
                      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{student.grade} · {student.subject}</div>
                    </div>
                    <div className="text-[var(--color-text-secondary)]">
                      <div>进度 {student.avgProgress}%</div>
                      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">学时 {formatHours(student.totalHours)}</div>
                    </div>
                    <div className="text-[var(--color-text-secondary)]">
                      <div>待批改 {student.pendingReviews}</div>
                      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">上次课 {student.lastSession}</div>
                    </div>
                    <div>
                      <span className={[meta.bg, meta.text, meta.border, 'rounded-full border px-2.5 py-1 text-[11px] font-medium'].join(' ')}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-[var(--color-text-muted)]">
                      <div>下节课</div>
                      <div className="mt-1 text-[var(--color-text-secondary)]">{student.nextClassLabel}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
