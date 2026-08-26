import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../../lib/api'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'
import {
  CHECKPOINT_ASSIGNMENT_LIBRARY,
  type AssignmentCheckpointLibrary,
  type AssignmentResourceItem,
  type AssignmentTheoryRow,
} from './assignmentLibrary.generated'
import {
  getTheoryKnowledgeTypeForProvince,
  isResourceRequiredForProvince,
  isTheoryVisibleForProvince,
  resolveResourceItemsForProvince,
} from './assignmentRuleUtils'
import { useWorkbenchStore } from '../../store/workbenchStore'

const log = logger.child('assign')

type RightTab = 'version' | 'province' | 'theory' | 'training' | 'test'
type VersionKey = 'standard' | 'express' | 'premium'

type TeacherOption = {
  id: string
  name: string
  title?: string
  role?: string
  roleLabel?: string
  color?: string
}

type ProvinceOption = {
  key: string
  label: string
}

type KnowledgeGroup = {
  key: string
  title: string
  rows: AssignmentTheoryRow[]
  knowledgeType: AssignmentTheoryRow['knowledgeType']
  desc: string
}

type CheckpointConfig = {
  checkpointName: string
  selectedVersion: VersionKey | null
  selectedProvince: string | null
  selectedKnowledgeIds: string[]
  selectedQuestionIds: string[]
  selectedExamIds: string[]
  selectedRemedialIds: string[]
}

const palette = ['#e8845a', '#4a90d9', '#7c3aed', '#16a34a', '#d79c69', '#b58f6f']
const NO_ASSIGN_TEACHER: TeacherOption = {
  id: 'unassigned',
  name: '不分配',
  role: 'coach',
  roleLabel: '暂不设置带教老师',
  color: '#94a3b8',
}

const PROVINCE_CANDIDATES = [
  '国考', '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
  '四川', '重庆', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
  '广西', '海南', '广东', '深圳', '香港', '澳门', '台湾',
] as const

const DEFAULT_PROVINCES: ProvinceOption[] = PROVINCE_CANDIDATES.map((key) => ({ key, label: key }))

const versions: Array<{
  key: VersionKey
  name: string
  price: string
  period: string
  condition: string
  benefits: string[]
  color: string
}> = [
  {
    key: 'standard',
    name: '标准版',
    price: '1080 / 1680',
    period: '首轮突破 7 天起，按计划持续到考前',
    condition: '适合备考时间相对充足的学员',
    color: '#e8845a',
    benefits: ['1 节共识课', '1 节纠偏课', '配套理论课', '刷题与人工批改', '卡点考试与报告'],
  },
  {
    key: 'express',
    name: '极速版',
    price: '1680 / 1980',
    period: '考前冲刺 3-7 天',
    condition: '适合时间紧、理解能力较强的学员',
    color: '#4a90d9',
    benefits: ['2 节纠偏课', '3 道纠偏作业', '1 套讲义资料', '2 次卡点考试'],
  },
  {
    key: 'premium',
    name: '尊享版',
    price: '3080',
    period: '考前冲刺 3-7 天',
    condition: '适合时间紧、需要更强跟进的学员',
    color: '#7c3aed',
    benefits: ['4 节纠偏课', '6 道纠偏作业', '3 次卡点考试', '更多人工跟进'],
  },
]

const checkpointOptions = CHECKPOINT_ASSIGNMENT_LIBRARY.map((item, index) => {
  const uniqueKnowledgePoints = Array.from(new Set(item.theoryRows.map((row) => row.knowledgePoint))).filter(Boolean)
  return {
    name: item.checkpointName,
    tag: item.theoryRows.some((row) => getKnowledgeType(row) === 'required') ? '必学' : '卡点',
    desc: uniqueKnowledgePoints.slice(0, 2).join(' · ') || '已导入该卡点下的理论课、刷题和考试数据',
    color: palette[index % palette.length],
  }
})

function buildTheoryId(row: AssignmentTheoryRow) {
  return `${row.sourceSheet}_${row.sourceRow}_${row.knowledgePoint}_${row.theoryTitle}`
}

function isOptionalLearningStatus(status: string) {
  return status.includes('选学')
}

function getKnowledgeType(row: AssignmentTheoryRow, selectedProvince = ''): AssignmentTheoryRow['knowledgeType'] {
  const status = String(row.learningStatusRaw || row.courseStatus || '').trim()
  if (!selectedProvince) {
    if (isOptionalLearningStatus(status)) return 'optional'
    return row.knowledgeType === 'optional' ? 'optional' : 'required'
  }
  return getTheoryKnowledgeTypeForProvince(row, selectedProvince)
}

function getKnowledgeDescription(desc: string, knowledgeType: AssignmentTheoryRow['knowledgeType']) {
  const normalizedDesc = String(desc || '').trim()
  if (!normalizedDesc || normalizedDesc === '必学' || isOptionalLearningStatus(normalizedDesc)) {
    return knowledgeType === 'required' ? '必学知识点' : '选学知识点'
  }
  return normalizedDesc
}

function renderResourceTitle(item: AssignmentResourceItem) {
  return item.displayTitle || item.questionTitle || item.rawTitle || '未命名资源'
}

function inferTeacherRoleFromTitle(title?: string) {
  const value = String(title || '').trim().toLowerCase()
  if (value.includes('诊断') || value.includes('diagnosis')) return 'diagnosis'
  if (value.includes('校长') || value.includes('principal')) return 'principal'
  if (value.includes('学管') || value.includes('manager')) return 'manager'
  return 'coach'
}

function makeDefaultConfig(checkpointName: string): CheckpointConfig {
  return {
    checkpointName,
    selectedVersion: null,
    selectedProvince: null,
    selectedKnowledgeIds: [],
    selectedQuestionIds: [],
    selectedExamIds: [],
    selectedRemedialIds: [],
  }
}

function buildKnowledgeGroups(library: AssignmentCheckpointLibrary, selectedProvince: string): KnowledgeGroup[] {
  const filtered = library.theoryRows.filter((row) => isTheoryVisibleForProvince(row, selectedProvince))
  const grouped = new Map<string, KnowledgeGroup>()

  filtered.forEach((row) => {
    const key = row.knowledgePoint || row.theoryTitle
    const knowledgeType = getKnowledgeType(row, selectedProvince)
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        title: row.knowledgePoint || row.theoryTitle,
        rows: [],
        knowledgeType,
        desc: getKnowledgeDescription(row.learningStatusRaw || row.courseStatus || '', knowledgeType),
      })
    }

    const group = grouped.get(key)!
    group.rows.push(row)
    if (knowledgeType === 'required') {
      group.knowledgeType = 'required'
      group.desc = getKnowledgeDescription(row.learningStatusRaw || row.courseStatus || '', 'required')
    }
  })

  return Array.from(grouped.values())
}

function getConfigValidationIssues(cfg: CheckpointConfig, library: AssignmentCheckpointLibrary | null): string[] {
  const issues: string[] = []

  if (!cfg.selectedVersion) {
    issues.push('请选择版本')
  }

  if (!cfg.selectedProvince) {
    issues.push('请选择省份')
  }

  const showTheory = cfg.selectedVersion !== 'express' && cfg.selectedVersion !== 'premium'
  if (showTheory && library && library.theoryRows.length > 0 && cfg.selectedKnowledgeIds.length === 0) {
    issues.push('请至少选择 1 个知识点')
  }

  if (!library || !cfg.selectedProvince) {
    return issues
  }

  const availablePracticeItems = resolveResourceItemsForProvince(library.practiceItems, cfg.selectedProvince)
  if (availablePracticeItems.length < 3) {
    issues.push(`当前省份可用实训题只有 ${availablePracticeItems.length} 道，至少需要 3 道`)
  } else if (cfg.selectedQuestionIds.length !== 3) {
    issues.push('实训题需要恰好选择 3 道')
  }

  const availableExamItems = resolveResourceItemsForProvince(library.examItems, cfg.selectedProvince)
  if (availableExamItems.length < 1) {
    issues.push('当前省份没有可用测试题，至少需要 1 道')
  } else if (cfg.selectedExamIds.length !== 1) {
    issues.push('正式测试题需要保留 1 道')
  }

  return issues
}

function isConfigComplete(cfg: CheckpointConfig, library: AssignmentCheckpointLibrary | null): boolean {
  return getConfigValidationIssues(cfg, library).length === 0
}

function SelectCard({
  active,
  title,
  subtitle,
  onClick,
  extra,
}: {
  active: boolean
  title: string
  subtitle?: string
  onClick: () => void
  extra?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-xl border px-4 py-3 text-left transition-all',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={['text-sm font-semibold', active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'].join(' ')}>
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{subtitle}</div>
          ) : null}
        </div>
        {extra}
      </div>
    </button>
  )
}

function CheckboxRow({
  checked,
  title,
  subtitle,
  badge,
  onToggle,
}: {
  checked: boolean
  title: string
  subtitle?: string
  badge?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
        checked
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={['text-sm font-medium', checked ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'].join(' ')}>
            {title}
          </span>
          {badge ? (
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <div className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{subtitle}</div>
        ) : null}
      </div>
      <div
        className={[
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
          checked ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[var(--color-border)] bg-white',
        ].join(' ')}
      >
        {checked ? (
          <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
            <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
    </button>
  )
}

function StepButton({
  index,
  title,
  active,
  completed,
  onClick,
}: {
  index: number
  title: string
  active: boolean
  completed: boolean
  onClick: () => void
}) {
  const isDone = completed && !active
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-all',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
          : isDone
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text-primary)]',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          active ? 'bg-[var(--color-primary)] text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400',
        ].join(' ')}
      >
        {isDone ? '✓' : index}
      </span>
      <span>{title}</span>
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
      {text}
    </div>
  )
}

export function AssignStudentModal() {
  // 窄选择器订阅：避免整店订阅导致 30s 轮询每次都重渲染整个弹窗
  const assignStudentItem = useWorkbenchStore((s) => s.assignStudentItem)
  const closeAssignStudent = useWorkbenchStore((s) => s.closeAssignStudent)
  const assignStudentTask = useWorkbenchStore((s) => s.assignStudentTask)
  const studentDetailMetaMap = useWorkbenchStore((s) => s.studentDetailMetaMap)
  const assignStudentModalOpen = assignStudentItem !== null
  const assignStudentModalItemId = assignStudentItem?.id ?? null
  const closeAssignStudentModal = closeAssignStudent

  const [selectedCheckpoints, setSelectedCheckpoints] = useState<string[]>([])
  const [activeCheckpointTab, setActiveCheckpointTab] = useState<string | null>(null)
  const [checkpointConfigs, setCheckpointConfigs] = useState<Map<string, CheckpointConfig>>(new Map())
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherOption | null>(null)
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [teacherInitializedForOpen, setTeacherInitializedForOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<RightTab>('version')
  const [submitting, setSubmitting] = useState(false)
  const [confirmArmed, setConfirmArmed] = useState(false)

  const preferredTeacherId = useMemo(() => {
    const itemTeacherId = String(assignStudentItem?.preferredTeacherId || '').trim()
    if (itemTeacherId) return itemTeacherId

    const studentId = String(assignStudentItem?.studentId || '').trim()
    if (!studentId) return ''

    const detailMeta = studentDetailMetaMap[studentId]
    const coach = (detailMeta?.teamTeachers ?? []).find((teacher) => {
      const role = String(teacher.role || '').trim()
      return role === 'coach' || role.includes('带教')
    })

    return coach?.id ? String(coach.id) : ''
  }, [assignStudentItem?.preferredTeacherId, assignStudentItem?.studentId, studentDetailMetaMap])

  // 学生详情里 hasData 为真的卡点 = 已下发过学习任务，提交时必须排除，防止重复分配
  const assignedCheckpointNames = useMemo(() => {
    const studentId = String(assignStudentItem?.studentId || '').trim()
    if (!studentId) return new Set<string>()
    const detailMeta = studentDetailMetaMap[studentId]
    return new Set(
      (detailMeta?.checkpoints ?? [])
        .filter((checkpoint) => checkpoint.hasData)
        .map((checkpoint) => String(checkpoint.name || '').trim())
        .filter(Boolean),
    )
  }, [assignStudentItem?.studentId, studentDetailMetaMap])

  useEffect(() => {
    if (!assignStudentModalOpen) return
    let cancelled = false

    async function loadTeachers() {
      try {
        const directList = await api.get<TeacherOption[]>('/api/teacher/assignable-teachers')
        if (cancelled) return

        const list = (Array.isArray(directList) ? directList : [])
          .map((teacher, index) => ({
            ...teacher,
            role: teacher.role || inferTeacherRoleFromTitle(teacher.title),
            color: teacher.color || palette[index % palette.length],
          }))
          .filter((teacher) => teacher.role === 'coach')

        setTeachers([NO_ASSIGN_TEACHER, ...list])
        return
      } catch (error) {
        // 专用老师列表接口失败时降级到通用列表接口，这里只记录日志，不打断兜底请求
        log.debug('assign.teacher_direct.failed', {
          message: error instanceof Error ? error.message : String(error),
        })
      }

      try {
        const res = await api.get<{ list: TeacherOption[] }>('/api/teacher/list')
        if (cancelled) return

        const list = (res.list ?? [])
          .map((teacher, index) => ({
            ...teacher,
            role: teacher.role || inferTeacherRoleFromTitle(teacher.title),
            color: teacher.color || palette[index % palette.length],
          }))
          .filter((teacher) => teacher.role === 'coach')

        setTeachers([NO_ASSIGN_TEACHER, ...list])
      } catch {
        if (!cancelled) setTeachers([NO_ASSIGN_TEACHER])
      }
    }

    void loadTeachers()

    return () => {
      cancelled = true
    }
  }, [assignStudentModalOpen])

  useEffect(() => {
    if (!assignStudentModalOpen) {
      setSelectedCheckpoints([])
      setActiveCheckpointTab(null)
      setCheckpointConfigs(new Map())
      setSelectedTeacher(null)
      setTeacherInitializedForOpen(false)
      setActiveTab('version')
      setSubmitting(false)
      setConfirmArmed(false)
    }
  }, [assignStudentModalOpen])

  useEffect(() => {
    if (!assignStudentModalOpen || teacherInitializedForOpen || teachers.length === 0) return

    const preferredTeacher = preferredTeacherId
      ? (teachers.find((teacher) => String(teacher.id) === preferredTeacherId) ?? null)
      : null

    setSelectedTeacher(preferredTeacher ?? NO_ASSIGN_TEACHER)
    setTeacherInitializedForOpen(true)
  }, [assignStudentModalOpen, preferredTeacherId, teacherInitializedForOpen, teachers])

  useEffect(() => {
    if (!assignStudentModalOpen) return
    if (selectedCheckpoints.length > 0) return

    const presetCheckpoints = (assignStudentItem?.presetCheckpoints ?? [])
      .filter(Boolean)
      .filter((name) => !assignedCheckpointNames.has(name))
    if (presetCheckpoints.length === 0) return

    const nextConfigs = new Map<string, CheckpointConfig>()
    presetCheckpoints.forEach((name) => {
      nextConfigs.set(name, makeDefaultConfig(name))
    })

    setSelectedCheckpoints(presetCheckpoints)
    setCheckpointConfigs(nextConfigs)
    setActiveCheckpointTab(presetCheckpoints[0] ?? null)
    setActiveTab('version')
  }, [assignStudentItem?.presetCheckpoints, assignedCheckpointNames, assignStudentModalOpen, selectedCheckpoints.length])

  useEffect(() => {
    if (selectedCheckpoints.length === 0) {
      setActiveCheckpointTab(null)
      return
    }
    if (!activeCheckpointTab || !selectedCheckpoints.includes(activeCheckpointTab)) {
      setActiveCheckpointTab(selectedCheckpoints[0])
    }
  }, [selectedCheckpoints, activeCheckpointTab])

  useEffect(() => {
    setConfirmArmed(false)
  }, [selectedCheckpoints, checkpointConfigs, selectedTeacher])

  const handleTabSwitch = (name: string) => {
    setActiveCheckpointTab(name)
    setActiveTab('version')
  }

  const toggleCheckpoint = (name: string) => {
    if (assignedCheckpointNames.has(name)) {
      toast.info(`卡点「${name}」此前已分配过学习任务，本次不会重复下发。`)
      return
    }
    setSelectedCheckpoints((prev) => {
      if (prev.includes(name)) {
        const next = prev.filter((n) => n !== name)
        setCheckpointConfigs((m) => {
          const copy = new Map(m)
          copy.delete(name)
          return copy
        })
        return next
      }
      setCheckpointConfigs((m) => {
        if (!m.has(name)) {
          const copy = new Map(m)
          copy.set(name, makeDefaultConfig(name))
          return copy
        }
        return m
      })
      return [...prev, name]
    })
  }

  const moveCheckpoint = (name: string, direction: 'up' | 'down') => {
    setSelectedCheckpoints((prev) => {
      const index = prev.indexOf(name)
      if (index < 0) return prev

      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev

      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }

  const updateConfig = (name: string, patch: Partial<CheckpointConfig>) => {
    setCheckpointConfigs((m) => {
      const copy = new Map(m)
      const existing = copy.get(name) ?? makeDefaultConfig(name)
      copy.set(name, { ...existing, ...patch })
      return copy
    })
  }

  const currentConfig = activeCheckpointTab
    ? (checkpointConfigs.get(activeCheckpointTab) ?? makeDefaultConfig(activeCheckpointTab))
    : null

  const currentLibrary: AssignmentCheckpointLibrary | null = useMemo(() => {
    if (!activeCheckpointTab) return null
    return CHECKPOINT_ASSIGNMENT_LIBRARY.find((l) => l.checkpointName === activeCheckpointTab) ?? null
  }, [activeCheckpointTab])

  const showTheory = currentConfig?.selectedVersion !== 'express' && currentConfig?.selectedVersion !== 'premium'

  const availableProvinces = DEFAULT_PROVINCES

  const knowledgeGroups = useMemo((): KnowledgeGroup[] => {
    if (!currentLibrary || !currentConfig?.selectedProvince) return []
    return buildKnowledgeGroups(currentLibrary, currentConfig.selectedProvince)
  }, [currentLibrary, currentConfig?.selectedProvince])

  const filteredPractice = useMemo(() => {
    if (!currentLibrary || !currentConfig?.selectedProvince) return []
    return resolveResourceItemsForProvince(currentLibrary.practiceItems, currentConfig.selectedProvince)
  }, [currentLibrary, currentConfig?.selectedProvince])

  const filteredExam = useMemo(() => {
    if (!currentLibrary || !currentConfig?.selectedProvince) return []
    return resolveResourceItemsForProvince(currentLibrary.examItems, currentConfig.selectedProvince)
  }, [currentLibrary, currentConfig?.selectedProvince])

  const filteredRemedial = useMemo(() => {
    if (!currentLibrary || !currentConfig?.selectedProvince) return []
    return resolveResourceItemsForProvince(currentLibrary.remedialItems, currentConfig.selectedProvince)
  }, [currentLibrary, currentConfig?.selectedProvince])

  // 已分配的卡点不参与本次提交；selectedCheckpoints 减去它们才是真正要下发的清单
  const skippedAssignedCheckpoints = selectedCheckpoints.filter((name) => assignedCheckpointNames.has(name))
  const checkpointsToAssign = selectedCheckpoints.filter((name) => !assignedCheckpointNames.has(name))

  const canConfirm =
    checkpointsToAssign.length > 0 &&
    checkpointsToAssign.every((name) => {
      const cfg = checkpointConfigs.get(name)
      if (!cfg) return false
      const lib = CHECKPOINT_ASSIGNMENT_LIBRARY.find((l) => l.checkpointName === name) ?? null
      return isConfigComplete(cfg, lib)
    })

  const validationMessages = checkpointsToAssign.flatMap((name) => {
    const cfg = checkpointConfigs.get(name)
    const lib = CHECKPOINT_ASSIGNMENT_LIBRARY.find((l) => l.checkpointName === name) ?? null
    const issues = cfg ? getConfigValidationIssues(cfg, lib) : ['请完成当前卡点配置']
    return issues.map((issue) => `${name}：${issue}`)
  })

  const handleSubmit = async () => {
    if (!canConfirm || submitting || !assignStudentModalItemId) return
    if (!confirmArmed) {
      setConfirmArmed(true)
      return
    }

    // 二次防线：即使勾选状态里混入了已分配的卡点，也在这里排除，绝不重复下发
    const skippedAssigned = selectedCheckpoints.filter((name) => assignedCheckpointNames.has(name))
    const checkpointsToSubmit = selectedCheckpoints.filter((name) => !assignedCheckpointNames.has(name))
    if (checkpointsToSubmit.length === 0) {
      toast.info('所选卡点此前都已分配过学习任务，本次不重复下发。')
      return
    }
    if (skippedAssigned.length > 0) {
      toast.info(`已跳过此前分配过的卡点：${skippedAssigned.join('、')}`)
    }

    setSubmitting(true)
    const succeededCheckpoints: string[] = []
    try {
      for (const [sortOrder, name] of checkpointsToSubmit.entries()) {
        const cfg = checkpointConfigs.get(name)
        const selectedProvince = cfg?.selectedProvince ?? null
        const lib = CHECKPOINT_ASSIGNMENT_LIBRARY.find((l) => l.checkpointName === name) ?? null
        if (!cfg || !selectedProvince || !lib) {
          // 不允许静默跳过：配置缺失视作该卡点失败并立即停止
          log.warn('assign.student_task.invalid_config', {
            itemId: assignStudentModalItemId,
            checkpointName: name,
          })
          toast.error(`卡点「${name}」配置不完整，已停止下发。请补全配置后重新点击“确认分配”。`)
          return
        }
        const versionObj = versions.find((v) => v.key === cfg.selectedVersion)
        const provinceObj = DEFAULT_PROVINCES.find((p) => p.key === selectedProvince)
        const libKnowledgeGroups = buildKnowledgeGroups(lib, selectedProvince)
        const selectedGroups = libKnowledgeGroups.filter((g) => cfg.selectedKnowledgeIds.includes(g.key))
        const selectedTheoryRows = lib.theoryRows.filter((row) => (
          cfg.selectedKnowledgeIds.includes(row.knowledgePoint || row.theoryTitle)
          && isTheoryVisibleForProvince(row, selectedProvince)
        ))
        const availablePracticeItems = resolveResourceItemsForProvince(lib.practiceItems, selectedProvince)
        const availableExamItems = resolveResourceItemsForProvince(lib.examItems, selectedProvince)
        const availableRemedialItems = resolveResourceItemsForProvince(lib.remedialItems, selectedProvince)
        const theoryLessons: Array<{
          id: string
          title: string
          scope: string
          videoId: string
          preClassUrl: string
          analysisUrl: string
          noteText: string
          knowledgeId: string
          knowledgeTitle: string
          knowledgeType: string
          sourceSheet: string
          sourceRow: number
        }> = []
        selectedTheoryRows.forEach((row) => {
          const matchedGroup = libKnowledgeGroups.find((group) => group.key === (row.knowledgePoint || row.theoryTitle))
          theoryLessons.push({
            id: buildTheoryId(row),
            title: row.theoryTitle,
            scope: row.learningStatusRaw || '',
            videoId: row.videoId || '',
            preClassUrl: row.preClassUrl || '',
            analysisUrl: row.analysisUrl || '',
            noteText: row.noteText || '',
            knowledgeId: matchedGroup?.key || row.knowledgePoint || row.theoryTitle,
            knowledgeTitle: matchedGroup?.title || row.knowledgePoint || row.theoryTitle,
            knowledgeType: matchedGroup?.knowledgeType || getKnowledgeType(row, selectedProvince),
            sourceSheet: row.sourceSheet,
            sourceRow: row.sourceRow,
          })
        })
        const practiceItems = availablePracticeItems.filter((item) => cfg.selectedQuestionIds.includes(item.id))
        const examItems = availableExamItems.filter((item) => cfg.selectedExamIds.includes(item.id)).slice(0, 1)
        const remedialItems = availableRemedialItems.filter((item) => cfg.selectedRemedialIds.includes(item.id))
        const knowledgeItems = selectedGroups.map((g) => ({
          id: g.key, title: g.title, type: g.knowledgeType, desc: g.desc,
        }))
        try {
          await assignStudentTask(assignStudentModalItemId, {
            checkpointName: name,
            sortOrder,
            teacher: selectedTeacher?.id === NO_ASSIGN_TEACHER.id ? null : selectedTeacher,
            version: cfg.selectedVersion!,
            versionName: versionObj?.name ?? cfg.selectedVersion!,
            province: selectedProvince,
            provinceLabel: provinceObj?.label ?? selectedProvince,
            knowledgeItems,
            theoryLessons,
            practiceIds: cfg.selectedQuestionIds,
            examIds: cfg.selectedExamIds,
            practiceItems,
            examItems,
            remedialItems,
            detail: '',
          })
          succeededCheckpoints.push(name)
        } catch (error) {
          // fail-fast：某卡点失败立即停止，不再继续下发剩余卡点；已成功的保持不动
          const notSubmitted = checkpointsToSubmit.slice(succeededCheckpoints.length + 1)
          log.warn('assign.student_task.failed', {
            itemId: assignStudentModalItemId,
            checkpointName: name,
            succeededCheckpoints,
            notSubmitted,
            message: error instanceof Error ? error.message : String(error),
          })
          const parts = [`卡点「${name}」分配失败，已停止下发剩余卡点`]
          if (succeededCheckpoints.length > 0) {
            parts.push(`已成功：${succeededCheckpoints.join('、')}`)
          }
          if (notSubmitted.length > 0) {
            parts.push(`未下发：${notSubmitted.join('、')}`)
          }
          parts.push('弹窗已保留，可重新点击“确认分配”补齐未完成的卡点')
          toast.error(`${parts.join('；')}。`)
          return
        }
      }
      toast.success(`已为 ${assignStudentItem?.name ?? '该学生'} 成功下发 ${succeededCheckpoints.length} 个卡点任务。`)
      closeAssignStudentModal()
    } catch (error) {
      // 兜底：理论上循环内已全部捕获，防止任何漏网异常变成未处理的 Promise 拒绝
      log.error('assign.submit.unexpected', {
        itemId: assignStudentModalItemId,
        succeededCheckpoints,
        message: error instanceof Error ? error.message : String(error),
      })
      toast.error('分配过程出现未预期的错误，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  if (!assignStudentModalOpen) return null

  const steps: Array<{ key: RightTab; label: string }> = [
    { key: 'version', label: '版本' },
    { key: 'province', label: '省份' },
    ...(showTheory ? [{ key: 'theory' as RightTab, label: '理论' }] : []),
    { key: 'training', label: '实训' },
    { key: 'test', label: '测试' },
  ]

  const isStepCompleted = (key: RightTab): boolean => {
    if (!currentConfig) return false
    if (key === 'version') return !!currentConfig.selectedVersion
    if (key === 'province') return !!currentConfig.selectedProvince
    if (key === 'theory') return currentConfig.selectedKnowledgeIds.length > 0
    if (key === 'training') {
      if (!currentLibrary || !currentConfig.selectedProvince) return false
      return currentLibrary.practiceItems.length === 0 || (filteredPractice.length >= 3 && currentConfig.selectedQuestionIds.length === 3)
    }
    if (key === 'test') {
      if (!currentLibrary || !currentConfig.selectedProvince) return false
      return currentLibrary.examItems.length === 0 || (filteredExam.length >= 1 && currentConfig.selectedExamIds.length === 1)
    }
    return false
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex h-[88vh] w-[900px] max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">分配学员任务</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">选择卡点（可多选）并为每个卡点配置方案，最后选择带教老师</p>
          </div>
          <button
            type="button"
            onClick={closeAssignStudentModal}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-gray-100"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--color-border)] p-4">
            <div>
              <div className="mb-2 text-xs font-semibold text-[var(--color-text-muted)]">选择卡点（可多选）</div>
              <div className="flex flex-col gap-2">
                {checkpointOptions.map((cp) => (
                  <CheckboxRow
                    key={cp.name}
                    checked={selectedCheckpoints.includes(cp.name)}
                    title={cp.name}
                    badge={assignedCheckpointNames.has(cp.name) ? `${cp.tag} · 已分配` : cp.tag}
                    onToggle={() => toggleCheckpoint(cp.name)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-[var(--color-text-muted)]">选择带教老师</div>
              <div className="flex flex-col gap-2">
                {teachers.length === 0 ? (
                  <EmptyState text="暂无老师数据" />
                ) : (
                  teachers.map((t) => (
                    <SelectCard
                      key={t.id}
                      active={selectedTeacher?.id === t.id}
                      title={t.name}
                      subtitle={t.roleLabel ?? t.role ?? t.title}
                      onClick={() => setSelectedTeacher(t)}
                      extra={(
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: t.color ?? '#e8845a' }}
                        >
                          {t.name.slice(0, 1)}
                        </div>
                      )}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {selectedCheckpoints.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
                请先在左侧选择至少一个卡点
              </div>
            ) : (
              <>
                {selectedCheckpoints.length > 1 && (
                  <div className="shrink-0 border-b border-[var(--color-border)] px-5 py-3">
                    <div className="mb-2 text-xs font-semibold text-[var(--color-text-muted)]">学习顺序</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCheckpoints.map((name, index) => (
                        <div
                          key={`sort_${name}`}
                          className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-bg-left)] text-[10px] font-semibold">
                            {index + 1}
                          </span>
                          <span>{name}</span>
                          <div className="ml-1 flex items-center gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveCheckpoint(name, 'up')}
                              className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={index === selectedCheckpoints.length - 1}
                              onClick={() => moveCheckpoint(name, 'down')}
                              className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCheckpoints.length > 1 && (
                  <div className="flex shrink-0 flex-wrap gap-2 border-b border-[var(--color-border)] px-5 py-3">
                    {selectedCheckpoints.map((name) => {
                      const cfg = checkpointConfigs.get(name)
                      const lib = CHECKPOINT_ASSIGNMENT_LIBRARY.find((l) => l.checkpointName === name) ?? null
                      const done = cfg ? isConfigComplete(cfg, lib) : false
                      const isActive = activeCheckpointTab === name
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => handleTabSwitch(name)}
                          className={[
                            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                            isActive
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                              : done
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                          ].join(' ')}
                        >
                          {name}
                          {done && !isActive ? <span className="text-emerald-500">✓</span> : isActive ? <span>→</span> : null}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="flex shrink-0 flex-wrap gap-2 border-b border-[var(--color-border)] px-5 py-3">
                  {steps.map((s, i) => (
                    <StepButton
                      key={s.key}
                      index={i + 1}
                      title={s.label}
                      active={activeTab === s.key}
                      completed={isStepCompleted(s.key)}
                      onClick={() => setActiveTab(s.key)}
                    />
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {activeTab === 'version' && (
                    <div className="flex flex-col gap-3">
                      {versions.map((v) => (
                        <SelectCard
                          key={v.key}
                          active={currentConfig?.selectedVersion === v.key}
                          title={v.name}
                          subtitle={v.period + ' · ' + v.condition}
                          onClick={() => activeCheckpointTab && updateConfig(activeCheckpointTab, { selectedVersion: v.key })}
                          extra={(
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-semibold" style={{ color: v.color }}>¥{v.price}</div>
                            </div>
                          )}
                        />
                      ))}
                    </div>
                  )}

                  {activeTab === 'province' && (
                    <div className="flex flex-wrap gap-2">
                      {availableProvinces.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            if (!activeCheckpointTab || !currentLibrary) return
                            const groups = buildKnowledgeGroups(currentLibrary, p.key)
                            const requiredIds = groups
                              .filter((g) => g.knowledgeType === 'required')
                              .map((g) => g.key)
                            const practiceItems = resolveResourceItemsForProvince(currentLibrary.practiceItems, p.key)
                            const examItems = resolveResourceItemsForProvince(currentLibrary.examItems, p.key)
                            const remedialItems = resolveResourceItemsForProvince(currentLibrary.remedialItems, p.key)
                            updateConfig(activeCheckpointTab, {
                              selectedProvince: p.key,
                              selectedKnowledgeIds: requiredIds,
                              selectedQuestionIds: practiceItems
                                .filter((item) => isResourceRequiredForProvince(item, p.key))
                                .map((item) => item.id),
                              selectedExamIds: examItems
                                .filter((item) => isResourceRequiredForProvince(item, p.key))
                                .slice(0, 1)
                                .map((item) => item.id),
                              selectedRemedialIds: remedialItems
                                .filter((item) => isResourceRequiredForProvince(item, p.key))
                                .map((item) => item.id),
                            })
                          }}
                          className={[
                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                            currentConfig?.selectedProvince === p.key
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                          ].join(' ')}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeTab === 'theory' && showTheory && (
                    <div className="flex flex-col gap-2">
                      {knowledgeGroups.length === 0 ? (
                        <EmptyState text={currentConfig?.selectedProvince ? '当前省份暂无理论内容' : '请先选择省份'} />
                      ) : (
                        knowledgeGroups.map((g) => (
                          <CheckboxRow
                            key={g.key}
                            checked={currentConfig?.selectedKnowledgeIds.includes(g.key) ?? false}
                            title={g.title}
                            subtitle={g.desc + ' · ' + g.rows.length + ' 节课'}
                            badge={g.knowledgeType === 'required' ? '必学' : '选学'}
                            onToggle={() => {
                              if (!activeCheckpointTab || !currentConfig) return
                              const ids = currentConfig.selectedKnowledgeIds
                              updateConfig(activeCheckpointTab, {
                                selectedKnowledgeIds: ids.includes(g.key)
                                  ? ids.filter((id) => id !== g.key)
                                  : [...ids, g.key],
                              })
                            }}
                          />
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'training' && (
                    <div className="flex flex-col gap-2">
                      <div className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">实训题（3题）</div>
                      {filteredPractice.length === 0 ? (
                        <EmptyState text="当前卡点暂无实训题资源" />
                      ) : (
                        filteredPractice.map((item) => (
                          <CheckboxRow
                            key={item.id}
                            checked={currentConfig?.selectedQuestionIds.includes(item.id) ?? false}
                            title={renderResourceTitle(item)}
                            subtitle={item.slotLabel || undefined}
                            onToggle={() => {
                              if (!activeCheckpointTab || !currentConfig) return
                              const ids = currentConfig.selectedQuestionIds
                              if (!ids.includes(item.id) && ids.length >= 3) {
                                toast.info('实训固定 3 题，请先取消一题再重新选择')
                                return
                              }
                              updateConfig(activeCheckpointTab, {
                                selectedQuestionIds: ids.includes(item.id)
                                  ? ids.filter((id) => id !== item.id)
                                  : [...ids, item.id],
                              })
                            }}
                          />
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'test' && (
                    <div className="flex flex-col gap-2">
                      <div className="rounded-xl bg-[var(--color-page-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                        这里同时展示正式测试和选学 / 补考测试。
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">测试题（1题）</div>
                      {filteredExam.length === 0 ? (
                        <EmptyState text="当前卡点暂无测试题资源" />
                      ) : (
                        filteredExam.map((item) => (
                          <CheckboxRow
                            key={item.id}
                            checked={currentConfig?.selectedExamIds.includes(item.id) ?? false}
                            title={renderResourceTitle(item)}
                            subtitle={item.slotLabel || undefined}
                            onToggle={() => {
                              if (!activeCheckpointTab || !currentConfig) return
                              updateConfig(activeCheckpointTab, {
                                selectedExamIds: currentConfig.selectedExamIds.includes(item.id) ? [] : [item.id],
                              })
                            }}
                          />
                        ))
                      )}
                      <div className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">选学 / 补考测试</div>
                      {filteredRemedial.length === 0 ? (
                        <EmptyState text="当前卡点暂无选学 / 补考测试资源" />
                      ) : (
                        filteredRemedial.map((item) => (
                          <CheckboxRow
                            key={item.id}
                            checked={currentConfig?.selectedRemedialIds.includes(item.id) ?? false}
                            title={renderResourceTitle(item)}
                            subtitle={item.slotLabel || undefined}
                            onToggle={() => {
                              if (!activeCheckpointTab || !currentConfig) return
                              const ids = currentConfig.selectedRemedialIds
                              updateConfig(activeCheckpointTab, {
                                selectedRemedialIds: ids.includes(item.id)
                                  ? ids.filter((id) => id !== item.id)
                                  : [...ids, item.id],
                              })
                            }}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <div className="max-w-[70%] text-xs">
            {skippedAssignedCheckpoints.length > 0 ? (
              <div className="mb-1 text-amber-600">
                以下卡点此前已分配过学习任务，本次提交时将自动跳过，不重复下发：{skippedAssignedCheckpoints.join('、')}
              </div>
            ) : null}
            {validationMessages.length > 0 ? (
              <div className="text-rose-500">
                {validationMessages[0]}
                {validationMessages.length > 1 ? `；另外还有 ${validationMessages.length - 1} 项未完成` : ''}
              </div>
            ) : confirmArmed ? (
              <div className="text-amber-600">再次点击“确认分配”后，将立即为学生下发任务并同步带教老师。</div>
            ) : (
              <div className="text-[var(--color-text-muted)]">
                {selectedCheckpoints.length > 0
                  ? `${selectedCheckpoints.length} 个卡点已选${selectedTeacher ? ` · ${selectedTeacher.name}` : ''}`
                  : '请选择卡点和老师'}
              </div>
            )}
          </div>
          <div className="hidden text-xs text-[var(--color-text-muted)]">
            {selectedCheckpoints.length > 0
              ? selectedCheckpoints.length + ' 个卡点已选' + (selectedTeacher ? ' · ' + selectedTeacher.name : '')
              : '请选择卡点和老师'}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={closeAssignStudentModal}
              className="rounded-xl border border-[var(--color-border)] px-5 py-2 text-sm text-[var(--color-text-muted)] hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canConfirm || submitting}
              className={[
                'relative overflow-hidden rounded-xl px-5 py-2 text-sm font-medium text-transparent transition-all',
                canConfirm && !submitting
                  ? 'bg-[var(--color-primary)] hover:opacity-90'
                  : 'cursor-not-allowed bg-gray-300',
              ].join(' ')}
            >
              <span className="absolute inset-0 flex items-center justify-center text-white">
                {submitting ? '提交中...' : confirmArmed ? '再次确认分配' : '确认分配'}
              </span>
              {submitting ? '提交中...' : '确认分配'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
