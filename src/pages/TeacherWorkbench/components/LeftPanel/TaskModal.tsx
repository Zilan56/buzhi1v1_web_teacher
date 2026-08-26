import { createPortal } from 'react-dom'
import { useState } from 'react'
import type { TaskListItem } from '../../types'
import { taskMeta } from '../../config/taskConfig'
import { useWorkbenchStore } from '../../store/workbenchStore'

const REPORT_CATEGORY_STORAGE_KEY = 'teacher_workbench_pending_report_category'

function ItemAvatar({ avatar, color }: { avatar: string; color: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {avatar}
    </div>
  )
}

function ItemRow({
  item,
  onAction,
  clickable = false,
  onOpen,
}: {
  item: TaskListItem
  onAction?: (item: TaskListItem) => void
  clickable?: boolean
  onOpen?: (item: TaskListItem) => void
}) {
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable && onOpen ? () => onOpen(item) : undefined}
      onKeyDown={clickable && onOpen ? (e) => { if (e.key === 'Enter') onOpen(item) } : undefined}
      className={[
        'flex items-center gap-3 rounded-[var(--radius-card)] px-3 py-2 hover:bg-[var(--color-bg-left)]',
        clickable ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      <ItemAvatar avatar={item.avatar} color={item.color} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.name}</div>
        <div className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{item.subtitle}</div>
      </div>
      {onAction ? (
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
          onClick={() => onAction(item)}
        >
          {item.actionLabel}
        </button>
      ) : null}
      {clickable ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-text-muted)]">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      ) : null}
    </div>
  )
}

function SectionGroup({
  title,
  items,
  onAction,
}: {
  title: string
  items: TaskListItem[]
  onAction: (item: TaskListItem) => void
}) {
  if (items.length === 0) return null

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 px-1 py-2">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">{title}</span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} onAction={onAction} />
        ))}
      </div>
    </div>
  )
}

export function TaskModal() {
  const openTaskKey = useWorkbenchStore((s) => s.openTaskKey)
  const close = useWorkbenchStore((s) => s.closeTaskModal)
  const selectContact = useWorkbenchStore((s) => s.selectContact)
  const openLinkUpload = useWorkbenchStore((s) => s.openLinkUpload)
  const openHandoutUpload = useWorkbenchStore((s) => s.openHandoutUpload)
  const openReportUpload = useWorkbenchStore((s) => s.openReportUpload)
  const openStudentProfile = useWorkbenchStore((s) => s.openStudentProfile)
  const openAssignStudent = useWorkbenchStore((s) => s.openAssignStudent)
  const taskItemsMap = useWorkbenchStore((s) => s.taskItemsMap)
  const [linkTab, setLinkTab] = useState<'live' | 'replay'>('live')
  const [reportTab, setReportTab] = useState<'diagnose' | 'checkpoint' | 'drill'>(() => {
    if (typeof window === 'undefined') return 'checkpoint'
    const stored = window.localStorage.getItem(REPORT_CATEGORY_STORAGE_KEY)
    return stored === 'diagnose' || stored === 'checkpoint' || stored === 'drill'
      ? stored
      : 'checkpoint'
  })

  if (!openTaskKey || openTaskKey === 'pendingReview' || openTaskKey === 'abnormalUser' || openTaskKey === 'pendingFeedback' || openTaskKey === 'liveDrill' || openTaskKey === 'pendingDiagnosePaper') {
    return null
  }

  const title = taskMeta[openTaskKey].label
  const items = taskItemsMap[openTaskKey] || []
  const pendingLinkItems = openTaskKey === 'pendingLink' ? items : []
  const pendingReportItems = openTaskKey === 'pendingReport' ? items : []

  function handleDefaultAction(item: TaskListItem) {
    if (openTaskKey === 'pendingHandout') {
      close()
      openHandoutUpload(item)
      return
    }

    if (openTaskKey === 'pendingReport' && item.studentId) {
      close()
      openReportUpload(item)
      return
    }

    if (openTaskKey === 'pendingAssign') {
      close()
      openAssignStudent(item)
      return
    }

    close()
    if (item.contactId) {
      selectContact(item.contactId)
    }
  }

  function handleOpenStudent(item: TaskListItem) {
    if (!item.studentId) return
    close()
    openStudentProfile(item.studentId)
  }

  const reportGroups: Array<{ key: 'diagnose' | 'checkpoint' | 'drill'; label: string }> = [
    { key: 'diagnose', label: '诊断报告' },
    { key: 'checkpoint', label: '卡点报告' },
    { key: 'drill', label: '刷题报告' },
  ]

  function handleSelectReportTab(tab: 'diagnose' | 'checkpoint' | 'drill') {
    setReportTab(tab)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REPORT_CATEGORY_STORAGE_KEY, tab)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative max-h-[86vh] w-[50vw] max-w-[96vw] overflow-hidden rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]"
          >
            ×
          </button>
        </div>

        {openTaskKey === 'pendingLink' ? (
          <div className="flex border-b border-[var(--color-border)] px-4">
            {(['live', 'replay'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLinkTab(tab)}
                className={[
                  'mr-4 border-b-2 py-2 text-xs font-semibold transition-colors',
                  linkTab === tab
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                ].join(' ')}
              >
                {tab === 'live' ? '直播课' : '录播课'}
              </button>
            ))}
          </div>
        ) : openTaskKey === 'pendingReport' ? (
          <div className="flex border-b border-[var(--color-border)] px-4">
            {reportGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => handleSelectReportTab(group.key)}
                className={[
                  'mr-4 border-b-2 py-2 text-xs font-semibold transition-colors',
                  reportTab === group.key
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                ].join(' ')}
              >
                {group.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="max-h-[calc(86vh-52px)] overflow-auto p-2">
          {openTaskKey === 'pendingLink' ? (
            pendingLinkItems.length > 0 ? (
              ([
                { key: 'diagnose' as const, label: '1v1诊断' },
                { key: 'consensus' as const, label: '1v1共识' },
                { key: 'correction' as const, label: '1v1纠偏' },
              ]).map((group) => (
                <SectionGroup
                  key={group.key}
                  title={group.label}
                  items={pendingLinkItems.filter((item) => item.courseType === group.key && item.linkType === linkTab)}
                  onAction={(item) => {
                    close()
                    openLinkUpload(item)
                  }}
                />
              ))
            ) : (
              <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">当前仅显示今天和明天的待上传链接</div>
            )
          ) : openTaskKey === 'pendingReport' ? (
            pendingReportItems.length > 0 ? (
              pendingReportItems.filter((item) => (item.reportCategory || 'checkpoint') === reportTab).length > 0 ? (
                <div className="space-y-1">
                  {pendingReportItems
                    .filter((item) => (item.reportCategory || 'checkpoint') === reportTab)
                    .map((item) => (
                      <ItemRow key={item.id} item={item} onAction={handleDefaultAction} />
                    ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                  当前分类下没有待上传报告
                </div>
              )
            ) : (
              <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">当前没有待上传报告</div>
            )
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  clickable={openTaskKey === 'pendingClass' && !!item.studentId}
                  onOpen={handleOpenStudent}
                  onAction={openTaskKey !== 'pendingClass' ? handleDefaultAction : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

