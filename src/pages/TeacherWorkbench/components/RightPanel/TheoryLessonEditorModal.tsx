import { useEffect, useId, useState } from 'react'
import {
  fetchStudentTheoryConfig,
  fetchStudentLearningPath,
  saveStudentTheoryConfig,
  uploadPdf,
  type TheoryLessonConfigItem,
} from '../../api/learningPath'
import {
  CHECKPOINT_ASSIGNMENT_LIBRARY,
  type AssignmentTheoryRow,
} from '../LeftPanel/assignmentLibrary.generated'
import { isTheoryVisibleForProvince } from '../LeftPanel/assignmentRuleUtils'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'

const log = logger.child('theoryLesson')

type TheoryLessonEditorModalProps = {
  studentId: string
  pointName: string
  onClose: () => void
  onSaved: () => void
}

type EditableTheoryRound = {
  id: string
  title: string
  knowledgeTitle: string
  noteText: string
  handoutPdf: string
  theoryVideoId: string
  homeworkPdf: string
  referenceAnswerPdf: string
  explainVideoId: string
}

type UploadFieldKey =
  | 'handoutPdf'
  | 'homeworkPdf'
  | 'referenceAnswerPdf'

type LibraryRoundOption = {
  id: string
  label: string
  round: EditableTheoryRound
}

type TheoryLessonLike = {
  title?: string
  noteText?: string
  knowledgeTitle?: string
  videoId?: string
  preClassUrl?: string
  analysisUrl?: string
  answerUrl?: string
}

function createRoundId(prefix = 'round') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeRoundTitle(rawTitle = '') {
  const source = String(rawTitle || '').trim()
  if (!source) return ''

  let normalized = source
    .replace(/[([（【]?\s*(?:理论方法|作业讲解|方法讲解|理论课程)\s*[)）\]】]?/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const parts = normalized.split(/\s*和\s*/).map((part) => part.trim()).filter(Boolean)
  if (parts.length > 1 && parts.every((part) => part === parts[0])) {
    normalized = parts[0]
  }

  return normalized
}

function isExplainLesson(lesson: TheoryLessonLike) {
  return !!String(lesson.answerUrl || lesson.analysisUrl || '').trim()
}

function buildRoundGroups(lessons: TheoryLessonLike[] = []) {
  const safeLessons = Array.isArray(lessons) ? lessons.filter(Boolean) : []
  const groupedRounds: Array<{ title: string; rows: TheoryLessonLike[] }> = []
  let currentGroup: { title: string; rows: TheoryLessonLike[] } | null = null
  let previousTitle = ''

  safeLessons.forEach((lesson, index) => {
    const rawTitle = String(
      lesson.title
      || `理论课 ${index + 1}`,
    ).trim()
    const hasOwnTitle = !!String(lesson.title || '').trim()
    const title = normalizeRoundTitle(hasOwnTitle ? rawTitle : '') || previousTitle || rawTitle

    if (!currentGroup || currentGroup.title !== title) {
      currentGroup = { title, rows: [] }
      groupedRounds.push(currentGroup)
    }

    currentGroup.rows.push(lesson)
    previousTitle = title
  })

  const pairedGroups = groupedRounds.flatMap((group) => {
    const nextGroups: Array<{ title: string; rows: TheoryLessonLike[] }> = []
    let currentRows: TheoryLessonLike[] = []

    group.rows.forEach((lesson) => {
      const explainLesson = isExplainLesson(lesson)

      if (explainLesson) {
        if (!currentRows.length) {
          currentRows = [lesson]
        } else if (currentRows.some((item) => isExplainLesson(item))) {
          nextGroups.push({ title: group.title, rows: currentRows })
          currentRows = [lesson]
        } else {
          currentRows.push(lesson)
          nextGroups.push({ title: group.title, rows: currentRows })
          currentRows = []
        }
        return
      }

      if (!currentRows.length) {
        currentRows = [lesson]
        return
      }

      if (
        currentRows.some((item) => !isExplainLesson(item))
        && !currentRows.some((item) => isExplainLesson(item))
      ) {
        nextGroups.push({ title: group.title, rows: currentRows })
        currentRows = [lesson]
        return
      }

      if (currentRows.some((item) => isExplainLesson(item))) {
        nextGroups.push({ title: group.title, rows: currentRows })
        currentRows = [lesson]
        return
      }

      currentRows = [lesson]
    })

    if (currentRows.length) {
      nextGroups.push({ title: group.title, rows: currentRows })
    }

    return nextGroups
  })

  return pairedGroups.map((group) => {
    const explainRows = group.rows.filter((lesson) => isExplainLesson(lesson))
    const methodRows = group.rows.filter((lesson) => !isExplainLesson(lesson))
    return {
      title: group.title,
      methodRow: methodRows[0] || null,
      explainRow: explainRows[0] || null,
    }
  })
}

function buildEditableRounds(lessons: TheoryLessonLike[] = []): EditableTheoryRound[] {
  return buildRoundGroups(lessons).map((group, index) => {
    const methodRow = group.methodRow || {}
    const explainRow = group.explainRow || {}
    const contextRow = group.methodRow || group.explainRow || {}

    return {
      id: createRoundId(`existing_${index + 1}`),
      title: group.title || `第${index + 1}轮`,
      knowledgeTitle: String(contextRow.knowledgeTitle || '').trim(),
      noteText: String(contextRow.noteText || '').trim(),
      handoutPdf: String(methodRow.preClassUrl || '').trim(),
      theoryVideoId: String(methodRow.videoId || '').trim(),
      homeworkPdf: String(explainRow.preClassUrl || '').trim(),
      referenceAnswerPdf: String(explainRow.answerUrl || explainRow.analysisUrl || '').trim(),
      explainVideoId: String(explainRow.videoId || '').trim(),
    }
  })
}

function buildLibraryRoundOptions(pointName: string, selectedProvince = ''): LibraryRoundOption[] {
  const library = CHECKPOINT_ASSIGNMENT_LIBRARY.find((item) => item.checkpointName === pointName)
  if (!library) return []

  const theoryRows = library.theoryRows
    .filter((row) => matchesProvince(row, selectedProvince))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    .map((row) => ({
      title: row.theoryTitle,
      videoId: row.videoId,
      preClassUrl: row.preClassUrl,
      analysisUrl: row.analysisUrl,
      answerUrl: row.analysisUrl,
      knowledgeTitle: row.knowledgePoint,
      noteText: row.noteText,
    }))

  return buildEditableRounds(theoryRows).map((round, index) => ({
    id: `library_${index + 1}_${round.title}`,
    label: round.title,
    round: {
      ...round,
      id: `library_seed_${index + 1}`,
    },
  }))
}

function matchesProvince(row: AssignmentTheoryRow, selectedProvince = '') {
  return isTheoryVisibleForProvince(row, selectedProvince)
}

function flattenRounds(rounds: EditableTheoryRound[]): TheoryLessonConfigItem[] {
  const lessons: TheoryLessonConfigItem[] = []

  rounds.forEach((round, index) => {
    const title = String(round.title || '').trim() || `第${index + 1}轮`
    const knowledgeTitle = String(round.knowledgeTitle || '').trim()
    const noteText = String(round.noteText || '').trim()
    const methodHasContent = !!(round.handoutPdf || round.theoryVideoId || knowledgeTitle || noteText)
    const explainHasContent = !!(round.homeworkPdf || round.referenceAnswerPdf || round.explainVideoId || knowledgeTitle || noteText)

    if (methodHasContent) {
      lessons.push({
        id: `${round.id}_method`,
        title: `${title}【理论方法】`,
        videoId: String(round.theoryVideoId || '').trim(),
        preClassUrl: String(round.handoutPdf || '').trim(),
        analysisUrl: '',
        answerUrl: '',
        knowledgeTitle,
        learningStatusRaw: '必学',
        courseStatus: '已有',
        noteText,
      })
    }

    if (explainHasContent) {
      const referenceAnswerPdf = String(round.referenceAnswerPdf || '').trim()
      lessons.push({
        id: `${round.id}_explain`,
        title: `${title}【作业讲解】`,
        videoId: String(round.explainVideoId || '').trim(),
        preClassUrl: String(round.homeworkPdf || '').trim(),
        analysisUrl: referenceAnswerPdf,
        answerUrl: referenceAnswerPdf,
        knowledgeTitle,
        learningStatusRaw: '必学',
        courseStatus: '已有',
        noteText,
      })
    }
  })

  return lessons.filter((lesson) => (
    lesson.videoId
    || lesson.preClassUrl
    || lesson.analysisUrl
    || lesson.answerUrl
  ))
}

function isTextOnlyRound(round: EditableTheoryRound) {
  return ![
    round.handoutPdf,
    round.theoryVideoId,
    round.homeworkPdf,
    round.referenceAnswerPdf,
    round.explainVideoId,
  ].some((value) => String(value || '').trim())
}

function extractRoundsFromLearningPath(stages: Array<Record<string, unknown>> = []): EditableTheoryRound[] {
  const theoryStage = stages.find((stage) => String(stage?.stageKey || '').trim() === 'theory')
  const groups = Array.isArray(theoryStage?.groups) ? theoryStage.groups as Array<Record<string, unknown>> : []

  return groups
    .filter((group) => {
      const items = Array.isArray(group?.items) ? group.items as Array<Record<string, unknown>> : []
      return items.some((item) => /^theory_round_\d+_/.test(String(item?.id || '').trim()))
    })
    .map((group, index) => {
      const items = Array.isArray(group?.items) ? group.items as Array<Record<string, unknown>> : []
      const findItem = (pattern: RegExp) => items.find((item) => pattern.test(String(item?.id || '').trim())) || null
      const recordedItem = findItem(/^theory_round_\d+_recorded$/)
      const handoutItem = findItem(/^theory_round_\d+_handout$/)
      const homeworkItem = findItem(/^theory_round_\d+_homework_pdf$/)
      const referenceAnswerItem = findItem(/^theory_round_\d+_reference_answer$/)
      const explainVideoItem = findItem(/^theory_round_\d+_explain_video$/)
      const lessonContext = recordedItem && typeof recordedItem.lessonContext === 'object'
        ? recordedItem.lessonContext as Record<string, unknown>
        : {}
      const recordedResource = recordedItem && typeof recordedItem.resource === 'object'
        ? recordedItem.resource as Record<string, unknown>
        : {}
      const handoutResource = handoutItem && typeof handoutItem.resource === 'object'
        ? handoutItem.resource as Record<string, unknown>
        : {}
      const homeworkResource = homeworkItem && typeof homeworkItem.resource === 'object'
        ? homeworkItem.resource as Record<string, unknown>
        : {}
      const referenceAnswerResource = referenceAnswerItem && typeof referenceAnswerItem.resource === 'object'
        ? referenceAnswerItem.resource as Record<string, unknown>
        : {}
      const explainVideoResource = explainVideoItem && typeof explainVideoItem.resource === 'object'
        ? explainVideoItem.resource as Record<string, unknown>
        : {}

      return {
        id: createRoundId(`payload_${index + 1}`),
        title: String(lessonContext.lessonTitle || group?.title || `第${index + 1}轮`).trim(),
        knowledgeTitle: String(lessonContext.knowledgeTitle || '').trim(),
        noteText: String(lessonContext.questionTitle || '').trim(),
        handoutPdf: String(handoutResource.url || '').trim(),
        theoryVideoId: String(recordedResource.videoId || '').trim(),
        homeworkPdf: String(homeworkResource.url || '').trim(),
        referenceAnswerPdf: String(referenceAnswerResource.url || '').trim(),
        explainVideoId: String(explainVideoResource.videoId || '').trim(),
      }
    })
    .filter((round) => (
      round.handoutPdf
      || round.theoryVideoId
      || round.homeworkPdf
      || round.referenceAnswerPdf
      || round.explainVideoId
    ))
}

function PdfInput({
  label,
  value,
  uploadInputId,
  uploading,
  onChange,
  onUpload,
}: {
  label: string
  value: string
  uploadInputId: string
  uploading: boolean
  onChange: (value: string) => void
  onUpload: (file: File) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-[var(--color-text-secondary)]">{label}</div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`填写${label}链接`}
          className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
        />
        <label
          htmlFor={uploadInputId}
          className={[
            'inline-flex shrink-0 cursor-pointer items-center rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
            uploading
              ? 'border-[var(--color-border)] bg-[var(--color-bg-left)] text-[var(--color-text-muted)]'
              : 'border-[var(--color-primary)]/20 bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:opacity-90',
          ].join(' ')}
        >
          {uploading ? '上传中...' : '上传 PDF'}
        </label>
        <input
          id={uploadInputId}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              onUpload(file)
            }
            event.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

export function TheoryLessonEditorModal({
  studentId,
  pointName,
  onClose,
  onSaved,
}: TheoryLessonEditorModalProps) {
  const uploadPrefix = useId()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [rounds, setRounds] = useState<EditableTheoryRound[]>([])
  const [province, setProvince] = useState('')
  const [provinceLabel, setProvinceLabel] = useState('')
  const [libraryCandidateId, setLibraryCandidateId] = useState('')
  const [uploadingKey, setUploadingKey] = useState('')
  const [expandedRoundId, setExpandedRoundId] = useState('')
  const [addingOpen, setAddingOpen] = useState(false)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setErrorMessage('')
      try {
        const [payload, learningPathPayload] = await Promise.all([
          fetchStudentTheoryConfig(studentId, pointName),
          fetchStudentLearningPath(studentId, pointName),
        ])
        if (!alive) return

        setProvince(String(payload.province || '').trim())
        setProvinceLabel(String(payload.provinceLabel || '').trim())
        const configuredRounds = buildEditableRounds(payload.theoryLessons || [])
        const fallbackRounds = extractRoundsFromLearningPath(
          Array.isArray(learningPathPayload?.stages)
            ? learningPathPayload.stages as unknown as Array<Record<string, unknown>>
            : [],
        )
        const nextRounds = configuredRounds.length > 0 ? configuredRounds : fallbackRounds
        setRounds(nextRounds)
        setExpandedRoundId(nextRounds[0]?.id || '')
      } catch (error) {
        if (!alive) return
        setErrorMessage(error instanceof Error ? error.message : '读取理论课配置失败')
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [studentId, pointName])

  const libraryOptions = buildLibraryRoundOptions(pointName, province)

  useEffect(() => {
    if (!libraryOptions.length) {
      setLibraryCandidateId('')
      return
    }

    if (!libraryCandidateId || !libraryOptions.some((item) => item.id === libraryCandidateId)) {
      setLibraryCandidateId(libraryOptions[0].id)
    }
  }, [libraryCandidateId, libraryOptions])

  function updateRound(roundId: string, patch: Partial<EditableTheoryRound>) {
    setRounds((current) => current.map((round) => (
      round.id === roundId
        ? { ...round, ...patch }
        : round
    )))
  }

  function moveRound(roundId: string, direction: -1 | 1) {
    setRounds((current) => {
      const index = current.findIndex((round) => round.id === roundId)
      if (index < 0) return current

      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= current.length) return current

      const next = current.slice()
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }

  function addManualRound() {
    const nextId = createRoundId('manual')
    setRounds((current) => current.concat({
      id: nextId,
      title: `第${current.length + 1}轮`,
      knowledgeTitle: '',
      noteText: '',
      handoutPdf: '',
      theoryVideoId: '',
      homeworkPdf: '',
      referenceAnswerPdf: '',
      explainVideoId: '',
    }))
    setExpandedRoundId(nextId)
    setAddingOpen(false)
  }

  function addLibraryRound() {
    const selected = libraryOptions.find((item) => item.id === libraryCandidateId)
    if (!selected) return

    const nextRound = {
      ...selected.round,
      id: createRoundId('library'),
    }
    setRounds((current) => current.concat(nextRound))
    setExpandedRoundId(nextRound.id)
    setAddingOpen(false)
  }

  async function handleUpload(roundId: string, field: UploadFieldKey, file: File) {
    const uploadKey = `${roundId}:${field}`
    setUploadingKey(uploadKey)
    setErrorMessage('')

    try {
      const url = await uploadPdf(file)
      updateRound(roundId, { [field]: url } as Partial<EditableTheoryRound>)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'PDF 上传失败')
    } finally {
      setUploadingKey('')
    }
  }

  async function handleSave() {
    const discardedCount = rounds.filter(isTextOnlyRound).length
    if (discardedCount > 0) {
      toast.info('仅含文字、未配置题目的轮次将不会保存')
      log.warn('theoryRound.discarded', { count: discardedCount })
    }

    setSaving(true)
    setErrorMessage('')

    try {
      await saveStudentTheoryConfig(studentId, {
        pointName,
        theoryLessons: flattenRounds(rounds),
      })
      onSaved()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存理论课配置失败')
    } finally {
      setSaving(false)
    }
  }

function getRoundDisplayTitle(round: EditableTheoryRound, index: number) {
    const title = String(round.title || '').trim()
    if (title) return `理论课（${title}）`
    return `理论课（第${index + 1}轮）`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-[#fffdf8] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">编辑多轮理论课</div>
            <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {pointName}
              {provinceLabel ? ` · ${provinceLabel}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            关闭
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-sm text-[var(--color-text-muted)]">正在读取当前卡点理论课配置...</div>
        ) : (
          <>
            <div className="border-b border-[var(--color-border)] bg-white/80 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">当前理论课</div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                    先在这里管理当前卡点的理论课顺序和名称，点具体理论课后在当前窗口展开编辑。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingOpen((current) => !current)}
                  className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary-light)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-opacity hover:opacity-90"
                >
                  添加
                </button>
              </div>
              {addingOpen && (
                <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[#fffaf0] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={libraryCandidateId}
                      onChange={(event) => setLibraryCandidateId(event.target.value)}
                      className="min-w-[260px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                    >
                      {libraryOptions.length ? (
                        libraryOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))
                      ) : (
                        <option value="">当前卡点理论库暂无可选理论课</option>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={addLibraryRound}
                      disabled={!libraryOptions.length}
                      className="rounded-xl border border-[#d5c8a4] bg-[#fbf3de] px-4 py-2 text-sm font-medium text-[#8a632f] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      从理论库添加
                    </button>
                    <button
                      type="button"
                      onClick={addManualRound}
                      className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary-light)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-opacity hover:opacity-90"
                    >
                      手动新增理论课
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                    添加后会出现在当前理论课列表里，你可以再调整顺序，或点开继续编辑 5 个内容。
                  </div>
                </div>
              )}
              {errorMessage ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{errorMessage}</div>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {rounds.length ? (
                <div className="space-y-3">
                  {rounds.map((round, index) => (
                    <div key={round.id} className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setExpandedRoundId((current) => current === round.id ? '' : round.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-[var(--color-text-muted)]">{index + 1}.</span>
                            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                              {getRoundDisplayTitle(round, index)}
                            </span>
                          </div>
                        </button>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => moveRound(round.id, -1)}
                            disabled={index === 0}
                            className="rounded-xl border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            上移
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRound(round.id, 1)}
                            disabled={index === rounds.length - 1}
                            className="rounded-xl border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            下移
                          </button>
                          <button
                            type="button"
                            onClick={() => setRounds((current) => current.filter((item) => item.id !== round.id))}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 transition-opacity hover:opacity-90"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      {expandedRoundId === round.id && (
                        <div className="border-t border-[var(--color-border)] px-5 py-5">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <PdfInput
                              label="课前讲义"
                              value={round.handoutPdf}
                              uploadInputId={`${uploadPrefix}_${round.id}_handout`}
                              uploading={uploadingKey === `${round.id}:handoutPdf`}
                              onChange={(value) => updateRound(round.id, { handoutPdf: value })}
                              onUpload={(file) => void handleUpload(round.id, 'handoutPdf', file)}
                            />
                            <div className="space-y-2">
                              <div className="text-[11px] font-medium text-[var(--color-text-secondary)]">理论课视频 ID</div>
                              <input
                                value={round.theoryVideoId}
                                onChange={(event) => updateRound(round.id, { theoryVideoId: event.target.value })}
                                placeholder="填写保利威视频 ID"
                                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                              />
                            </div>
                            <PdfInput
                              label="课后作业"
                              value={round.homeworkPdf}
                              uploadInputId={`${uploadPrefix}_${round.id}_homework`}
                              uploading={uploadingKey === `${round.id}:homeworkPdf`}
                              onChange={(value) => updateRound(round.id, { homeworkPdf: value })}
                              onUpload={(file) => void handleUpload(round.id, 'homeworkPdf', file)}
                            />
                            <PdfInput
                              label="参考答案"
                              value={round.referenceAnswerPdf}
                              uploadInputId={`${uploadPrefix}_${round.id}_answer`}
                              uploading={uploadingKey === `${round.id}:referenceAnswerPdf`}
                              onChange={(value) => updateRound(round.id, { referenceAnswerPdf: value })}
                              onUpload={(file) => void handleUpload(round.id, 'referenceAnswerPdf', file)}
                            />
                            <div className="space-y-2 lg:col-span-2">
                              <div className="text-[11px] font-medium text-[var(--color-text-secondary)]">视频讲解 ID</div>
                              <input
                                value={round.explainVideoId}
                                onChange={(event) => updateRound(round.id, { explainVideoId: event.target.value })}
                                placeholder="填写视频讲解的保利威视频 ID"
                                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-white px-6 py-10 text-center text-sm text-[var(--color-text-muted)]">
                  当前卡点还没有理论课。可以从理论库添加，也可以手动新增。
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !!uploadingKey}
                className="rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '保存中...' : '统一保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
