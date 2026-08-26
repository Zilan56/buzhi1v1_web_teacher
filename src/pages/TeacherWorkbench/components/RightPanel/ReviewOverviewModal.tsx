import { useEffect, useMemo, useState } from 'react'
import {
  saveStudentReviewOverview,
  type ReviewLossPointRate,
  type ReviewOverview,
  type ReviewPointRate,
  type ReviewPointStatus,
  type ReviewPointStatusValue,
} from '../../api/reviewOverview'
import { LOSS_POINT_DEFINITIONS } from '../../config/reviewLossPoints'

const STATUS_OPTIONS: { value: ReviewPointStatusValue; label: string }[] = [
  { value: 'locked', label: '未开始' },
  { value: 'pending', label: '待推进' },
  { value: 'learning', label: '学习中' },
  { value: 'completed', label: '已完成' },
]

interface PointDefinition {
  id: number | null
  name: string
}

interface PointDraft {
  currentRate: string
  targetRate: string
  status: ReviewPointStatusValue
}

interface FormState {
  targetExam: string
  entryScore: string
  currentScore: string
  targetScore: string
  points: PointDraft[]
  lossPoints: string[]
}

function parseNum(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '-') return null
  const next = Number(trimmed)
  return Number.isFinite(next) ? next : null
}

function buildPointDefinitions(data: ReviewOverview | null): PointDefinition[] {
  const list: PointDefinition[] = []
  const added = new Set<string>()

  ;(data?.pointStatuses ?? []).forEach((item) => {
    const name = String(item.pointName || '').trim()
    if (!name || added.has(name)) return
    list.push({ id: item.pointId ?? null, name })
    added.add(name)
  })

  ;[...(data?.pointRates ?? [])]
    .sort((left, right) => (left.sortOrder ?? 999) - (right.sortOrder ?? 999))
    .forEach((item) => {
      const name = String(item.pointName || '').trim()
      if (!name || added.has(name)) return
      list.push({ id: null, name })
      added.add(name)
    })

  return list
}

function buildInitialForm(data: ReviewOverview | null, pointDefinitions: PointDefinition[]): FormState {
  const points = pointDefinitions.map((point) => {
    const rate = data?.pointRates?.find((item) => item.pointName === point.name)
    const status = data?.pointStatuses?.find((item) => item.pointName === point.name)

    return {
      currentRate: rate?.currentRate != null ? String(rate.currentRate) : '',
      targetRate: rate?.targetRate != null ? String(rate.targetRate) : '',
      status: (status?.status ?? 'locked') as ReviewPointStatusValue,
    }
  })

  const lossPoints = LOSS_POINT_DEFINITIONS.map((definition) => {
    const rate = data?.lossPointRates?.find((item) => item.lossPointKey === definition.lossPointKey)
    return rate?.currentRate != null ? String(rate.currentRate) : ''
  })

  return {
    targetExam: data?.targetExam ?? '',
    entryScore: data?.progress?.entryScore != null ? String(data.progress.entryScore) : '',
    currentScore: data?.progress?.currentScore != null ? String(data.progress.currentScore) : '',
    targetScore: data?.progress?.targetScore != null ? String(data.progress.targetScore) : '',
    points,
    lossPoints,
  }
}

function buildPayload(form: FormState, pointDefinitions: PointDefinition[]): ReviewOverview {
  const pointRates: ReviewPointRate[] = pointDefinitions.map((point, index) => ({
    pointName: point.name,
    currentRate: parseNum(form.points[index]?.currentRate ?? ''),
    targetRate: parseNum(form.points[index]?.targetRate ?? ''),
    sortOrder: index + 1,
    sourceType: 'monthly_review',
  }))

  const pointStatuses: ReviewPointStatus[] = pointDefinitions.map((point, index) => ({
    pointId: point.id,
    pointName: point.name,
    status: form.points[index]?.status ?? 'locked',
  }))

  const lossPointRates: ReviewLossPointRate[] = LOSS_POINT_DEFINITIONS.map((item, index) => ({
    lossPointKey: item.lossPointKey,
    reason: item.reason,
    description: item.description,
    checkpointName: item.checkpointName,
    standard: item.standard,
    currentRate: parseNum(form.lossPoints[index] ?? ''),
    sourceType: 'monthly_review',
    sortOrder: index + 1,
  }))

  return {
    targetExam: form.targetExam.trim() || null,
    progress: {
      entryScore: parseNum(form.entryScore),
      currentScore: parseNum(form.currentScore),
      targetScore: parseNum(form.targetScore),
    },
    pointRates,
    pointStatuses,
    lossPointRates,
  }
}

export function ReviewOverviewModal({
  studentId,
  initialData,
  onClose,
  onSaved,
}: {
  studentId: string
  initialData: ReviewOverview | null
  onClose: () => void
  onSaved: (data: ReviewOverview) => void
}) {
  const pointDefinitions = useMemo(() => buildPointDefinitions(initialData), [initialData])
  const [form, setForm] = useState<FormState>(() => buildInitialForm(initialData, pointDefinitions))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(buildInitialForm(initialData, pointDefinitions))
  }, [initialData, pointDefinitions])

  function setPoint(index: number, patch: Partial<PointDraft>) {
    setForm((prev) => {
      const points = prev.points.map((point, currentIndex) => (
        currentIndex === index ? { ...point, ...patch } : point
      ))
      return { ...prev, points }
    })
  }

  function setLossPoint(index: number, value: string) {
    setForm((prev) => ({
      ...prev,
      lossPoints: prev.lossPoints.map((item, currentIndex) => (currentIndex === index ? value : item)),
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = buildPayload(form, pointDefinitions)
      const result = await saveStudentReviewOverview(studentId, payload)
      onSaved(result)
      onClose()
    } catch {
      setError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">录入复盘数据</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div>
            <div className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">目标考试</div>
            <input
              type="text"
              value={form.targetExam}
              onChange={(event) => setForm((prev) => ({ ...prev, targetExam: event.target.value }))}
              placeholder="例如：2027 浙江省考"
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">申论分数进度</div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '入学诊断分', key: 'entryScore' as const },
                { label: '当前诊断分', key: 'currentScore' as const },
                { label: '目标分', key: 'targetScore' as const },
              ].map(({ label, key }) => (
                <div key={key} className="rounded-xl bg-[var(--color-bg-left)] px-3 py-2.5">
                  <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
                  <input
                    type="number"
                    value={form[key]}
                    onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                    placeholder="-"
                    className="mt-1 w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">卡点掌握情况</div>
            {pointDefinitions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
                后端暂未返回复盘点位数据
              </div>
            ) : (
              <div className="space-y-2">
                {pointDefinitions.map((point, index) => (
                  <div
                    key={`${point.id ?? 'point'}_${point.name}`}
                    className="rounded-xl border border-[var(--color-border)] px-3 py-2.5"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-bg-left)] text-[10px] font-semibold text-[var(--color-text-muted)]">
                        {index + 1}
                      </span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{point.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-[var(--color-bg-left)] px-2 py-1.5">
                        <div className="text-[10px] text-[var(--color-text-muted)]">当前掌握率</div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={form.points[index]?.currentRate ?? ''}
                          onChange={(event) => setPoint(index, { currentRate: event.target.value })}
                          placeholder="-"
                          className="mt-0.5 w-full bg-transparent text-xs text-[var(--color-text-primary)] outline-none"
                        />
                      </div>
                      <div className="rounded-lg bg-[var(--color-bg-left)] px-2 py-1.5">
                        <div className="text-[10px] text-[var(--color-text-muted)]">目标掌握率</div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={form.points[index]?.targetRate ?? ''}
                          onChange={(event) => setPoint(index, { targetRate: event.target.value })}
                          placeholder="-"
                          className="mt-0.5 w-full bg-transparent text-xs text-[var(--color-text-primary)] outline-none"
                        />
                      </div>
                      <div className="rounded-lg bg-[var(--color-bg-left)] px-2 py-1.5">
                        <div className="text-[10px] text-[var(--color-text-muted)]">状态</div>
                        <select
                          value={form.points[index]?.status ?? 'locked'}
                          onChange={(event) => setPoint(index, { status: event.target.value as ReviewPointStatusValue })}
                          className="mt-0.5 w-full bg-transparent text-xs text-[var(--color-text-primary)] outline-none"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">失分点掌握度评分</div>
            <div className="rounded-xl border border-[var(--color-border)]">
              <div className="grid grid-cols-[56px_220px_minmax(0,1fr)_120px_92px] gap-px bg-[var(--color-border)] text-[10px] font-medium text-[var(--color-text-secondary)]">
                <div className="bg-[var(--color-bg-left)] px-2 py-2">编号</div>
                <div className="bg-[var(--color-bg-left)] px-2 py-2">失分原因</div>
                <div className="bg-[var(--color-bg-left)] px-2 py-2">具体表现</div>
                <div className="bg-[var(--color-bg-left)] px-2 py-2">所属卡点</div>
                <div className="bg-[var(--color-bg-left)] px-2 py-2">掌握得分</div>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {LOSS_POINT_DEFINITIONS.map((item, index) => (
                  <div
                    key={item.lossPointKey}
                    className="grid grid-cols-[56px_220px_minmax(0,1fr)_120px_92px] items-start gap-px border-t border-[var(--color-border)] first:border-t-0"
                  >
                    <div className="px-2 py-2 text-[11px] text-[var(--color-text-muted)]">{item.lossPointKey}</div>
                    <div className="px-2 py-2 text-[11px] leading-5 text-[var(--color-text-secondary)]">{item.reason}</div>
                    <div className="px-2 py-2 text-xs text-[var(--color-text-primary)]">{item.description}</div>
                    <div className="px-2 py-2 text-[11px] text-[var(--color-text-secondary)]">{item.checkpointName}</div>
                    <div className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.lossPoints[index] ?? ''}
                        onChange={(event) => setLossPoint(index, event.target.value)}
                        placeholder={String(item.standard)}
                        className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">每项按 1-100 分填写掌握程度，分数越高代表掌握越好，留空表示暂不评分</div>
          </div>

          {error ? (
            <div className="text-xs text-red-500">{error}</div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
