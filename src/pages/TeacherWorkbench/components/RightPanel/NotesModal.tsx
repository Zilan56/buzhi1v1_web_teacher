import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useWorkbenchStore } from '../../store/workbenchStore'

export function NotesModal({ contactName }: { contactName: string }) {
  const notesContactId = useWorkbenchStore((s) => s.notesContactId)
  const notesMap       = useWorkbenchStore((s) => s.notesMap)
  const closeNotes     = useWorkbenchStore((s) => s.closeNotes)
  const addNote        = useWorkbenchStore((s) => s.addNote)
  const deleteNote     = useWorkbenchStore((s) => s.deleteNote)
  const loadNotes      = useWorkbenchStore((s) => s.loadNotes)
  const teacherName    = useWorkbenchStore((s) => s.teacherName)

  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (notesContactId) {
      void loadNotes(notesContactId)
    }
  }, [notesContactId, loadNotes])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [notesMap, notesContactId])

  if (!notesContactId) return null

  const notes = notesMap[notesContactId] ?? []

  async function handleAdd() {
    const text = draft.trim()
    if (!text || !notesContactId) return
    setSaving(true)
    await addNote(notesContactId, text, teacherName || '老师')
    setDraft('')
    setSaving(false)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={closeNotes}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative flex w-[min(520px,94vw)] flex-col rounded-[var(--radius-card)] bg-white shadow-lg"
        style={{ maxHeight: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">备注</div>
            <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{contactName} · 所有老师可见</div>
          </div>
          <button
            type="button"
            onClick={closeNotes}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]"
          >
            ✕
          </button>
        </div>

        {/* Notes list */}
        <div ref={listRef} className="flex-1 overflow-auto px-4 py-3 space-y-3" style={{ minHeight: 80 }}>
          {notes.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">暂无备注，添加第一条吧</div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="group rounded-[var(--radius-card)] bg-[var(--color-bg-left)] px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[var(--color-primary)]">{note.authorName}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {format(new Date(note.createdAt), 'MM-dd HH:mm')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => notesContactId && void deleteNote(notesContactId, note.id)}
                    className="hidden group-hover:flex items-center rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    删除
                  </button>
                </div>
                <div className="text-xs text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
                  {note.text}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[var(--color-border)] px-4 py-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAdd() }
            }}
            placeholder="添加备注… (Enter 提交，Shift+Enter 换行)"
            rows={3}
            className="w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-text-muted)]"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!draft.trim() || saving}
              onClick={() => void handleAdd()}
              className="rounded-[var(--radius-card)] bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-40"
            >
              {saving ? '提交中…' : '添加备注'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
