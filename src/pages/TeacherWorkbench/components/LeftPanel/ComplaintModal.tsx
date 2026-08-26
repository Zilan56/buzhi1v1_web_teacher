import { createPortal } from 'react-dom'
import { useState, useRef, useEffect } from 'react'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'
import { dateKeyOf } from '../../../../lib/datetime'
import { useWorkbenchStore } from '../../store/workbenchStore'
import type { ComplaintAttachment } from '../../types'
import type { StudentItem } from '../../types'

const log = logger.child('complaint')

const STEP_LABELS = ['学生诉求', '投诉原因', '解决建议', '截止时间', '附件信息']

function addDaysFromToday(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days)
  return dateKeyOf(d)
}

export function ComplaintModal({ student, onClose }: { student: StudentItem; onClose: () => void }) {
  const [step, setStep]           = useState(1)
  const [demand, setDemand]       = useState('')
  const [reason, setReason]       = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [resolvers, setResolvers] = useState<string[]>([])
  const [deadline, setDeadline]   = useState('')
  const [extraNote, setExtraNote] = useState('')
  const [attachments, setAttachments] = useState<ComplaintAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  const addComplaint    = useWorkbenchStore((s) => s.addComplaint)
  const groupMembersMap = useWorkbenchStore((s) => s.groupMembersMap)

  // 该学生所在群的所有非学生成员，作为可选解决人
  const groupMembers = (student.contactId ? (groupMembersMap[student.contactId] ?? []) : [])
    .filter((m) => m.role !== '学生')

  function canNext() {
    if (step === 1) return demand.trim().length > 0
    if (step === 2) return reason.trim().length > 0
    if (step === 3) return suggestion.trim().length > 0 && resolvers.length > 0
    if (step === 4) return deadline.length > 0
    return true
  }

  function toggleResolver(r: string) {
    setResolvers((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r])
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setAttachments((p) => [...p, {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          dataUrl: ev.target?.result as string,
        }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await addComplaint({
        studentId: student.id,
        studentName: student.name,
        demand: demand.trim(),
        reason: reason.trim(),
        suggestion: suggestion.trim(),
        resolvers: resolvers.map((k) => k.split('__')[0]),
        deadline,
        extraNote: extraNote.trim(),
        attachments,
        submittedBy: '老师',
      })
      setDone(true)
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null
        onClose()
      }, 1400)
    } catch (error) {
      log.warn('complaint.submit.failed', { studentId: student.id, message: error instanceof Error ? error.message : String(error) })
      toast.error('投诉提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  function renderStep() {
    if (done) return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-green-600">投诉已提交</div>
        <div className="text-center text-[11px] text-[var(--color-text-muted)]">
          已同步通知：{resolvers.map((k) => k.split('__')[0]).join('、')}
        </div>
      </div>
    )

    switch (step) {
      case 1:
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--color-text-muted)]">描述学生提出的具体诉求或期望。</p>
            <textarea
              autoFocus rows={5} value={demand} onChange={(e) => setDemand(e.target.value)}
              placeholder="例：学生反映课程内容与预期不符，希望调整教学方向…"
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2.5 text-xs leading-relaxed outline-none transition-colors focus:border-[var(--color-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
        )

      case 2:
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--color-text-muted)]">说明本次投诉的具体原因。</p>
            <textarea
              autoFocus rows={5} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="例：教学进度过快，学生反映跟不上；或老师未按约定时间上课…"
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2.5 text-xs leading-relaxed outline-none transition-colors focus:border-[var(--color-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">解决建议</div>
              <textarea
                autoFocus rows={3} value={suggestion} onChange={(e) => setSuggestion(e.target.value)}
                placeholder="建议如何处理此投诉…"
                className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2.5 text-xs leading-relaxed outline-none transition-colors focus:border-[var(--color-primary)] placeholder:text-[var(--color-text-muted)]"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                建议解决人
                <span className="text-[10px] font-normal text-red-400">（必选至少一项）</span>
              </div>
              {groupMembers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
                  该学生暂无关联群组成员
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {groupMembers.map((m) => {
                    const key = `${m.name}__${m.role}`
                    const selected = resolvers.includes(key)
                    return (
                      <button key={key} type="button" onClick={() => toggleResolver(key)}
                        className={[
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                          selected
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                            : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
                        ].join(' ')}>
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                          {m.name.slice(-1)}
                        </div>
                        <div className="min-w-0">
                          <div className={['text-xs font-medium leading-tight', selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'].join(' ')}>
                            {m.name}
                          </div>
                          <div className="text-[10px] text-[var(--color-text-muted)]">{m.role}</div>
                        </div>
                        {selected && (
                          <svg className="ml-auto shrink-0 text-[var(--color-primary)]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {resolvers.length > 0 && (
                <div className="mt-2 text-[10px] text-[var(--color-primary)]">
                  已选：{resolvers.map((k) => k.split('__')[0]).join('、')}
                </div>
              )}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-[11px] text-[var(--color-text-muted)]">设定此投诉的最迟解决时间。</p>
            <input
              type="date" autoFocus value={deadline}
              min={dateKeyOf(new Date())}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
            />
            <div className="flex gap-2">
              {[3, 7, 14].map((days) => {
                const val = addDaysFromToday(days)
                return (
                  <button key={days} type="button" onClick={() => setDeadline(val)}
                    className={[
                      'rounded-lg border px-3 py-1 text-xs transition-colors',
                      deadline === val
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]',
                    ].join(' ')}>
                    {days} 天内
                  </button>
                )
              })}
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                补充说明
                <span className="text-[10px] font-normal text-[var(--color-text-muted)]">（可选）</span>
              </div>
              <textarea
                rows={3} value={extraNote} onChange={(e) => setExtraNote(e.target.value)}
                placeholder="其他需要说明的情况或背景…"
                className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2.5 text-xs leading-relaxed outline-none transition-colors focus:border-[var(--color-primary)] placeholder:text-[var(--color-text-muted)]"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                上传截图 / 聊天记录
                <span className="text-[10px] font-normal text-[var(--color-text-muted)]">（可选）</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} />
              {attachments.length === 0 ? (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="group flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--color-border)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span className="text-[10px] text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]">点击上传图片</span>
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div key={att.id} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--color-border)]">
                      <img src={att.dataUrl} alt={att.name} className="h-full w-full object-cover" />
                      <button type="button"
                        onClick={() => setAttachments((p) => p.filter((a) => a.id !== att.id))}
                        className="absolute inset-0 hidden items-center justify-center bg-black/50 text-xs text-white group-hover:flex">
                        ✕
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )

      default: return null
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative flex max-h-[84vh] w-[min(720px,94vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">学生投诉建议增加</span>
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{student.name} · {student.grade}</div>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-left)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Step indicator */}
        {!done && (
          <div className="flex items-start border-b border-[var(--color-border)] px-5 py-2.5">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const isActive = n === step
              const isDone   = n < step
              return (
                <div key={n} className="flex items-center">
                  {i > 0 && (
                    <div className={['mx-1 h-px w-5 shrink-0 transition-colors', isDone ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')} />
                  )}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className={[
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                      isDone   ? 'bg-[var(--color-primary)] text-white' :
                      isActive ? 'bg-red-500 text-white' :
                                 'bg-[var(--color-bg-left)] text-[var(--color-text-muted)]',
                    ].join(' ')}>
                      {isDone ? '✓' : n}
                    </div>
                    <span className={[
                      'text-[9px] whitespace-nowrap',
                      isActive ? 'font-semibold text-red-500' : isDone ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]',
                    ].join(' ')}>
                      {label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div className="max-h-[68vh] flex-1 overflow-auto px-5 py-4">
          {renderStep()}
        </div>

        {/* Footer */}
        {!done && (
          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
            <button type="button"
              onClick={() => step > 1 ? setStep((s) => s - 1) : onClose()}
              className="rounded-lg border border-[var(--color-border)] px-4 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-left)]">
              {step === 1 ? '取消' : '上一步'}
            </button>
            {step < 5 ? (
              <button type="button" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}
                className="rounded-lg bg-[var(--color-primary)] px-5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                下一步
              </button>
            ) : (
              <button type="button" disabled={submitting} onClick={() => void handleSubmit()}
                className="rounded-lg bg-red-500 px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40">
                {submitting ? '提交中…' : '确认提交'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
