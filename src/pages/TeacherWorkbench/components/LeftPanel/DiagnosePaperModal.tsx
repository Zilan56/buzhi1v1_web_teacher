import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  previewDiagnosePaperBundle,
  saveDiagnosePaperBundle,
  type DiagnosePaperBundlePayload,
} from '../../api/learningPath'
import type { TaskListItem } from '../../types'
import { useWorkbenchStore } from '../../store/workbenchStore'
import {
  DIAGNOSE_CUSTOM_QUESTION_IDS,
  DIAGNOSE_PAPER_OPTIONS,
  getDiagnosePaperOption,
  resolveDiagnoseQuestions,
} from './diagnosePaperLibrary'
import { api } from '../../../../lib/api'
import { apiUrl } from '../../../../lib/apiBase'
import { teacherCanHandleRole } from '../../../../lib/teacherRoles'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'

const log = logger.child('diagnose')

type DiagnoseOptionId = 'standard' | 'beijing' | 'jiangsu' | 'custom'
type PreviewMode = 'paper' | 'answer'

type PreviewState = {
  loading: boolean
  error: string
  bundle: DiagnosePaperBundlePayload | null
}

type TeacherOption = {
  id: string
  name: string
  title?: string
  roles?: string[]
  roleLabels?: string[]
  role?: string
  roleLabel?: string
}

type TeacherListResponse = {
  list?: TeacherOption[]
}

function normalizeTeacherOption(teacher: TeacherOption): TeacherOption {
  return {
    ...teacher,
    id: String(teacher.id || ''),
    name: String(teacher.name || ''),
    title: teacher.title ? String(teacher.title) : '',
    roles: Array.isArray(teacher.roles) ? teacher.roles.map((item) => String(item || '')) : [],
    roleLabels: Array.isArray(teacher.roleLabels) ? teacher.roleLabels.map((item) => String(item || '')) : [],
    role: teacher.role ? String(teacher.role) : '',
    roleLabel: teacher.roleLabel ? String(teacher.roleLabel) : '',
  }
}

async function fetchDiagnoseTeacherOptions(): Promise<TeacherOption[]> {
  try {
    const directList = await api.get<TeacherOption[]>('/api/teacher/assignable-teachers')
    if (Array.isArray(directList)) {
      return directList.map(normalizeTeacherOption).filter((teacher) => teacherCanHandleRole(teacher, 'diagnosis'))
    }
  } catch (error) {
    // 专用老师列表接口失败时降级到通用列表接口，这里只记录日志，不打断兜底请求
    log.debug('diagnose.teacher_direct.failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const result = await api.get<TeacherListResponse>('/api/teacher/list')
  return Array.isArray(result.list)
    ? result.list.map(normalizeTeacherOption).filter((teacher) => teacherCanHandleRole(teacher, 'diagnosis'))
    : []
}

function createEmptyPreview(): PreviewState {
  return {
    loading: false,
    error: '',
    bundle: null,
  }
}

function resolveAssetUrl(url = '') {
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : apiUrl(url)
}

function StudentListItem({
  item,
  active,
  onClick,
}: {
  item: TaskListItem
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
          : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-left)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: item.color }}
        >
          {item.avatar}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.name}</div>
          <div className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{item.subtitle}</div>
        </div>
      </div>
    </button>
  )
}

export function DiagnosePaperModal() {
  const openTaskKey = useWorkbenchStore((state) => state.openTaskKey)
  const closeTaskModal = useWorkbenchStore((state) => state.closeTaskModal)
  const loadTaskCounts = useWorkbenchStore((state) => state.loadTaskCounts)
  const loadTaskItems = useWorkbenchStore((state) => state.loadTaskItems)
  const loadStudentInfo = useWorkbenchStore((state) => state.loadStudentInfo)
  const openStudentProfile = useWorkbenchStore((state) => state.openStudentProfile)
  const refreshLearningPath = useWorkbenchStore((state) => state.refreshLearningPath)
  const presetItem = useWorkbenchStore((state) => state.diagnosePaperItem)
  const items = useWorkbenchStore((state) => state.taskItemsMap.pendingDiagnosePaper)

  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedOption, setSelectedOption] = useState<DiagnoseOptionId | ''>('')
  const [dialogOptionId, setDialogOptionId] = useState<DiagnoseOptionId | null>(null)
  const [customQuestionIds, setCustomQuestionIds] = useState<string[]>(getDiagnosePaperOption('custom').questionIds)
  const [preview, setPreview] = useState<PreviewState>(createEmptyPreview())
  const [previewMode, setPreviewMode] = useState<PreviewMode>('paper')
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [teacherLoading, setTeacherLoading] = useState(false)

  const open = openTaskKey === 'pendingDiagnosePaper'
  const previewDialogOpen = open && Boolean(dialogOptionId)

  const mergedItems = useMemo(() => {
    if (!presetItem?.studentId) return items

    let matched = false
    const nextItems = items.map((item) => {
      const sameStudent = item.studentId === presetItem.studentId
        && String(item.pointName || '') === String(presetItem.pointName || '')

      if (!sameStudent) {
        return item
      }

      matched = true
      return {
        ...item,
        preferredTeacherId: presetItem.preferredTeacherId || item.preferredTeacherId,
      }
    })

    return matched ? nextItems : [presetItem, ...nextItems]
  }, [items, presetItem])
  const selectedItem = useMemo(
    () => mergedItems.find((item) => item.studentId === selectedStudentId) ?? mergedItems[0] ?? null,
    [mergedItems, selectedStudentId],
  )
  const activeOption = selectedOption ? getDiagnosePaperOption(selectedOption) : null
  const dialogOption = dialogOptionId ? getDiagnosePaperOption(dialogOptionId) : null
  const selectedTeacher = teacherOptions.find((teacher) => teacher.id === selectedTeacherId) ?? null

  const dialogQuestionIds = useMemo(() => {
    if (!dialogOptionId) return []
    return dialogOptionId === 'custom'
      ? customQuestionIds
      : getDiagnosePaperOption(dialogOptionId).questionIds
  }, [customQuestionIds, dialogOptionId])

  const dialogQuestions = useMemo(
    () => resolveDiagnoseQuestions(dialogQuestionIds),
    [dialogQuestionIds],
  )

  useEffect(() => {
    if (!open) return
    setSelectedStudentId((current) => {
      if (presetItem?.studentId) {
        return presetItem.studentId
      }
      if (current && mergedItems.some((item) => item.studentId === current)) {
        return current
      }
      return mergedItems[0]?.studentId || ''
    })
  }, [mergedItems, open, presetItem])

  useEffect(() => {
    if (!open) return
    setSelectedOption('')
    setDialogOptionId(null)
    setPreviewMode('paper')
    setPreview(createEmptyPreview())
    setSubmitMessage('')
    setSelectedTeacherId('')
  }, [open])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setTeacherLoading(true)

    void fetchDiagnoseTeacherOptions()
      .then((result) => {
        if (cancelled) return
        setTeacherOptions(result)
      })
      .catch(() => {
        if (cancelled) return
        setTeacherOptions([])
      })
      .finally(() => {
        if (!cancelled) {
          setTeacherLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setSelectedTeacherId(selectedItem?.preferredTeacherId || '')
  }, [open, selectedItem?.preferredTeacherId, selectedItem?.studentId])

  useEffect(() => {
    if (!previewDialogOpen || !dialogOptionId || dialogQuestionIds.length === 0) {
      setPreview(createEmptyPreview())
      return
    }

    let cancelled = false
    setPreview({ loading: true, error: '', bundle: null })

    void previewDiagnosePaperBundle(dialogOptionId, dialogQuestionIds)
      .then((bundle) => {
        if (!cancelled) {
          setPreview({
            loading: false,
            error: '',
            bundle,
          })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreview({
            loading: false,
            error: error instanceof Error ? error.message : '生成预览失败',
            bundle: null,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [dialogOptionId, dialogQuestionIds, previewDialogOpen])

  function openPreviewDialog(optionId: DiagnoseOptionId) {
    setSelectedOption(optionId)
    setDialogOptionId(optionId)
    setPreviewMode('paper')
    setSubmitMessage('')
  }

  function closePreviewDialog() {
    setDialogOptionId(null)
    setPreviewMode('paper')
    setPreview(createEmptyPreview())
  }

  function addCustomQuestion(questionId: string) {
    setCustomQuestionIds((current) => (
      current.includes(questionId) ? current : [...current, questionId]
    ))
  }

  function removeCustomQuestion(questionId: string) {
    setCustomQuestionIds((current) => current.filter((item) => item !== questionId))
  }

  function moveCustomQuestion(index: number, direction: -1 | 1) {
    setCustomQuestionIds((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  async function handleSubmit() {
    if (!selectedItem?.studentId || !selectedItem.pointName || !dialogOptionId) return
    if (!dialogQuestionIds.length) return
    if (!selectedTeacherId) {
      setSubmitMessage('请先选择诊断老师')
      return
    }

    setSubmitting(true)
    setSubmitMessage('')
    try {
      // 第 1 步：为学生分配诊断课和诊断老师
      try {
        await api.post(`/api/teacher/students/${selectedItem.studentId}/course-assignments`, {
          courseKind: 'special',
          specialType: 'diagnose',
          teacherId: Number(selectedTeacherId),
        })
      } catch (error) {
        log.warn('diagnose.step1.failed', {
          studentId: selectedItem.studentId,
          teacherId: selectedTeacherId,
          message: error instanceof Error ? error.message : String(error),
        })
        toast.error('第 1 步（分配诊断老师）失败，试卷尚未生成。请稍后点击“确认同步”重试。')
        throw error
      }

      // 第 2 步：保存诊断卷组卷结果（第 1 步已在后端生效，无自动回滚接口）
      try {
        await saveDiagnosePaperBundle(
          selectedItem.studentId,
          selectedItem.pointName,
          dialogOptionId,
          dialogQuestionIds,
        )
      } catch (error) {
        log.warn('diagnose.step2.failed', {
          studentId: selectedItem.studentId,
          pointName: selectedItem.pointName,
          optionId: dialogOptionId,
          questionIds: dialogQuestionIds,
          message: error instanceof Error ? error.message : String(error),
        })
        toast.error('第 2 步（保存诊断卷）失败：诊断老师已分配成功，但试卷未同步。请点击“确认同步”重试本步；若反复失败请联系管理员。')
        throw error
      }

      // 两步均已提交成功，剩下的只是本地列表刷新，失败不应误报为提交失败
      try {
        await Promise.all([
          loadTaskCounts(),
          loadTaskItems(),
          loadStudentInfo(selectedItem.studentId),
        ])
      } catch (error) {
        log.warn('diagnose.refresh.failed', {
          studentId: selectedItem.studentId,
          message: error instanceof Error ? error.message : String(error),
        })
        toast.error('诊断卷已保存成功，但刷新任务列表失败，请刷新页面查看最新状态。')
      }

      refreshLearningPath()
      openStudentProfile(selectedItem.studentId, selectedItem.pointName)
      setSubmitMessage('已同步到老师端学生详情和学生学习端。')
      closePreviewDialog()
      closeTaskModal()
    } catch (error) {
      // 弹窗和预览弹窗保持打开，按钮已在 finally 中恢复，可直接重试
      setSubmitMessage(error instanceof Error ? error.message : '提交失败，请重试。')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={closeTaskModal}
    >
      <div className="absolute inset-0 bg-black/35" />
      <div
        className="relative flex max-h-[88vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-lg lg:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex w-full shrink-0 flex-col border-b border-[var(--color-border)] bg-[var(--color-bg-left)] lg:w-[320px] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">待配诊断卷</div>
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
              先选择学生，再选择省份或版本。
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-auto p-3">
            {mergedItems.length > 0 ? (
              mergedItems.map((item) => (
                <StudentListItem
                  key={item.id}
                  item={item}
                  active={item.studentId === selectedItem?.studentId}
                  onClick={() => setSelectedStudentId(item.studentId || '')}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
                当前没有待配诊断卷的学生。
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <div className="text-base font-semibold text-[var(--color-text-primary)]">
                {selectedItem ? `${selectedItem.name} · ${selectedItem.pointName}` : '诊断卷配置'}
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                这里只负责选学生和选版本。选完后会打开新的预览确认弹窗。
              </div>
            </div>
            <button
              type="button"
              onClick={closeTaskModal}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              关闭
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="w-full max-w-[720px]">
              <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-left)] p-6">
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">省份/版本选择</div>
                <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                  点击版本后，会进入新的弹窗查看试卷预览并做最终确认。
                </div>
                <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  <div className="text-xs font-semibold text-[var(--color-text-secondary)]">诊断老师</div>
                  <select
                    value={selectedTeacherId}
                    onChange={(event) => setSelectedTeacherId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="">{teacherLoading ? '加载老师中...' : '请选择诊断老师'}</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}{teacher.title ? ` / ${teacher.title}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-[11px] leading-5 text-[var(--color-text-muted)]">
                    {selectedTeacher
                      ? `当前将由 ${selectedTeacher.name}${selectedTeacher.title ? `（${selectedTeacher.title}）` : ''} 负责该学生的诊断课和配卷。`
                      : '配卷前需要先确认诊断老师，保存后会同步更新学生档案。'}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {DIAGNOSE_PAPER_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => openPreviewDialog(option.id)}
                      className={[
                        'rounded-2xl border px-4 py-4 text-left transition-colors',
                        selectedOption === option.id
                          ? 'border-[var(--color-primary)] bg-white'
                          : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{option.label}</div>
                        {selectedOption === option.id ? (
                          <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
                            当前选择
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                {submitMessage || '选择任意省份或版本后，会打开新的确认弹窗；试卷预览不再放在当前界面。'}
              </div>

              {activeOption ? (
                <div className="mt-4 text-xs text-[var(--color-text-muted)]">
                  最近一次选择：{activeOption.label}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {previewDialogOpen && dialogOption ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 py-6"
            onClick={closePreviewDialog}
          >
            <div
              className="flex max-h-[92vh] w-[min(1280px,96vw)] flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl xl:flex-row"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex w-full shrink-0 flex-col border-b border-[var(--color-border)] bg-[var(--color-bg-left)] xl:w-[400px] xl:border-b-0 xl:border-r">
                <div className="border-b border-[var(--color-border)] px-5 py-5">
                  <div className="text-lg font-semibold text-[var(--color-text-primary)]">确认诊断卷配置</div>
                  <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                    当前版本：{dialogOption.label}
                  </div>
                  <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-[var(--color-text-primary)]">
                    {selectedItem ? `${selectedItem.name} · ${selectedItem.pointName}` : '未选择学生'}
                  </div>
                </div>

                <div className="flex-1 overflow-auto px-5 py-5">
                  {dialogOptionId === 'custom' ? (
                    <div className="space-y-5">
                      <div>
                        <div className="text-xs font-semibold text-[var(--color-text-primary)]">候选题库</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {DIAGNOSE_CUSTOM_QUESTION_IDS.map((questionId) => {
                            const question = resolveDiagnoseQuestions([questionId])[0]
                            if (!question) return null
                            const selected = customQuestionIds.includes(questionId)
                            return (
                              <button
                                key={questionId}
                                type="button"
                                onClick={() => (selected ? removeCustomQuestion(questionId) : addCustomQuestion(questionId))}
                                className={[
                                  'rounded-full border px-3 py-1.5 text-xs transition-colors',
                                  selected
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                                    : 'border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                                ].join(' ')}
                              >
                                {question.title}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-[var(--color-text-primary)]">当前组卷顺序</div>
                        <div className="mt-2 space-y-2">
                          {dialogQuestions.length > 0 ? dialogQuestions.map((question, index) => (
                            <div key={`${question.id}_${index}`} className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">{index + 1}. {question.title}</div>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveCustomQuestion(index, -1)}
                                    className="rounded border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                                  >
                                    上移
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveCustomQuestion(index, 1)}
                                    className="rounded border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                                  >
                                    下移
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeCustomQuestion(question.id)}
                                    className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-500 hover:bg-red-50"
                                  >
                                    移除
                                  </button>
                                </div>
                              </div>
                            </div>
                          )) : (
                            <div className="rounded-xl border border-dashed border-[var(--color-border)] px-3 py-4 text-xs text-[var(--color-text-muted)]">
                              先从上面的候选题库里选择题目。
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-semibold text-[var(--color-text-primary)]">同步到学生端的解析课</div>
                        <div className="mt-2 rounded-2xl border border-[var(--color-border)] bg-white px-3 py-3">
                          <div className="space-y-2">
                            {(preview.bundle?.videoLessons || dialogQuestions).map((question, index) => (
                            <div key={`${question.id}_lesson`} className="text-xs text-[var(--color-text-primary)]">
                              {index + 1}. {question.title}
                            </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--color-border)] px-5 py-4">
                  <div className="mb-3 text-xs text-[var(--color-text-secondary)]">
                    {submitMessage ? (
                      <span className="text-red-500">{submitMessage}</span>
                    ) : (
                      '确认无误后再同步到学生端。'
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={closePreviewDialog}
                      className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    >
                      返回
                    </button>
                    <button
                      type="button"
                      disabled={!selectedItem || !selectedTeacherId || !dialogQuestions.length || preview.loading || submitting}
                      onClick={() => void handleSubmit()}
                      className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? '提交中...' : '确认同步'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-left)] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-text-primary)]">试卷预览</div>
                      <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                        {dialogOption.label} · 共 {dialogQuestions.length} 题
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white p-1">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('paper')}
                        className={[
                          'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                          previewMode === 'paper'
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]',
                        ].join(' ')}
                      >
                        试卷
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('answer')}
                        className={[
                          'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                          previewMode === 'answer'
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]',
                        ].join(' ')}
                      >
                        答案
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--color-border)]">
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {previewMode === 'paper' ? '诊断试卷预览' : '参考答案预览'}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                        {previewMode === 'paper' ? '确认题目内容与顺序。' : '确认合并后的答案 PDF。'}
                      </div>
                    </div>
                  </div>
                  <div className="min-h-[420px] flex-1 bg-[var(--color-bg-left)]">
                    {preview.loading ? (
                      <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]">正在生成预览...</div>
                    ) : preview.error ? (
                      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-red-500">{preview.error}</div>
                    ) : previewMode === 'paper' && preview.bundle?.paperUrl ? (
                      <iframe title="诊断试卷预览" src={resolveAssetUrl(preview.bundle.paperUrl)} className="h-full w-full" />
                    ) : previewMode === 'answer' && preview.bundle?.answerUrl ? (
                      <iframe title="参考答案预览" src={resolveAssetUrl(preview.bundle.answerUrl)} className="h-full w-full" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]">当前版本暂时没有可展示的预览。</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
