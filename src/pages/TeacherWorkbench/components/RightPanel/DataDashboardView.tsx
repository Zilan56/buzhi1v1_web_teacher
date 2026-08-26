import { useEffect, useMemo, useState } from 'react'
import { AppButton } from '../../../../components/ui/AppButton'
import { AppCard } from '../../../../components/ui/AppCard'
import { api } from '../../../../lib/api'

interface DashboardStats {
  totalTeachers: number
  totalStudents: number
  registeredStudents: number
  newStudents: number
  normalStudents: number
}

interface TeacherRow {
  id: number
  name: string
  email: string
  title?: string | null
  created_at: string
}

interface StudentRow {
  id: number
  name: string
  phone?: string | null
  account?: string | null
  status: string
  created_at: string
}

interface DashboardSummaryPayload {
  stats: DashboardStats
  recentTeachers: TeacherRow[]
  recentStudents: StudentRow[]
}

const EMPTY_STATS: DashboardStats = {
  totalTeachers: 0,
  totalStudents: 0,
  registeredStudents: 0,
  newStudents: 0,
  normalStudents: 0,
}

function formatTime(value?: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function mapStudentStatus(status?: string | null) {
  switch (status) {
    case 'normal':
      return '正常'
    case 'new':
      return '新注册'
    case 'abnormal':
      return '异常'
    case 'leave':
      return '请假'
    default:
      return status || '未知'
  }
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <AppCard className="space-y-2">
      <div className="text-sm font-semibold text-[var(--color-text-secondary)]">{label}</div>
      <div className="text-3xl font-bold text-[var(--color-text-primary)]">{value}</div>
      <div className="text-xs text-[var(--color-text-muted)]">{hint}</div>
    </AppCard>
  )
}

export function DataDashboardView() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
  const [recentTeachers, setRecentTeachers] = useState<TeacherRow[]>([])
  const [recentStudents, setRecentStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadSummary() {
    setLoading(true)
    setError('')

    try {
      const data = await api.get<DashboardSummaryPayload>('/api/teacher/dashboard-summary')
      setStats(data?.stats ?? EMPTY_STATS)
      setRecentTeachers(Array.isArray(data?.recentTeachers) ? data.recentTeachers : [])
      setRecentStudents(Array.isArray(data?.recentStudents) ? data.recentStudents : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '数据加载失败')
      setStats(EMPTY_STATS)
      setRecentTeachers([])
      setRecentStudents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSummary()
  }, [])

  const statCards = useMemo(() => [
    { label: '老师账号总数', value: stats.totalTeachers, hint: 'teachers 表中的老师账号数量' },
    { label: '学生总数', value: stats.totalStudents, hint: 'students 表中的全部学生记录' },
    { label: '已注册学生', value: stats.registeredStudents, hint: '已有手机号或账号的学生数量' },
    { label: '新注册学生', value: stats.newStudents, hint: '状态为 new 的学生数量' },
    { label: '正常学生', value: stats.normalStudents, hint: '状态为 normal 的学生数量' },
  ], [stats])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-[var(--color-text-primary)]">数据后台</div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            查看老师账号、学生注册数量，以及最近注册的数据记录。
          </div>
        </div>
        <AppButton type="button" variant="secondary" size="md" disabled={loading} onClick={() => void loadSummary()}>
          {loading ? '刷新中…' : '刷新数据'}
        </AppButton>
      </div>

      {error ? (
        <AppCard className="border-red-200 bg-red-50 text-sm text-red-600">
          {error}
        </AppCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
        ))}
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-2">
        <AppCard className="min-h-0 overflow-auto p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">最近注册老师</div>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">按创建时间倒序展示最近 10 条老师账号</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-bg-left)] text-[var(--color-text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">姓名</th>
                  <th className="px-4 py-3 font-medium">邮箱</th>
                  <th className="px-4 py-3 font-medium">头衔</th>
                  <th className="px-4 py-3 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {recentTeachers.length > 0 ? recentTeachers.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--color-border)] text-[var(--color-text-primary)]">
                    <td className="px-4 py-3">{item.name || `老师#${item.id}`}</td>
                    <td className="px-4 py-3">{item.email || '—'}</td>
                    <td className="px-4 py-3">{item.title || '—'}</td>
                    <td className="px-4 py-3">{formatTime(item.created_at)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-muted)]">暂无老师注册记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AppCard>

        <AppCard className="min-h-0 overflow-auto p-0">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">最近注册学生</div>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">按创建时间倒序展示最近 10 条学生记录</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-bg-left)] text-[var(--color-text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">姓名</th>
                  <th className="px-4 py-3 font-medium">手机号</th>
                  <th className="px-4 py-3 font-medium">账号</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {recentStudents.length > 0 ? recentStudents.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--color-border)] text-[var(--color-text-primary)]">
                    <td className="px-4 py-3">{item.name || `学生#${item.id}`}</td>
                    <td className="px-4 py-3">{item.phone || '—'}</td>
                    <td className="px-4 py-3">{item.account || '—'}</td>
                    <td className="px-4 py-3">{mapStudentStatus(item.status)}</td>
                    <td className="px-4 py-3">{formatTime(item.created_at)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">暂无学生注册记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AppCard>
      </div>
    </div>
  )
}
