import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '../../../../components/ui/toastCore'
import { logger } from '../../../../lib/logger'
import { useWorkbenchStore } from '../../store/workbenchStore'

const log = logger.child('upload')

export function UploadHandoutModal() {
  const item = useWorkbenchStore((s) => s.handoutUploadItem)
  const close = useWorkbenchStore((s) => s.closeHandoutUpload)
  const uploadHandoutMaterial = useWorkbenchStore((s) => s.uploadHandoutMaterial)

  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const autoCloseTimerRef = useRef<number | null>(null)
  const wasOpenRef = useRef(false)

  const isOpen = Boolean(item)

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // 关闭→重新打开时清掉上一次会话残留的文件与报错
      if (autoCloseTimerRef.current !== null) {
        window.clearTimeout(autoCloseTimerRef.current)
        autoCloseTimerRef.current = null
      }
      setFile(null)
      setDragging(false)
      setSubmitted(false)
      setUploading(false)
      setUploadError('')
    }
    wasOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => () => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current)
    }
  }, [])

  if (!item) return null

  function handleFile(f: File) {
    setFile(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  async function handleSubmit() {
    if (!file || !item) return
    setUploading(true)
    setUploadError('')
    try {
      await uploadHandoutMaterial(String(item.taskRowId ?? ''), file)
      setSubmitted(true)
      autoCloseTimerRef.current = window.setTimeout(() => {
        autoCloseTimerRef.current = null
        setSubmitted(false)
        setFile(null)
        close()
      }, 1200)
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败，请重试'
      log.warn('handout.upload.failed', { message: error instanceof Error ? error.message : String(error) })
      setUploadError(message)
      toast.error(`讲义上传失败：${message}`)
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    setFile(null)
    setSubmitted(false)
    close()
  }

  const allowedTypes = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png']
  const fileExt = file?.name.split('.').pop()?.toLowerCase() ?? ''
  const isValidType = allowedTypes.includes(fileExt)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-[min(560px,94vw)] rounded-[var(--radius-card)] bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">上传课后讲义</div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Lesson info */}
          <div className="rounded-lg bg-[var(--color-bg-left)] px-3 py-2">
            <div className="text-xs text-[var(--color-text-secondary)]">课次</div>
            <div className="mt-0.5 text-sm font-medium text-[var(--color-text-primary)]">{item.name}</div>
          </div>

          {/* Upload area */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
              选择讲义文件
              <span className="ml-1 text-[var(--color-text-muted)]">（支持 PDF / Word / PPT / 图片）</span>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={[
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 transition-colors',
                dragging
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : file
                    ? 'border-green-400 bg-green-50'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]',
              ].join(' ')}
            >
              {file ? (
                <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4caf74" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <polyline points="9 15 11 17 15 13" />
                  </svg>
                  <div className="text-center">
                    <div className="text-xs font-medium text-green-600">{file.name}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                      {(file.size / 1024).toFixed(0)} KB · 点击重新选择
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)]">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <div className="text-center">
                    <div className="text-xs font-medium text-[var(--color-text-secondary)]">点击或拖拽文件到此处</div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">PDF · Word · PPT · 图片</div>
                  </div>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {file && !isValidType && (
              <div className="mt-1 text-[10px] text-red-500">不支持该文件格式，请重新选择</div>
            )}
          </div>

          {/* Submit */}
          {!!uploadError && (
            <div className="text-[10px] text-red-500">{uploadError}</div>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || !isValidType || submitted || uploading}
            className={[
              'w-full rounded-lg py-2 text-sm font-semibold transition-colors',
              submitted
                ? 'bg-green-500 text-white'
                : file && isValidType
                  ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400',
            ].join(' ')}
          >
            {submitted ? '上传成功 ✓' : uploading ? '上传中…' : '确认上传'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
