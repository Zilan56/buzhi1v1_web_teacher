import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LEARNING_PATH_STAGE_ORDER,
  type LearningPathItem,
  type LearningPathStage,
  type LearningPathItemStatus,
  type LearningPathStageKey,
  type LearningPathTimeType,
} from '../../config/studentLearningPath'
import { fetchStudentLearningPath, updateStudentLearningPathTask, uploadPdf } from '../../api/learningPath'
import {
  fetchSubmissionFileUrl,
  uploadReviewedSubmissionPdf,
} from '../../api/submissions'
import { api } from '../../../../lib/api'
import { apiUrl } from '../../../../lib/apiBase'
import { logger } from '../../../../lib/logger'
import { useWorkbenchStore } from '../../store/workbenchStore'

const log = logger.child('learningPath')

const statusStyles: Record<LearningPathItemStatus, { dot: string }> = {
  done:    { dot: 'bg-green-500' },
  current: { dot: 'bg-[var(--color-primary)]' },
  pending: { dot: 'bg-gray-300' },
}

type StageDisplayEntry =
  | { kind: 'item'; item: LearningPathItem }
  | { kind: 'group'; id: string; title: string; status: LearningPathItemStatus; items: LearningPathItem[] }

type StageCardEntry =
  | { kind: 'items'; id: string; items: LearningPathItem[] }
  | Extract<StageDisplayEntry, { kind: 'group' }>

const DIAGNOSE_GROUP_BLOCKS = [
  {
    key: 'paper',
    title: '试卷',
    itemIds: ['diagnose_paper', 'diagnose_paper_upload', 'diagnose_analysis_video', 'diagnose_reference_answer', 'diagnose_paper_feedback'],
  },
  {
    key: 'course',
    title: '课程',
    itemIds: ['diagnose_live', 'diagnose_feedback', 'diagnose_replay', 'diagnose_handout'],
  },
] as const

const DIAGNOSE_GROUP_MAP = DIAGNOSE_GROUP_BLOCKS.reduce<Record<string, typeof DIAGNOSE_GROUP_BLOCKS[number]>>((result, group) => {
  group.itemIds.forEach((itemId) => {
    result[itemId] = group
  })
  return result
}, {})

function looksLikeRemoteUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(String(value || '').trim())
}

function resolveAssetUrl(url = ''): string {
  if (!url) return ''
  return looksLikeRemoteUrl(url) ? url : apiUrl(url)
}

function extractPolyvVideoId(value: string): string {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''

  if (!looksLikeRemoteUrl(rawValue)) {
    return rawValue
  }

  try {
    const normalizedUrl = rawValue.startsWith('//') ? `https:${rawValue}` : rawValue
    const parsedUrl = new URL(normalizedUrl)
    const searchKeys = ['vid', 'videoId', 'video_id']

    for (const key of searchKeys) {
      const matchedValue = String(parsedUrl.searchParams.get(key) || '').trim()
      if (matchedValue) {
        return matchedValue
      }
    }

    const pathMatch = parsedUrl.pathname.match(/\/([A-Za-z0-9_-]{6,})(?:\.html)?\/?$/)
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1]
    }
  } catch (error) {
    log.warn('learningPath.polyvUrlParseFailed', {
      message: error instanceof Error ? error.message : String(error),
      url: rawValue,
    })
  }

  const queryMatch = rawValue.match(/[?&#](?:vid|videoId|video_id)=([^&#]+)/i)
  return queryMatch && queryMatch[1] ? decodeURIComponent(queryMatch[1]).trim() : ''
}

function getItemsSummaryStatus(items: LearningPathItem[]): LearningPathItemStatus {
  if (items.length > 0 && items.every((item) => item.status === 'done')) return 'done'
  if (items.some((item) => item.status === 'current')) return 'current'
  return 'pending'
}

function isDeprecatedTheoryHandoutItem(item: LearningPathItem): boolean {
  const itemId = String(item.id || '').trim()
  return itemId === 'theory_handout'
}

function normalizeTheoryGroup(group: LearningPathStage['groups'][number]): LearningPathStage['groups'][number] {
  const items = (Array.isArray(group.items) ? group.items : []).filter((item) => !isDeprecatedTheoryHandoutItem(item))
  const isConsensusGroup = items.some((item) => String(item.id || '').trim() === 'theory_consensus_live')

  if (!isConsensusGroup) {
    return {
      ...group,
      items,
    }
  }

  return {
    ...group,
    title: '1v1共识',
    items,
  }
}

function buildDiagnoseDisplayEntries(items: LearningPathItem[]): StageDisplayEntry[] {
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const addedGroups = new Set<string>()

  return items.reduce<StageDisplayEntry[]>((result, item) => {
    const group = DIAGNOSE_GROUP_MAP[item.id]
    if (!group) {
      result.push({ kind: 'item', item })
      return result
    }

    if (addedGroups.has(group.key)) {
      return result
    }

    const groupItems = group.itemIds
      .map((itemId) => itemMap.get(itemId))
      .filter((groupItem): groupItem is LearningPathItem => !!groupItem)

    result.push({
      kind: 'group',
      id: `diagnose_group_${group.key}`,
      title: group.title,
      status: getItemsSummaryStatus(groupItems),
      items: groupItems,
    })
    addedGroups.add(group.key)
    return result
  }, [])
}

function buildIndexedRoundTitle(roundNumber: number, name = ''): string {
  const safeName = String(name || '').trim()
  return safeName ? `${roundNumber}. ${safeName}` : `第${roundNumber}轮`
}

function getTrainingRoundDisplayName(items: LearningPathItem[]): string {
  const preferredIds = ['question', 'explain_video', 'analysis']

  for (const suffix of preferredIds) {
    const matchedItem = items.find((item) => String(item.id || '').endsWith(`_${suffix}`))
    const resourceTitle = String(matchedItem?.resource?.title || '').trim()
    if (resourceTitle) {
      return resourceTitle
    }
  }

  for (const item of items) {
    const resourceTitle = String(item.resource?.title || '').trim()
    if (resourceTitle) {
      return resourceTitle
    }
  }

  return ''
}

function buildTrainingDisplayEntries(items: LearningPathItem[]): StageDisplayEntry[] {
  const rounds = new Map<number, LearningPathItem[]>()
  const ungroupedItems: LearningPathItem[] = []

  items.forEach((item) => {
    const matched = /^training_round_(\d+)_/.exec(String(item.id || ''))
    if (!matched) {
      ungroupedItems.push(item)
      return
    }

    const roundNumber = Number(matched[1] || 0)
    const roundItems = rounds.get(roundNumber) || []
    roundItems.push(item)
    rounds.set(roundNumber, roundItems)
  })

  const entries: StageDisplayEntry[] = ungroupedItems.map((item) => ({ kind: 'item', item }))
  const orderedRounds = [...rounds.keys()].sort((left, right) => left - right)

  orderedRounds.forEach((roundNumber) => {
    const roundItems = sortTrainingRoundItems(rounds.get(roundNumber) || [])
    if (!roundItems.length) return

    entries.push({
      kind: 'group',
      id: `training_group_round_${roundNumber}`,
      title: buildIndexedRoundTitle(roundNumber, getTrainingRoundDisplayName(roundItems)),
      status: getItemsSummaryStatus(roundItems),
      items: roundItems,
    })
  })

  return entries
}

function sortTrainingRoundItems(items: LearningPathItem[]): LearningPathItem[] {
  const orderMap = new Map([
    ['question', 0],
    ['explain_video', 1],
    ['analysis', 2],
    ['homework_upload', 3],
    ['homework_feedback', 4],
    ['reflection_upload', 5],
    ['reflection_feedback', 6],
  ])

  return [...items].sort((left, right) => {
    const leftSuffix = String(left.id || '').replace(/^training_round_\d+_/, '')
    const rightSuffix = String(right.id || '').replace(/^training_round_\d+_/, '')
    const leftOrder = orderMap.get(leftSuffix) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = orderMap.get(rightSuffix) ?? Number.MAX_SAFE_INTEGER

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    return String(left.id || '').localeCompare(String(right.id || ''))
  })
}

function normalizeTrainingExplainVideoItem(item: LearningPathItem): LearningPathItem {
  const itemId = String(item.id || '').trim()
  if (!/^training_round_\d+_explain_video$/.test(itemId)) {
    return item
  }

  return {
    ...item,
    title: '视频讲解',
  }
}

function buildTheorySections(groups: LearningPathStage['groups'] = []) {
  const normalizedGroups = groups.map((group) => normalizeTheoryGroup(group))
  const consensusGroups: LearningPathStage['groups'] = []
  const lessonGroups: LearningPathStage['groups'] = []
  const correctionGroups: LearningPathStage['groups'] = []

  normalizedGroups.forEach((group) => {
    const items = group.items || []
    if (items.some((item) => String(item.id || '').trim().startsWith('theory_consensus_'))) {
      consensusGroups.push(group)
      return
    }

    if (items.some((item) => String(item.id || '').trim().startsWith('theory_correction_'))) {
      correctionGroups.push(group)
      return
    }

    lessonGroups.push(group)
  })

  return [
    {
      id: 'theory_section_consensus',
      title: '1v1共识',
      groups: consensusGroups,
      timeTarget: null,
    },
    {
      id: 'theory_section_lessons',
      title: '多轮理论课',
      groups: lessonGroups,
      timeTarget: lessonGroups.length
        ? pickAnchorItem(
            lessonGroups.flatMap((group) => group.items || []),
            ['theory_round_1_recorded', 'theory_mindmap_upload'],
          )
        : null,
    },
    {
      id: 'theory_section_correction',
      title: '1v1纠偏',
      groups: correctionGroups,
      timeTarget: correctionGroups.length
        ? pickAnchorItem(
            correctionGroups.flatMap((group) => group.items || []),
            ['theory_correction_live', 'theory_correction_upload'],
          )
        : null,
    },
  ].filter((section) => section.groups.length > 0)
}
function buildStageCardEntries(entries: StageDisplayEntry[]): StageCardEntry[] {
  const cards: StageCardEntry[] = []
  let pendingItems: LearningPathItem[] = []
  let itemGroupIndex = 0

  function flushPendingItems() {
    if (!pendingItems.length) return
    cards.push({
      kind: 'items',
      id: `stage_items_${itemGroupIndex += 1}`,
      items: pendingItems,
    })
    pendingItems = []
  }

  entries.forEach((entry) => {
    if (entry.kind === 'item') {
      pendingItems.push(entry.item)
      return
    }

    flushPendingItems()
    cards.push(entry)
  })

  flushPendingItems()
  return cards
}

function pickAnchorItem(items: LearningPathItem[], preferredIds: string[] = []): LearningPathItem | null {
  for (const preferredId of preferredIds) {
    const matched = items.find((item) => String(item.id || '').trim() === preferredId)
    if (matched) {
      return matched
    }
  }

  const firstNonTimer = items.find((item) => String(item.actionType || '').trim() !== 'timer')
  return firstNonTimer || items[0] || null
}

function shouldShowItemTime(stageKey: LearningPathStageKey, item: LearningPathItem): boolean {
  const itemId = String(item.id || '').trim()

  if (stageKey === 'diagnose') {
    return ['diagnose_paper_upload', 'diagnose_analysis_video'].includes(itemId)
  }

  return false
}

function shouldShowItemTimeEditor(stageKey: LearningPathStageKey, item: LearningPathItem): boolean {
  return shouldShowItemTime(stageKey, item)
}

function getGroupedEntryTimeTarget(
  stageKey: LearningPathStageKey,
  entry: Extract<StageDisplayEntry, { kind: 'group' }>,
): { label: string; item: LearningPathItem } | null {
  if (stageKey === 'theory') {
    if (entry.id === 'theory_group_lessons') {
      const item = pickAnchorItem(entry.items, ['theory_round_1_recorded', 'theory_consensus_live'])
      return item ? { label: '理论课时间', item } : null
    }

    if (entry.id === 'theory_group_mindmap') {
      const item = pickAnchorItem(entry.items, ['theory_mindmap_upload'])
      return item ? { label: '思维导图时间', item } : null
    }

    if (entry.id === 'theory_group_correction') {
      const item = pickAnchorItem(entry.items, ['theory_correction_live', 'theory_correction_upload'])
      return item ? { label: '1v1纠偏时间', item } : null
    }
  }

  if (stageKey === 'training' && entry.id.startsWith('training_group_round_')) {
    const matched = entry.id.match(/training_group_round_(\d+)/)
    const roundNumber = Number(matched?.[1] || 0)
    const item = pickAnchorItem(entry.items, [
      `training_round_${roundNumber}_homework_upload`,
      `training_round_${roundNumber}_question`,
    ])
    return item ? { label: `${entry.title}时间`, item } : null
  }

  return null
}

function getStageGroupTimeTarget(
  stageKey: LearningPathStageKey,
  items: LearningPathItem[],
): { label: string; item: LearningPathItem } | null {
  if (stageKey === 'exam') {
    const item = pickAnchorItem(items, ['exam_homework_upload', 'exam_question'])
    return item ? { label: '考试时间', item } : null
  }

  return null
}
function getDefaultTimeType(item: LearningPathItem): LearningPathTimeType {
  return ['live', 'replay', 'schedule'].includes(String(item.actionType || '').trim())
    ? 'fixed'
    : 'deadline'
}

function getResolvedTimeType(item: LearningPathItem): LearningPathTimeType {
  return item.timeType === 'fixed' || item.timeType === 'deadline'
    ? item.timeType
    : getDefaultTimeType(item)
}

function buildTimeDisplayLabel(timeType: LearningPathTimeType, timeLabel: string): string {
  const safeTimeLabel = String(timeLabel || '').trim()
  if (!safeTimeLabel) return ''
  return `${timeType === 'deadline' ? '截止时间' : '固定时间'}：${safeTimeLabel}`
}

function getFeedbackTaskIdForUploadTask(taskId = ''): string {
  if (!taskId) return ''

  const fixedMap: Record<string, string> = {
    diagnose_paper_upload: 'diagnose_paper_feedback',
    theory_mindmap_upload: 'theory_mindmap_feedback',
    theory_correction_upload: 'theory_correction_review',
    exam_homework_upload: 'exam_feedback',
    drill_upload: 'drill_ai_review',
  }

  if (fixedMap[taskId]) return fixedMap[taskId]

  const trainingMatch = taskId.match(/^training_round_(\d+)_(homework|reflection)_upload$/)
  if (trainingMatch) {
    return `training_round_${trainingMatch[1]}_${trainingMatch[2]}_feedback`
  }

  const examMatch = taskId.match(/^(exam(?:_round|_remedial)_\d+)_homework_upload$/)
  if (examMatch) {
    return `${examMatch[1]}_feedback`
  }

  return ''
}

function getUploadTaskIdForFeedbackTask(taskId = ''): string {
  if (!taskId) return ''

  const fixedMap: Record<string, string> = {
    diagnose_paper_feedback: 'diagnose_paper_upload',
    theory_mindmap_feedback: 'theory_mindmap_upload',
    theory_correction_review: 'theory_correction_upload',
    exam_feedback: 'exam_homework_upload',
    drill_ai_review: 'drill_upload',
  }

  if (fixedMap[taskId]) return fixedMap[taskId]

  const trainingMatch = taskId.match(/^training_round_(\d+)_(homework|reflection)_feedback$/)
  if (trainingMatch) {
    return `training_round_${trainingMatch[1]}_${trainingMatch[2]}_upload`
  }

  const examMatch = taskId.match(/^(exam(?:_round|_remedial)_\d+)_feedback$/)
  if (examMatch) {
    return `${examMatch[1]}_homework_upload`
  }

  return ''
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readStringField(record: Record<string, unknown> | null, ...keys: string[]): string {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}
// ResourceEditor：任务资源编辑器，支持设置/上传 PDF、配置视频、直播与回放链接
function ResourceEditor({
  item,
  studentId,
  pointName,
  stageKey,
  onSaved,
}: {
  item: LearningPathItem
  studentId: string
  pointName: string
  stageKey: LearningPathStageKey
  onSaved: (item: LearningPathItem, url: string, videoId: string) => Promise<void>
}) {
  const isDocument = item.actionType === 'document'
  const isReport = item.actionType === 'report'
  const isPdf = isDocument || isReport
  const isVideo = item.actionType === 'video'
  const isLive = item.actionType === 'live'
  const isReplay = item.actionType === 'replay'

  const currentUrl = isLive ? (item.resource?.liveUrl ?? item.resource?.url ?? '')
    : isReplay ? (item.resource?.replayUrl ?? item.resource?.url ?? '')
    : (item.resource?.url ?? '')
  const currentVideoId = item.resource?.videoId ?? ''

  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(currentUrl)
  const [videoId, setVideoId] = useState(currentVideoId)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [popupStyle, setPopupStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)
        && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  if (!isPdf && !isVideo && !isLive && !isReplay) return null

  function handleOpen() {
    const initUrl = isLive
      ? (item.resource?.liveUrl ?? item.resource?.url ?? '')
      : isReplay
        ? (item.resource?.replayUrl ?? item.resource?.url ?? '')
        : (item.resource?.url ?? '')
    setUrl(initUrl)
    setVideoId(item.resource?.videoId ?? '')
    setError('')
    setSaved(false)
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPopupStyle({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const trimmedUrl = url.trim()
      const trimmedVideoId = videoId.trim()
      const resolvedVideoId = isVideo ? (trimmedVideoId || extractPolyvVideoId(trimmedUrl)) : trimmedVideoId
      if (isPdf && !trimmedUrl) {
        throw new Error(isReport ? '请先上传报告 PDF' : '请先上传 PDF 或填写文件链接')
      }
      const resource = {
        resourceType: isPdf ? 'pdf' : isVideo ? 'video' : isLive ? 'live' : 'replay',
        title: item.title,
        url: trimmedUrl,
        videoId: resolvedVideoId,
        ...(isLive ? { liveUrl: trimmedUrl } : {}),
        ...(isReplay ? { replayUrl: trimmedUrl } : {}),
      }
      await updateStudentLearningPathTask(studentId, item.id, {
        pointName,
        stageKey,
        status: item.status,
        resource,
      })
      await onSaved(item, trimmedUrl, resolvedVideoId)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        setOpen(false)
      }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const hasValue = isLive || isReplay
    ? !!currentUrl
    : isPdf
      ? !!currentUrl
      : !!(currentVideoId || currentUrl)
  const buttonLabel = hasValue
    ? (isReport ? '已上传报告' : isPdf ? '已设文件' : isVideo ? '已设视频' : isLive ? '已设上课链接' : '已设回放链接')
    : (isReport ? '上传报告' : isPdf ? '设置文件' : isVideo ? '设置视频' : isLive ? '设置上课链接' : '设置回放链接')

  return (
    <div className="min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className={[
          'flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] transition-colors',
          hasValue
            ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:border-[var(--color-primary)]'
            : 'border-dashed border-gray-300 bg-white text-gray-400 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
        ].join(' ')}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {hasValue
            ? <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>
            : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
          }
        </svg>
        {buttonLabel}
      </button>

      {open && createPortal(
        <div ref={wrapRef} style={{ position: 'fixed', top: popupStyle.top, left: popupStyle.left, zIndex: 9999 }} className="w-[360px] rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-lg">
          <div className="mb-2 text-[11px] font-semibold text-[var(--color-text-secondary)]">
            {isReport ? '上传报告 PDF' : isPdf ? '设置文件资源' : isVideo ? '设置视频资源' : isLive ? '设置上课链接' : '设置回放链接'}
          </div>

          {isPdf && (
            <div className="mb-2">
              {!isReport && (
                <>
                  <div className="mb-1 text-[10px] text-[var(--color-text-muted)]">文件 URL（PDF 直链）</div>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
                  />
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploading(true)
                  setError('')
                  try {
                    const uploadedUrl = await uploadPdf(file)
                    setUrl(uploadedUrl)
                    setSaved(false)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '上传失败')
                  } finally {
                    setUploading(false)
                    e.target.value = ''
                  }
                }}
              />
              {isReport && (
                <div className="mb-1.5 rounded-lg bg-[var(--color-bg-left)] px-2.5 py-2 text-[10px] leading-4 text-[var(--color-text-muted)]">
                  诊断报告和卡点报告仅支持 PDF。上传后点击保存，后端学习路径和学生端会同步读取同一份文件。
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] py-1.5 text-[10px] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {uploading ? '上传中...' : isReport ? '上传报告 PDF' : '上传 PDF'}
              </button>
              {!!url && (
                <a
                  href={resolveAssetUrl(url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 flex w-full items-center justify-center rounded-lg border border-[var(--color-border)] py-1.5 text-[10px] text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                >
                  {isReport ? '预览当前报告 PDF' : '预览当前 PDF'}
                </a>
              )}
            </div>
          )}

          {isVideo && (
            <>
              <div className="mb-2">
                <div className="mb-1 text-[10px] text-[var(--color-text-muted)]">视频 ID（保利威 videoId）</div>
                <input
                  type="text"
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                  placeholder="vid_xxxxxxxx"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <div className="mb-2">
                <div className="mb-1 text-[10px] text-[var(--color-text-muted)]">或直接填写视频链接</div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            </>
          )}

          {(isLive || isReplay) && (
            <div className="mb-2">
              <div className="mb-1 text-[10px] text-[var(--color-text-muted)]">
                {isLive ? '上课链接' : '回放链接'}
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="可粘贴会议链接、邀请文案或会议号"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          )}

          {!!error && <div className="mb-1.5 text-[10px] text-red-500">{error}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-[var(--color-border)] py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className={[
                'flex-1 rounded-lg py-1 text-xs font-semibold transition-colors',
                saved ? 'bg-green-500 text-white' : 'bg-[var(--color-primary)] text-white hover:opacity-80 disabled:opacity-50',
              ].join(' ')}
            >
              {saved ? '已保存' : saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

function SubmissionViewer({
  submissionId,
  fileName,
}: {
  submissionId: string
  fileName?: string
}) {
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState('')

  if (!submissionId) return null

  async function handlePreviewSubmission() {
    setPreviewing(true)
    setError('')
    try {
      const url = await fetchSubmissionFileUrl(submissionId)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开学生提交失败')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="w-full rounded-xl border border-dashed border-[var(--color-border)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={previewing}
          onClick={() => void handlePreviewSubmission()}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
        >
          {previewing ? '打开中...' : '查看学生提交'}
        </button>
      </div>
      {!!fileName && (
        <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          学生文件：{fileName}
        </div>
      )}
      {error ? (
        <div className="mt-2 text-[11px] text-red-500">{error}</div>
      ) : null}
    </div>
  )
}

function FeedbackEditor({
  submissionId,
  sourceFileName,
  initialReviewedFileName,
  initialReviewed,
  onSubmitted,
}: {
  submissionId: string
  sourceFileName?: string
  initialReviewedFileName?: string
  initialReviewed?: boolean
  onSubmitted: () => Promise<void>
}) {
  const reviewedFileName = String(initialReviewedFileName || '').trim()
  const [reviewFile, setReviewFile] = useState<File | null>(null)
  const [reviewFileName, setReviewFileName] = useState(reviewedFileName)
  const [reviewed, setReviewed] = useState(!!initialReviewed)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setReviewFileName(reviewedFileName)
  }, [reviewedFileName])

  useEffect(() => {
    setReviewed(!!initialReviewed)
  }, [initialReviewed])

  if (!submissionId) return null

  async function handlePreviewSubmission() {
    setPreviewing(true)
    setError('')
    try {
      const url = await fetchSubmissionFileUrl(submissionId)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开学生提交失败')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSubmitReview() {
    setSubmitting(true)
    setError('')
    try {
      if (reviewFile) {
        const result = await uploadReviewedSubmissionPdf(submissionId, reviewFile)
        setReviewFileName(result.reviewedFileName || reviewFile.name)
      } else if (!reviewFileName) {
        throw new Error('请先上传批改 PDF')
      }

      await api.put(`/api/submissions/${submissionId}/grade`, {})
      setReviewFile(null)
      setReviewed(true)
      await onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交批改失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full rounded-xl border border-dashed border-[var(--color-border)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={previewing}
          onClick={() => void handlePreviewSubmission()}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
        >
          {previewing ? '打开中...' : '查看学生提交'}
        </button>
        <label className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
          上传批改 PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null
              setReviewFile(file)
              setReviewFileName(file?.name || reviewedFileName)
              setError('')
            }}
          />
        </label>
        <button
          type="button"
          disabled={submitting || (!reviewFile && !reviewFileName)}
          onClick={() => void handleSubmitReview()}
          className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? '提交中...' : (reviewed ? '重新提交批改' : '提交批改')}
        </button>
      </div>
      {!!sourceFileName && (
        <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          学生文件：{sourceFileName}
        </div>
      )}
      <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
        批改文件：{reviewFileName || '未上传'}
      </div>
      {error ? (
        <div className="mt-2 text-[11px] text-red-500">{error}</div>
      ) : null}
    </div>
  )
}

function TaskTimeEditor({
  item,
  studentId,
  pointName,
  stageKey,
  label,
  onSaved,
}: {
  item: LearningPathItem
  studentId: string
  pointName: string
  stageKey: LearningPathStageKey
  label?: string
  onSaved: (taskId: string, timeLabel: string, timeType: LearningPathTimeType) => void
}) {
  const [open, setOpen] = useState(false)
  const [timeLabel, setTimeLabel] = useState(item.timeLabel ?? '')
  const [timeType, setTimeType] = useState<LearningPathTimeType>(getResolvedTimeType(item))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const itemTimeLabel = item.timeLabel ?? ''
  const itemTimeType = getResolvedTimeType(item)

  useEffect(() => {
    setTimeLabel(itemTimeLabel)
    setTimeType(itemTimeType)
    setError('')
    setSaved(false)
  }, [itemTimeLabel, itemTimeType])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const nextTimeLabel = timeLabel.trim()
      await updateStudentLearningPathTask(studentId, item.id, {
        pointName,
        stageKey,
        status: item.status,
        timeLabel: nextTimeLabel,
        timeType,
      })
      onSaved(item.id, nextTimeLabel, timeType)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        setOpen(false)
      }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const hasValue = !!String(item.timeLabel || '').trim()
  const editorTitle = label || '时间设置'
  const buttonLabel = hasValue
    ? (getResolvedTimeType(item) === 'deadline' ? '已设截止时间' : '已设固定时间')
    : '设置时间'

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev)
          setTimeLabel(item.timeLabel ?? '')
          setTimeType(getResolvedTimeType(item))
          setError('')
          setSaved(false)
        }}
        className={[
          'flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] transition-colors',
          hasValue
            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
            : 'border-dashed border-gray-300 bg-white text-gray-400 hover:border-amber-300 hover:text-amber-700',
        ].join(' ')}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 15" />
        </svg>
        {buttonLabel}
      </button>

      {open && (
        <div className="mt-2 w-64 rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-sm">
          <div className="mb-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">{editorTitle}</div>
          <div className="mb-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">时间类型</div>
          <select
            value={timeType}
            onChange={(e) => setTimeType(e.target.value as LearningPathTimeType)}
            className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-amber-300"
          >
            <option value="fixed">固定时间</option>
            <option value="deadline">截止时间</option>
          </select>
          <input
            type="text"
            value={timeLabel}
            onChange={(e) => setTimeLabel(e.target.value)}
            placeholder="例如：周三 19:00-20:30"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-2.5 py-1.5 text-xs outline-none focus:border-amber-300"
          />
          <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">支持日期、时间段或简短说明。</div>
          {!!error && <div className="mt-1.5 text-[10px] text-red-500">{error}</div>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setTimeLabel(item.timeLabel ?? '')
                setError('')
              }}
              className="flex-1 rounded-lg border border-[var(--color-border)] py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className={[
                'flex-1 rounded-lg py-1 text-xs font-semibold transition-colors',
                saved ? 'bg-green-500 text-white' : 'bg-amber-500 text-white hover:opacity-80 disabled:opacity-50',
              ].join(' ')}
            >
              {saved ? '已保存' : saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// LearningPathPanel：学习路径面板，按阶段展示学生任务，支持资源配置、时间设置与批改查看
export function LearningPathPanel({
  studentId,
  pointName,
  onOpenDiagnosePaper,
  onOpenTheoryEditor,
}: {
  studentId: string
  pointName: string
  onOpenDiagnosePaper?: () => void
  onOpenTheoryEditor?: () => void
}) {
  const [activeStage, setActiveStage] = useState<LearningPathStageKey>('diagnose')
  const [remoteStages, setRemoteStages] = useState<LearningPathStage[]>([])
  const [localOverrides, setLocalOverrides] = useState<Record<string, {
    url?: string
    videoId?: string
    timeLabel?: string
    timeType?: LearningPathTimeType
    timeDisplayLabel?: string
  }>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [refreshing, setRefreshing] = useState(false)
  const learningPathRefreshToken = useWorkbenchStore((state) => state.learningPathRefreshToken)

  useEffect(() => {
    setLocalOverrides({})
    setCollapsedGroups({})
  }, [studentId])

  const reloadLearningPath = useCallback(async (keepCurrentStage = false) => {
    const payload = await fetchStudentLearningPath(studentId, pointName)
    const stages = Array.isArray(payload?.stages) ? payload.stages : []
    setRemoteStages(stages)
    if (keepCurrentStage) return stages

    const preferred = stages.find((s) => s.groups.flatMap((g) => g.items || []).some((i) => i.status === 'current'))
      || stages.find((s) => s.groups.flatMap((g) => g.items || []).some((i) => i.status !== 'done'))
      || stages[0]
    if (preferred) setActiveStage(preferred.stageKey)
    return stages
  }, [pointName, studentId])

  const handleRefreshLearningPath = useCallback(async (keepCurrentStage = true) => {
    setRefreshing(true)
    try {
      await reloadLearningPath(keepCurrentStage)
    } finally {
      setRefreshing(false)
    }
  }, [reloadLearningPath])

  useEffect(() => {
    let active = true
    setLocalOverrides({})
    setCollapsedGroups({})
    fetchStudentLearningPath(studentId, pointName)
      .then((payload) => {
        if (!active) return
        const stages = Array.isArray(payload?.stages) ? payload.stages : []
        setRemoteStages(stages)
        const preferred = stages.find((s) => s.groups.flatMap((g) => g.items || []).some((i) => i.status === 'current'))
          || stages.find((s) => s.groups.flatMap((g) => g.items || []).some((i) => i.status !== 'done'))
          || stages[0]
        if (preferred) setActiveStage(preferred.stageKey)
      })
      .catch(() => { if (!active) return; setRemoteStages([]) })
    return () => { active = false }
  }, [learningPathRefreshToken, pointName, studentId])

  useEffect(() => {
    function handleWindowFocus() {
      handleRefreshLearningPath(true).catch((error) => {
        log.warn('learningPath.focusRefreshFailed', {
          message: error instanceof Error ? error.message : String(error),
        })
      })
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => {
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [handleRefreshLearningPath])

  const resolvedStages = useMemo(() => {
    return LEARNING_PATH_STAGE_ORDER
      .map((stageKey) => remoteStages.find((stage) => stage.stageKey === stageKey) ?? null)
      .filter((stage): stage is LearningPathStage => !!stage)
  }, [remoteStages])

  const getStageStatus = (stage: LearningPathStage): LearningPathItemStatus => {
    const rawStatus = String(stage.status || '').trim()
    if (rawStatus === 'done' || rawStatus === 'current' || rawStatus === 'pending') {
      return rawStatus
    }

    const items = stage.groups.flatMap((g) => g.items || [])
    if (items.length > 0 && items.every((i) => i.status === 'done')) return 'done'
    if (items.some((i) => i.status === 'current')) return 'current'
    return 'pending'
  }

  const stageTabs = useMemo(() => (
    resolvedStages.map((s) => ({ key: s.stageKey, label: s.stageName, status: getStageStatus(s) }))
  ), [resolvedStages])

  const stage = useMemo(
    () => resolvedStages.find((s) => s.stageKey === activeStage) || resolvedStages[0],
    [activeStage, resolvedStages],
  )

  const currentLearningSummary = useMemo(() => {
    const preferredStage = resolvedStages.find((entry) => {
      const items = entry.groups.flatMap((group) => group.items || [])
      return items.some((item) => item.status === 'current')
    }) || resolvedStages.find((entry) => {
      const items = entry.groups.flatMap((group) => group.items || [])
      return items.some((item) => item.status !== 'done')
    }) || resolvedStages[resolvedStages.length - 1]

    if (!preferredStage) {
      return {
        stageLabel: '',
        taskTitle: '',
        done: false,
      }
    }

    const items = preferredStage.groups.flatMap((group) => group.items || [])
    const currentItem = items.find((item) => item.status === 'current')
      || items.find((item) => item.status !== 'done')
      || null
    const allDone = items.length > 0 && items.every((item) => item.status === 'done')

    return {
      stageLabel: String(preferredStage.stageName || '').trim(),
      taskTitle: currentItem ? String(currentItem.title || '').trim() : '',
      done: allDone && !resolvedStages.some((entry) => entry.groups.flatMap((group) => group.items || []).some((item) => item.status !== 'done')),
    }
  }, [resolvedStages])

  const stageItemMap = useMemo(() => {
    const map = new Map<string, LearningPathItem>()
    ;(stage?.groups || []).forEach((group) => {
      ;(group.items || []).forEach((item) => {
        const itemId = String(item.id || '').trim()
        if (itemId) {
          map.set(itemId, item)
        }
      })
    })
    return map
  }, [stage])

  const diagnoseNeedsPaperConfig = useMemo(() => {
    const diagnoseStage = resolvedStages.find((entry) => entry.stageKey === 'diagnose')
    if (!diagnoseStage) return false

    const diagnoseItems = diagnoseStage.groups.flatMap((group) => group.items || [])
    const requiredIds = ['diagnose_paper', 'diagnose_analysis_video', 'diagnose_reference_answer']

    return requiredIds.some((itemId) => {
      const item = diagnoseItems.find((entry) => String(entry.id || '').trim() === itemId)
      if (!item) return true

      const resource = item.resource || null
      return !(
        String(resource?.url || '').trim()
        || String(resource?.videoId || '').trim()
        || (Array.isArray(resource?.videoLessons) && resource.videoLessons.length > 0)
      )
    })
  }, [resolvedStages])

  if (!stage || stageTabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">
        暂无学习路径数据
      </div>
    )
  }

  async function handleResourceSaved(item: LearningPathItem, expectedUrl: string, expectedVideoId: string) {
    const stages = await reloadLearningPath(true)
    const persistedItem = stages
      .flatMap((stage) => stage.groups.flatMap((group) => group.items || []))
      .find((stageItem) => String(stageItem.id || '').trim() === String(item.id || '').trim())

    if (!persistedItem) {
      throw new Error('保存后未能重新读取到当前学习路径任务')
    }

    const persistedUrl = item.actionType === 'live'
      ? String(persistedItem.resource?.liveUrl ?? persistedItem.resource?.url ?? '').trim()
      : item.actionType === 'replay'
        ? String(persistedItem.resource?.replayUrl ?? persistedItem.resource?.url ?? '').trim()
        : String(persistedItem.resource?.url ?? '').trim()
    const persistedVideoId = String(persistedItem.resource?.videoId ?? '').trim()
    const normalizedExpectedUrl = String(expectedUrl || '').trim()
    const normalizedExpectedVideoId = String(expectedVideoId || '').trim()

    if (normalizedExpectedUrl && persistedUrl !== normalizedExpectedUrl) {
      throw new Error('保存请求已完成，但服务端回读结果里没有这份文件')
    }

    if (item.actionType === 'video' && normalizedExpectedVideoId && persistedVideoId !== normalizedExpectedVideoId) {
      throw new Error('保存请求已完成，但服务端回读结果里没有这条视频配置')
    }
  }

  function handleTimeSaved(taskId: string, timeLabel: string, timeType: LearningPathTimeType) {
    setLocalOverrides((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        timeLabel,
        timeType,
        timeDisplayLabel: buildTimeDisplayLabel(timeType, timeLabel),
      },
    }))
  }

  function toggleGroup(groupTitle: string) {
    setCollapsedGroups((prev) => ({ ...prev, [groupTitle]: !prev[groupTitle] }))
  }

  function getTheorySubGroupKey(sectionId: string, groupTitle: string) {
    return `${sectionId}__${groupTitle}`
  }

  function toggleTheorySubGroup(sectionId: string, groupTitle: string) {
    const key = getTheorySubGroupKey(sectionId, groupTitle)
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function isGroupCollapsible(groupTitle: string) {
    return activeStage === 'training' && !!groupTitle && groupTitle !== 'Practice Path'
  }

  function isGroupCollapsed(group: LearningPathStage['groups'][number]) {
    if (collapsedGroups[group.title] !== undefined) return collapsedGroups[group.title]
    // 未手动折叠过的分组：包含 current 任务的默认展开，其余默认折叠
    const hasCurrent = (group.items || []).some((i) => i.status === 'current')
    return !hasCurrent
  }

  function isTheorySubGroupCollapsed(sectionId: string, group: LearningPathStage['groups'][number]) {
    const key = getTheorySubGroupKey(sectionId, group.title)
    if (collapsedGroups[key] !== undefined) return collapsedGroups[key]
    const hasCurrent = (group.items || []).some((item) => item.status === 'current')
    return !hasCurrent
  }

  // 将本地覆盖（localOverrides）合并进 item.resource，保存后无需等刷新即可回显
  function resolveItem(item: LearningPathItem): LearningPathItem {
    const normalizedItem = normalizeTrainingExplainVideoItem(item)
    const ov = localOverrides[normalizedItem.id]
    if (!ov) return normalizedItem
    const isLiveOrReplay = normalizedItem.actionType === 'live' || normalizedItem.actionType === 'replay'
    return {
      ...normalizedItem,
      timeLabel: ov.timeLabel ?? normalizedItem.timeLabel,
      timeType: ov.timeType ?? normalizedItem.timeType ?? getDefaultTimeType(normalizedItem),
      timeDisplayLabel: ov.timeDisplayLabel ?? normalizedItem.timeDisplayLabel ?? buildTimeDisplayLabel(
        (ov.timeType ?? normalizedItem.timeType ?? getDefaultTimeType(normalizedItem)) as LearningPathTimeType,
        ov.timeLabel ?? normalizedItem.timeLabel ?? '',
      ),
      resource: {
        ...(normalizedItem.resource || {}),
        resourceType: normalizedItem.actionType === 'document' || normalizedItem.actionType === 'report'
          ? 'pdf'
          : normalizedItem.actionType === 'video'
            ? 'video'
            : normalizedItem.actionType,
        title: normalizedItem.title,
        url: isLiveOrReplay ? (normalizedItem.resource?.url ?? '') : (ov.url ?? normalizedItem.resource?.url ?? ''),
        videoId: ov.videoId ?? normalizedItem.resource?.videoId,
        liveUrl: normalizedItem.actionType === 'live' ? (ov.url ?? normalizedItem.resource?.liveUrl ?? '') : (normalizedItem.resource?.liveUrl ?? ''),
        replayUrl: normalizedItem.actionType === 'replay' ? (ov.url ?? normalizedItem.resource?.replayUrl ?? '') : (normalizedItem.resource?.replayUrl ?? ''),
      },
    }
  }

  function getLatestUploadRecord(item: LearningPathItem | null | undefined): Record<string, unknown> | null {
    const uploads = Array.isArray(item?.uploads) ? item.uploads : []
    for (let index = uploads.length - 1; index >= 0; index -= 1) {
      const upload = asPlainRecord(uploads[index])
      if (upload) return upload
    }
    return null
  }

  function getSubmissionBridge(item: LearningPathItem) {
    const itemId = String(item.id || '').trim()
    const itemResult = asPlainRecord(item.result as unknown)
    let submissionId = readStringField(itemResult, 'submissionId')
    let fileName = readStringField(itemResult, 'fileName')
    let reviewedFileName = readStringField(itemResult, 'reviewedFileName')
    let reviewed = readStringField(itemResult, 'status') === 'reviewed'
    let uploadCount = Array.isArray(item.uploads) ? item.uploads.length : 0

    if (item.actionType === 'upload') {
      const latestUpload = getLatestUploadRecord(item)
      const feedbackItem = stageItemMap.get(getFeedbackTaskIdForUploadTask(itemId))
      const feedbackResult = asPlainRecord(feedbackItem?.result as unknown)

      submissionId = readStringField(latestUpload, 'submissionId', 'id') || readStringField(feedbackResult, 'submissionId')
      fileName = readStringField(latestUpload, 'fileName') || readStringField(feedbackResult, 'fileName')
      reviewedFileName = readStringField(feedbackResult, 'reviewedFileName')
      reviewed = readStringField(feedbackResult, 'status') === 'reviewed'
    } else if (item.actionType === 'feedback') {
      const uploadItem = stageItemMap.get(getUploadTaskIdForFeedbackTask(itemId))
      const latestUpload = getLatestUploadRecord(uploadItem)

      uploadCount = Array.isArray(uploadItem?.uploads) ? uploadItem.uploads.length : uploadCount
      submissionId = submissionId || readStringField(latestUpload, 'submissionId', 'id')
      fileName = fileName || readStringField(latestUpload, 'fileName')
      reviewedFileName = reviewedFileName || readStringField(itemResult, 'reviewedFileName')
      reviewed = reviewed || readStringField(itemResult, 'status') === 'reviewed'
    }

    if (!submissionId) {
      return null
    }

    return {
      submissionId,
      fileName,
      reviewedFileName,
      reviewed,
      uploadCount,
    }
  }

  function renderItemContent(item: LearningPathItem) {
    const isPdf = item.actionType === 'document' || item.actionType === 'report'
    const isVideo = item.actionType === 'video'
    const isLive = item.actionType === 'live'
    const isReplay = item.actionType === 'replay'
    const isUpload = item.actionType === 'upload'
    const isFeedback = item.actionType === 'feedback'
    const submissionBridge = getSubmissionBridge(item)
    const videoLessonCount = Array.isArray(item.resource?.videoLessons) ? item.resource.videoLessons.length : 0
    const hasResource = (isLive || isReplay)
      ? !!item.resource?.url
      : isPdf
        ? !!item.resource?.url
        : (!!item.resource?.videoId || videoLessonCount > 0)
    const showItemTime = shouldShowItemTime(stage.stageKey, item)
    const showItemTimeEditor = shouldShowItemTimeEditor(stage.stageKey, item)

    return (
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{item.title}</span>
        </div>
        {showItemTime && (item.timeDisplayLabel || item.timeLabel) && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 15" />
            </svg>
            <span>{item.timeDisplayLabel || item.timeLabel}</span>
          </div>
        )}
        {(isPdf || isVideo || isLive || isReplay) && (
          <div className="mt-1.5">
            {hasResource && (
              <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-2.5 py-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-primary)]">
                  {isPdf
                    ? <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>
                    : <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>
                  }
                </svg>
                <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--color-text-secondary)]">
                  {isLive
                    ? (item.resource?.liveUrl ?? item.resource?.url ?? '')
                    : isReplay
                      ? (item.resource?.replayUrl ?? item.resource?.url ?? '')
                      : isPdf
                        ? (item.resource?.url ?? '')
                        : (item.resource?.videoId ? `视频 ID：${item.resource.videoId}` : (item.resource?.url ?? ''))}
                </span>
              </div>
            )}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-2">
          {showItemTimeEditor && (
            <TaskTimeEditor
              item={item}
              studentId={studentId}
              pointName={pointName}
              stageKey={stage.stageKey}
              onSaved={handleTimeSaved}
            />
          )}
          {(isPdf || isVideo || isLive || isReplay) && (
            <ResourceEditor
              item={item}
              studentId={studentId}
              pointName={pointName}
              stageKey={stage.stageKey}
              onSaved={handleResourceSaved}
            />
          )}
          {isUpload && submissionBridge?.submissionId && (
            <SubmissionViewer
              submissionId={submissionBridge.submissionId}
              fileName={submissionBridge.fileName}
            />
          )}
          {isFeedback && submissionBridge?.submissionId && (
            <FeedbackEditor
              submissionId={submissionBridge.submissionId}
              sourceFileName={submissionBridge.fileName}
              initialReviewedFileName={submissionBridge.reviewedFileName}
              initialReviewed={submissionBridge.reviewed}
              onSubmitted={async () => {
                await reloadLearningPath(true)
              }}
            />
          )}
        </div>
      </div>
    )
  }

  function renderTimelineItem(item: LearningPathItem, index: number, total: number) {
    const status = statusStyles[item.status]
    return (
      <div key={item.id} className="flex gap-3 py-3">
        <div className="flex w-4 shrink-0 flex-col items-center">
          <span className={['h-2.5 w-2.5 rounded-full', status.dot].join(' ')} />
          {index < total - 1 && <span className="mt-1 min-h-6 w-px flex-1 bg-[var(--color-border)]" />}
        </div>
        {renderItemContent(item)}
      </div>
    )
  }

  function renderGroupedTimeline(entry: Extract<StageDisplayEntry, { kind: 'group' }>, index: number, total: number) {
    const groupStatus = statusStyles[entry.status]
    const timeTarget = getGroupedEntryTimeTarget(stage.stageKey, entry)
    const resolvedTimeItem = timeTarget ? resolveItem(timeTarget.item) : null

    return (
      <div key={entry.id} className="flex gap-3 py-3">
        <div className="flex w-4 shrink-0 flex-col items-center">
          <span className={['h-2.5 w-2.5 rounded-full', groupStatus.dot].join(' ')} />
          {index < total - 1 && <span className="mt-1 min-h-6 w-px flex-1 bg-[var(--color-border)]" />}
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{entry.title}</span>
                  {timeTarget && (
                    <TaskTimeEditor
                      item={resolvedTimeItem || timeTarget.item}
                      studentId={studentId}
                      pointName={pointName}
                      stageKey={stage.stageKey}
                      label={timeTarget.label}
                      onSaved={handleTimeSaved}
                    />
                  )}
                </div>
                {resolvedTimeItem && (resolvedTimeItem.timeDisplayLabel || resolvedTimeItem.timeLabel) && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <circle cx="12" cy="12" r="9" />
                      <polyline points="12 7 12 12 15 15" />
                    </svg>
                    <span>{resolvedTimeItem.timeDisplayLabel || resolvedTimeItem.timeLabel}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="px-3">
              {entry.items.map((rawItem, groupIndex) => {
                const item = resolveItem(rawItem)
                return (
                  <div
                    key={item.id}
                    className={[
                      'py-3',
                      groupIndex < entry.items.length - 1 ? 'border-b border-[var(--color-border)]' : '',
                    ].join(' ')}
                  >
                    {renderItemContent(item)}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderItemsCard(items: LearningPathItem[], key: string) {
    return (
      <div key={key} className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1">
        {items.map((item, index) => renderTimelineItem(resolveItem(item), index, items.length))}
      </div>
    )
  }


  function renderConfiguredTopLevelGroupedCard(entry: Extract<StageCardEntry, { kind: 'group' }>) {
    const doneCount = entry.items.filter((item) => item.status === 'done').length
    const allDone = entry.items.length > 0 && doneCount === entry.items.length
    const timeTarget = getGroupedEntryTimeTarget(stage.stageKey, entry)
    const resolvedTimeItem = timeTarget ? resolveItem(timeTarget.item) : null

    return (
      <div key={entry.id} className="rounded-xl border border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{entry.title}</span>
              {timeTarget && (
                <TaskTimeEditor
                  item={resolvedTimeItem || timeTarget.item}
                  studentId={studentId}
                  pointName={pointName}
                  stageKey={stage.stageKey}
                  label={timeTarget.label}
                  onSaved={handleTimeSaved}
                />
              )}
              {allDone && (
                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">已完成</span>
              )}
              {!allDone && doneCount > 0 && (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">{doneCount}/{entry.items.length}</span>
              )}
            </div>
            {resolvedTimeItem && (resolvedTimeItem.timeDisplayLabel || resolvedTimeItem.timeLabel) && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 15" />
                </svg>
                <span>{resolvedTimeItem.timeDisplayLabel || resolvedTimeItem.timeLabel}</span>
              </div>
            )}
          </div>
        </div>
        <div className="px-3 py-1">
          {entry.items.map((item, index) => renderTimelineItem(resolveItem(item), index, entry.items.length))}
        </div>
      </div>
    )
  }

  function renderTheorySectionCard(section: ReturnType<typeof buildTheorySections>[number]) {
    const sectionItems = section.groups.flatMap((group) => group.items || [])
    const doneCount = sectionItems.filter((item) => item.status === 'done').length
    const allDone = sectionItems.length > 0 && doneCount === sectionItems.length
    const resolvedTimeItem = section.timeTarget ? resolveItem(section.timeTarget) : null
    const showsNestedGroups = section.id === 'theory_section_lessons'
    const canEditTheoryLessons = section.id === 'theory_section_lessons' && typeof onOpenTheoryEditor === 'function'

    return (
      <div key={section.id} className="rounded-xl border border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{section.title}</span>
                {section.timeTarget && (
                  <TaskTimeEditor
                    item={resolvedTimeItem || section.timeTarget}
                    studentId={studentId}
                    pointName={pointName}
                    stageKey={stage.stageKey}
                    label={`${section.title}时间`}
                    onSaved={handleTimeSaved}
                  />
                )}
                {allDone && (
                  <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">已完成</span>
                )}
                {!allDone && doneCount > 0 && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">{doneCount}/{sectionItems.length}</span>
                )}
              </div>
              {resolvedTimeItem && (resolvedTimeItem.timeDisplayLabel || resolvedTimeItem.timeLabel) && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 15" />
                  </svg>
                  <span>{resolvedTimeItem.timeDisplayLabel || resolvedTimeItem.timeLabel}</span>
                </div>
              )}
            </div>
            {canEditTheoryLessons && (
              <button
                type="button"
                onClick={() => onOpenTheoryEditor?.()}
                className="shrink-0 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary-light)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-primary)] transition-opacity hover:opacity-90"
              >
                调整
              </button>
            )}
          </div>
        </div>
        {showsNestedGroups ? (
          <div className="space-y-3 px-3 py-3">
            {section.groups.map((group) => {
              const items = group.items || []
              const subgroupDoneCount = items.filter((item) => item.status === 'done').length
              const subgroupAllDone = items.length > 0 && subgroupDoneCount === items.length
              const subgroupCollapsed = isTheorySubGroupCollapsed(section.id, group)

              return (
                <div key={`${section.id}_${group.title}`} className="rounded-xl border border-[var(--color-border)] bg-white">
                  <div
                    className="flex cursor-pointer select-none items-center justify-between gap-3 border-b border-[var(--color-border)] bg-white px-3 py-2 hover:bg-[var(--color-bg-hover,#f8fafc)]"
                    onClick={() => toggleTheorySubGroup(section.id, group.title)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{group.title}</span>
                      {subgroupAllDone && (
                        <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">已完成</span>
                      )}
                      {!subgroupAllDone && subgroupDoneCount > 0 && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">{subgroupDoneCount}/{items.length}</span>
                      )}
                    </div>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      className={['text-[var(--color-text-muted)] transition-transform', subgroupCollapsed ? '' : 'rotate-180'].join(' ')}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                  {!subgroupCollapsed && (
                    <div className="px-3 py-1">
                      {items.map((rawItem, index) => renderTimelineItem(resolveItem(rawItem), index, items.length))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-3 py-1">
            {sectionItems.map((rawItem, index) => renderTimelineItem(resolveItem(rawItem), index, sectionItems.length))}
          </div>
        )}
      </div>
    )
  }

  function renderStageContent() {
    if (stage.stageKey === 'theory') {
      return buildTheorySections(stage.groups).map((section) => renderTheorySectionCard(section))
    }

    return stage.groups.map((group) => {
      const displayGroup = group
      const collapsible = isGroupCollapsible(displayGroup.title)
      const collapsed = collapsible && isGroupCollapsed(displayGroup)
      const items = displayGroup.items || []
      const doneCount = items.filter((i) => i.status === 'done').length
      const allDone = items.length > 0 && doneCount === items.length
      const shouldPromoteGroupedCards = stage.stageKey === 'diagnose' || stage.stageKey === 'training'
      const displayEntries = stage.stageKey === 'diagnose'
        ? buildDiagnoseDisplayEntries(items)
        : stage.stageKey === 'training'
          ? buildTrainingDisplayEntries(items)
          : items.map((item) => ({ kind: 'item', item } as StageDisplayEntry))
      const cardEntries = buildStageCardEntries(displayEntries)

      if (shouldPromoteGroupedCards) {
        return (
          <div key={displayGroup.title} className="space-y-3">
            {cardEntries.map((entry) => {
              if (entry.kind === 'group') {
                return renderConfiguredTopLevelGroupedCard(entry)
              }
              return renderItemsCard(entry.items, entry.id)
            })}
          </div>
        )
      }

      const groupTimeTarget = getStageGroupTimeTarget(stage.stageKey, items)
      const resolvedGroupTimeItem = groupTimeTarget ? resolveItem(groupTimeTarget.item) : null

      return (
        <div key={displayGroup.title} className="rounded-xl border border-[var(--color-border)]">
          <div
            className={[
              'flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2',
              collapsible ? 'cursor-pointer select-none hover:bg-[var(--color-bg-hover,#f8fafc)]' : '',
            ].join(' ')}
            onClick={collapsible ? () => toggleGroup(displayGroup.title) : undefined}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{displayGroup.title}</span>
                {collapsible && allDone && (
                  <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">已完成</span>
                )}
                {collapsible && !allDone && doneCount > 0 && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">{doneCount}/{items.length}</span>
                )}
              </div>
              {resolvedGroupTimeItem && (resolvedGroupTimeItem.timeDisplayLabel || resolvedGroupTimeItem.timeLabel) && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 15" />
                  </svg>
                  <span>{resolvedGroupTimeItem.timeDisplayLabel || resolvedGroupTimeItem.timeLabel}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
              {groupTimeTarget && (
                <TaskTimeEditor
                  item={resolvedGroupTimeItem || groupTimeTarget.item}
                  studentId={studentId}
                  pointName={pointName}
                  stageKey={stage.stageKey}
                  label={groupTimeTarget.label}
                  onSaved={handleTimeSaved}
                />
              )}
              {collapsible && (
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={['text-[var(--color-text-muted)] transition-transform', collapsed ? '' : 'rotate-180'].join(' ')}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </div>
          </div>
          {!collapsed && (
            <div className="px-3 py-1">
              {displayEntries.map((entry, index, displayEntriesList) => {
                if (entry.kind === 'group') {
                  return renderGroupedTimeline(entry, index, displayEntriesList.length)
                }
                return renderTimelineItem(resolveItem(entry.item), index, displayEntriesList.length)
              })}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {stageTabs.map((tab) => {
            const s = statusStyles[tab.status]
            return (
              <button key={tab.key} type="button" onClick={() => setActiveStage(tab.key)}
                className={[
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  activeStage === tab.key
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]',
                ].join(' ')}>
                <span className={['h-1.5 w-1.5 rounded-full', s.dot].join(' ')} />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-3 py-1.5">
            <div className="flex min-w-0 flex-col">
              <div className="text-[10px] leading-4 text-[var(--color-text-muted)]">学生当下任务</div>
              <div className="max-w-[18rem] truncate text-xs font-medium text-[var(--color-text-primary)]">
                {currentLearningSummary.done
                  ? '已完成'
                  : [currentLearningSummary.stageLabel, currentLearningSummary.taskTitle].filter(Boolean).join(' / ') || '暂无进行中任务'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshLearningPath(true)}
              disabled={refreshing}
              title={refreshing ? '刷新中...' : '刷新学习路径'}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-left)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? '刷新中...' : '刷新'}
            </button>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[9px] text-green-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            已同步学生端
          </span>
        </div>
      </div>

      {onOpenDiagnosePaper && activeStage === 'diagnose' && diagnoseNeedsPaperConfig ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-900">诊断卷还没有配齐</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                先给学生选择诊断老师并配置诊断试卷、解析课和参考答案，保存后这里会同步显示。
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenDiagnosePaper}
              className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              去配卷
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <div className="space-y-3 p-3">
          {renderStageContent()}
        </div>
      </div>
    </div>
  )
}

