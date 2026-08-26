import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchChatMemberCandidates } from '../../api/chat'
import { useWorkbenchStore } from '../../store/workbenchStore'
import type { GroupMember } from '../../types'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'

const log = logger.child('manageMembers')

const roleColor: Record<string, string> = {
  '带教老师': '#e8845a',
  '诊断老师': '#4a90d9',
  '学管': '#4caf74',
  '校长': '#9c6fcc',
  '学生': '#888888',
}

function memberKey(member: GroupMember): string {
  return `${member.role}-${member.name}`
}

/**
 * 外层守卫：无 contactId 时返回 null（早退位于唯一 hook 之后）。
 * 内层用 key=contactId 挂载，切换/重开群组时整体重建，搜索词、页签、
 * 加载态随挂载初始化，因此 effect 内无需同步 setState。
 */
export function ManageMembersModal() {
  const contactId = useWorkbenchStore((s) => s.manageMembersContactId)

  if (!contactId) return null

  return <ManageMembersModalContent key={contactId} contactId={contactId} />
}

function ManageMembersModalContent({ contactId }: { contactId: string }) {
  const close = useWorkbenchStore((s) => s.closeManageMembers)
  const membersMap = useWorkbenchStore((s) => s.groupMembersMap)
  const addGroupMember = useWorkbenchStore((s) => s.addGroupMember)
  const removeGroupMember = useWorkbenchStore((s) => s.removeGroupMember)

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'current' | 'add'>('current')
  const [candidates, setCandidates] = useState<GroupMember[]>([])
  // 挂载即开始拉取候选人，loading 初始为 true；effect 只在异步延续中更新状态
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetchChatMemberCandidates(contactId)
      .then((rows) => {
        if (!active) return
        setCandidates(Array.isArray(rows) ? rows : [])
      })
      .catch((error: unknown) => {
        if (!active) return
        setCandidates([])
        setLoadError(error instanceof Error ? error.message : '群成员候选人加载失败')
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [contactId])

  const members = membersMap[contactId] ?? []

  const available = useMemo(() => (
    candidates.filter((candidate) =>
      search === '' || candidate.name.includes(search) || candidate.role.includes(search),
    )
  ), [candidates, search])

  const handleAdd = async (member: GroupMember) => {
    setPendingKey(memberKey(member))
    try {
      await addGroupMember(contactId, member)
    } catch (error) {
      log.warn('member.add.failed', {
        contactId,
        memberName: member.name,
        message: error instanceof Error ? error.message : String(error),
      })
      toast.error(`添加 ${member.name} 失败，请稍后重试`)
    } finally {
      setPendingKey(null)
    }
  }

  const handleRemove = async (member: GroupMember) => {
    setPendingKey(memberKey(member))
    try {
      await removeGroupMember(contactId, member)
    } catch (error) {
      log.warn('member.remove.failed', {
        contactId,
        memberName: member.name,
        message: error instanceof Error ? error.message : String(error),
      })
      toast.error(`移出 ${member.name} 失败，请稍后重试`)
    } finally {
      setPendingKey(null)
    }
  }

  const tabCls = (active: boolean) =>
    ['flex-1 py-1.5 text-xs font-medium rounded-full transition-colors',
      active ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]',
    ].join(' ')

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={close}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative flex max-h-[72vh] w-[min(520px,94vw)] flex-col rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">管理群成员</div>
            <button
              type="button"
              onClick={close}
              className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
          <button type="button" className={tabCls(tab === 'current')} onClick={() => setTab('current')}>
            当前成员 {members.length}
          </button>
          <button type="button" className={tabCls(tab === 'add')} onClick={() => setTab('add')}>
            拉人进群
          </button>
        </div>

        {tab === 'current' && (
          <div className="flex-1 space-y-1.5 overflow-auto p-3">
            {members.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">群内暂无成员</div>
            ) : (
              members.map((member) => (
                <div
                  key={memberKey(member)}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: roleColor[member.role] ?? '#888' }}
                  >
                    {member.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--color-text-primary)]">{member.name}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{member.role}</div>
                  </div>
                  {member.role !== '学生' && (
                    <button
                      type="button"
                      onClick={() => void handleRemove(member)}
                      disabled={pendingKey !== null}
                      className="shrink-0 rounded-full border border-red-200 px-2 py-0.5 text-[10px] text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      移出
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'add' && (
          <>
            <div className="shrink-0 px-4 pb-2 pt-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索姓名或角色"
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="flex-1 space-y-1.5 overflow-auto px-3 pb-3">
              {loading && (
                <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">加载中...</div>
              )}
              {!loading && loadError && (
                <div className="py-8 text-center text-xs text-red-500">{loadError}</div>
              )}
              {!loading && !loadError && available.length === 0 && (
                <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                  {search ? '没有匹配的成员' : '暂无可邀请成员'}
                </div>
              )}
              {!loading && !loadError && available.map((member) => (
                <div
                  key={memberKey(member)}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: roleColor[member.role] ?? '#888' }}
                  >
                    {member.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--color-text-primary)]">{member.name}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{member.role}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAdd(member)}
                    disabled={pendingKey !== null}
                    className="shrink-0 rounded-full border border-[var(--color-primary)] px-2 py-0.5 text-[10px] text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + 加入
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
