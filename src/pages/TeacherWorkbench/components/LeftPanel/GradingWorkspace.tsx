import { createPortal } from 'react-dom'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ReviewItem } from '../../api/submissions'
import { fetchSubmissionFileBlob, getSubmissionFileKind, uploadReviewedSubmissionPdf } from '../../api/submissions'
import { getSubmissionStageMeta } from '../../lib/submissionLabels'
import { api } from '../../../../lib/api'

// ── pdfjs worker ──────────────────────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

// ── types ─────────────────────────────────────────────────────────────────────
type Tool           = 'pointer' | 'text' | 'brush' | 'underline' | 'eraser'
type ReviewCategory = '入学诊断' | '作业批改' | '考试整卷批改'

type BrushStroke     = { type: 'brush';     points: [number, number][]; color: string; width: number }
type UnderlineStroke = { type: 'underline'; x1: number; y1: number; x2: number; color: string; width: number }
type DrawingStroke   = BrushStroke | UnderlineStroke

interface TextAnn {
  id: string; x: number; y: number; text: string; color: string; opaque: boolean
}

interface PageAnnotationState {
  strokes: DrawingStroke[]
  textAnns: TextAnn[]
}

interface StudentPdfPanelHandle {
  exportReviewedPdfFile: () => Promise<File | null>
  hasEdits: () => boolean
}

// ── constants ─────────────────────────────────────────────────────────────────
const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#111827']
const WIDTHS  = [1.5, 3, 6]

const TYPE_CATEGORY: Record<ReviewItem['reviewType'], ReviewCategory> = {
  '入学诊断':  '入学诊断',
  '卡点练习题': '作业批改',
  '卡点考试':  '考试整卷批改',
  '整卷批改':  '考试整卷批改',
  '二阶试卷':  '考试整卷批改',
}
const CATEGORY_CFG: Record<ReviewCategory, { desc: string; activeCls: string; dot: string }> = {
  '入学诊断':    { desc: '学生初始水平评测',   activeCls: 'border-[#185fa5] bg-[#e6f1fb] text-[#185fa5]', dot: 'bg-[#185fa5]' },
  '作业批改':    { desc: '日常练习 · 卡点作业', activeCls: 'border-[#2d6a2d] bg-[#e8f5e2] text-[#2d6a2d]', dot: 'bg-[#2d6a2d]' },
  '考试整卷批改': { desc: '阶段考核 · 完整试卷', activeCls: 'border-[#6b21a8] bg-[#f3e8ff] text-[#6b21a8]', dot: 'bg-[#6b21a8]' },
}
const REVIEW_TYPE_CLS: Record<ReviewItem['reviewType'], string> = {
  '入学诊断':  'bg-[#e6f1fb] text-[#185fa5] border-[#b8d4ef]',
  '卡点练习题': 'bg-[#e8f5e2] text-[#2d6a2d] border-[#b5d9a8]',
  '卡点考试':  'bg-[#fff0e8] text-[#b06040] border-[#f0c8a8]',
  '整卷批改':  'bg-[#f3e8ff] text-[#6b21a8] border-[#d4b4f4]',
  '二阶试卷':  'bg-[#fef3c7] text-[#92400e] border-[#fcd34d]',
}
void TYPE_CATEGORY
void CATEGORY_CFG
void REVIEW_TYPE_CLS

const PRIORITY_CFG = {
  urgent: { cls: 'bg-red-50 text-red-600 border border-red-200',          label: '紧急' },
  normal: { cls: 'bg-orange-50 text-orange-500 border border-orange-200', label: '普通' },
  low:    { cls: 'bg-green-50 text-green-600 border border-green-200',     label: '宽松' },
}
const GRADE_CLS: Record<string, string> = {
  优: 'border-green-500 bg-green-50 text-green-700',
  良: 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]',
  中: 'border-orange-400 bg-orange-50 text-orange-600',
  差: 'border-red-400 bg-red-50 text-red-600',
}

// ── canvas utilities ──────────────────────────────────────────────────────────
function hexToRgb(color: string) {
  const safeColor = String(color || '').replace('#', '')
  if (safeColor.length !== 6) return rgb(0, 0, 0)

  const r = parseInt(safeColor.slice(0, 2), 16) / 255
  const g = parseInt(safeColor.slice(2, 4), 16) / 255
  const b = parseInt(safeColor.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}

function hasAnyAnnotations(pages: Record<number, PageAnnotationState>) {
  return Object.values(pages).some((page) => page.strokes.length > 0 || page.textAnns.length > 0)
}

function clonePdfBytes(bytes: ArrayBuffer) {
  return bytes.slice(0)
}

async function exportAnnotatedPdfFile({
  originalBytes,
  pages,
  renderSizes,
  fallbackName,
}: {
  originalBytes: ArrayBuffer | null
  pages: Record<number, PageAnnotationState>
  renderSizes: Record<number, { width: number; height: number }>
  fallbackName: string
}) {
  if (!originalBytes || !hasAnyAnnotations(pages)) {
    return null
  }

  const pdfDoc = await PDFDocument.load(clonePdfBytes(originalBytes))
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const [pageKey, pageState] of Object.entries(pages)) {
    if (!pageState.strokes.length && !pageState.textAnns.length) continue

    const page = pdfDoc.getPage(Number(pageKey) - 1)
    const pdfWidth = page.getWidth()
    const pdfHeight = page.getHeight()
    const renderSize = renderSizes[Number(pageKey)] ?? { width: pdfWidth, height: pdfHeight }
    const scaleX = pdfWidth / Math.max(renderSize.width, 1)
    const scaleY = pdfHeight / Math.max(renderSize.height, 1)
    const lineScale = Math.max(scaleX, scaleY)

    for (const stroke of pageState.strokes) {
      if (stroke.type === 'brush') {
        if (stroke.points.length === 1) {
          const [x, y] = stroke.points[0]
          page.drawCircle({
            x: x * scaleX,
            y: pdfHeight - y * scaleY,
            size: Math.max((stroke.width * lineScale) / 2, 0.8),
            color: hexToRgb(stroke.color),
          })
          continue
        }

        for (let i = 1; i < stroke.points.length; i += 1) {
          const [x1, y1] = stroke.points[i - 1]
          const [x2, y2] = stroke.points[i]
          page.drawLine({
            start: { x: x1 * scaleX, y: pdfHeight - y1 * scaleY },
            end: { x: x2 * scaleX, y: pdfHeight - y2 * scaleY },
            thickness: Math.max(stroke.width * lineScale, 0.8),
            color: hexToRgb(stroke.color),
          })
        }
      } else {
        page.drawLine({
          start: { x: stroke.x1 * scaleX, y: pdfHeight - stroke.y1 * scaleY },
          end: { x: stroke.x2 * scaleX, y: pdfHeight - stroke.y1 * scaleY },
          thickness: Math.max(stroke.width * lineScale, 0.8),
          color: hexToRgb(stroke.color),
        })
      }
    }

    for (const ann of pageState.textAnns) {
      const fontSize = Math.max(12 * lineScale, 10)
      const textWidth = font.widthOfTextAtSize(ann.text, fontSize)
      const textHeight = font.heightAtSize(fontSize)
      const x = ann.x * scaleX - textWidth / 2
      const y = pdfHeight - ann.y * scaleY - textHeight / 2

      if (ann.opaque) {
        page.drawRectangle({
          x: x - 6 * scaleX,
          y: y - 3 * scaleY,
          width: textWidth + 12 * scaleX,
          height: textHeight + 6 * scaleY,
          color: rgb(1, 1, 1),
        })
      }

      page.drawText(ann.text, {
        x,
        y,
        size: fontSize,
        font,
        color: hexToRgb(ann.color),
      })
    }
  }

  const rawName = fallbackName.trim() || `reviewed-${Date.now()}.pdf`
  const fileName = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`
  const bytes = await pdfDoc.save()
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  return new File([blob], fileName, { type: 'application/pdf' })
}

function paintStroke(ctx: CanvasRenderingContext2D, s: DrawingStroke, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = s.color
  ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (s.type === 'brush') {
    if (s.points.length === 1) {
      ctx.beginPath(); ctx.arc(s.points[0][0], s.points[0][1], s.width / 2, 0, Math.PI * 2)
      ctx.fillStyle = s.color; ctx.globalAlpha = alpha; ctx.fill()
    } else {
      ctx.beginPath(); ctx.moveTo(s.points[0][0], s.points[0][1])
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0], s.points[i][1])
      ctx.stroke()
    }
  } else {
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y1); ctx.stroke()
  }
  ctx.restore()
}
function repaint(canvas: HTMLCanvasElement, strokes: DrawingStroke[], cur: DrawingStroke | null) {
  const ctx = canvas.getContext('2d'); if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  strokes.forEach((s) => paintStroke(ctx, s))
  if (cur) paintStroke(ctx, cur, 0.6)
}
function eraseNearest(strokes: DrawingStroke[], x: number, y: number, threshold = 18): DrawingStroke[] {
  if (!strokes.length) return strokes
  const dists = strokes.map((s, i) => {
    const d = s.type === 'brush'
      ? s.points.reduce((m, [px, py]) => Math.min(m, Math.hypot(px - x, py - y)), Infinity)
      : (() => { const lo = Math.min(s.x1, s.x2), hi = Math.max(s.x1, s.x2), cx = Math.max(lo, Math.min(hi, x)); return Math.hypot(cx - x, s.y1 - y) })()
    return { i, d }
  })
  const best = dists.sort((a, b) => a.d - b.d)[0]
  return best.d < threshold ? strokes.filter((_, i) => i !== best.i) : strokes
}

// ── ToolBtn ───────────────────────────────────────────────────────────────────
function ToolBtn({ active, onClick, title, children, warn }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode; warn?: boolean
}) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={[
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        active && warn ? 'bg-red-500 text-white' :
        active        ? 'bg-[var(--color-primary)] text-white' :
        warn          ? 'text-red-400 hover:bg-red-50' :
                        'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]',
      ].join(' ')}>
      {children}
    </button>
  )
}

// ── DrawingToolbar ─────────────────────────────────────────────────────────────
function DrawingToolbar({ tool, setTool, color, setColor, width, setWidth, onUndo, extra }: {
  tool: Tool; setTool: (t: Tool) => void
  color: string; setColor: (c: string) => void
  width: number; setWidth: (w: number) => void
  onUndo: () => void; extra?: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-white px-2.5 py-1.5">
      <ToolBtn active={tool === 'pointer'}   onClick={() => setTool('pointer')}   title="选择"><svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M2 0L14 9l-5.5 1.5L6 16z" /></svg></ToolBtn>
      <ToolBtn active={tool === 'text'}      onClick={() => setTool('text')}      title="文字"><span className="text-[11px] font-bold leading-none">T</span></ToolBtn>
      <ToolBtn active={tool === 'brush'}     onClick={() => setTool('brush')}     title="画笔">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><circle cx="11" cy="11" r="2" />
        </svg>
      </ToolBtn>
      <ToolBtn active={tool === 'underline'} onClick={() => setTool('underline')} title="下划线">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3v7a6 6 0 0012 0V3" /><line x1="4" y1="21" x2="20" y2="21" />
        </svg>
      </ToolBtn>
      <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title="橡皮" warn>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20H7L3 16l10-10 7 7-3 3" /><path d="M6.5 17.5l3-3" />
        </svg>
      </ToolBtn>
      <div className="mx-1 h-3.5 w-px bg-[var(--color-border)]" />
      <div className="flex items-center gap-[3px]">
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)}
            className={['h-3.5 w-3.5 rounded-full border-2 transition-transform', color === c ? 'border-gray-700 scale-[1.3]' : 'border-transparent hover:scale-110'].join(' ')}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <div className="mx-1 h-3.5 w-px bg-[var(--color-border)]" />
      <div className="flex items-center gap-1">
        {WIDTHS.map((w) => (
          <button key={w} type="button" onClick={() => setWidth(w)}
            className={['flex h-5 w-5 items-center justify-center rounded transition-colors', width === w ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-bg-left)]'].join(' ')}>
            <div className="rounded-full" style={{ width: w + 2, height: w + 2, backgroundColor: color }} />
          </button>
        ))}
      </div>
      {extra && <><div className="mx-1 h-3.5 w-px bg-[var(--color-border)]" />{extra}</>}
      <div className="flex-1" />
      <button type="button" title="撤销" onClick={onUndo}
        className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-left)] transition-colors">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" /><path d="M3 13A9 9 0 1 0 5.6 5.6L3 8" />
        </svg>
      </button>
    </div>
  )
}

// ── AnnotationLayer ────────────────────────────────────────────────────────────
function AnnotationLayer({
  tool, color, width, strokes, setStrokes, curStroke, setCurStroke,
  textAnns, setTextAnns, canvasRef, textInputRef,
  children, className, style, opaque = false,
}: {
  tool: Tool; color: string; width: number
  strokes: DrawingStroke[]; setStrokes: React.Dispatch<React.SetStateAction<DrawingStroke[]>>
  curStroke: DrawingStroke | null; setCurStroke: React.Dispatch<React.SetStateAction<DrawingStroke | null>>
  textAnns: TextAnn[]; setTextAnns: React.Dispatch<React.SetStateAction<TextAnn[]>>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  textInputRef: React.RefObject<HTMLInputElement | null>
  children?: React.ReactNode; className?: string; style?: React.CSSProperties; opaque?: boolean
}) {
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)
  const [draftText, setDraftText]   = useState('')
  const isDrawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    repaint(canvas, strokes, curStroke)
  }, [strokes, curStroke, canvasRef])

  function getXY(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function onCanvasDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getXY(e)
    if (tool === 'eraser') { setStrokes((p) => eraseNearest(p, x, y)); return }
    if (tool !== 'brush' && tool !== 'underline') return
    isDrawing.current = true
    if (tool === 'brush') setCurStroke({ type: 'brush', points: [[x, y]], color, width })
    else setCurStroke({ type: 'underline', x1: x, y1: y, x2: x, color, width })
  }
  function onCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current || !curStroke) return
    const { x, y } = getXY(e)
    if (curStroke.type === 'brush') setCurStroke({ ...curStroke, points: [...curStroke.points, [x, y]] })
    else if (curStroke.type === 'underline') setCurStroke({ ...curStroke, x2: x })
  }
  function onCanvasUp() {
    if (!isDrawing.current) return
    isDrawing.current = false
    if (curStroke) setStrokes((p) => [...p, curStroke])
    setCurStroke(null)
  }
  function onLayerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'text') return
    const r = e.currentTarget.getBoundingClientRect()
    setPendingPos({ x: e.clientX - r.left, y: e.clientY - r.top }); setDraftText('')
    setTimeout(() => textInputRef.current?.focus(), 30)
  }
  function confirmText() {
    if (pendingPos && draftText.trim())
      setTextAnns((p) => [...p, { id: `t${Date.now()}`, x: pendingPos.x, y: pendingPos.y, text: draftText.trim(), color, opaque }])
    setPendingPos(null); setDraftText('')
  }
  const canvasCursor = tool === 'brush' || tool === 'underline' ? 'cursor-crosshair' : tool === 'eraser' ? 'cursor-cell' : ''
  const canvasEvents = tool === 'brush' || tool === 'underline' || tool === 'eraser' ? 'auto' : 'none'

  return (
    <div className={['relative', tool === 'text' ? 'cursor-text' : '', className ?? ''].join(' ')} style={style} onClick={onLayerClick}>
      {children}
      {textAnns.map((ann) => (
        <div key={ann.id} className="absolute z-20 flex max-w-[220px] items-start gap-1 rounded px-1.5 py-0.5 text-[12px] leading-snug shadow-sm"
          style={{ left: ann.x, top: ann.y, transform: 'translate(-50%,-50%)', color: ann.color, border: `1.5px solid ${ann.color}`, backgroundColor: ann.opaque ? '#fff' : ann.color + '18' }}
          onClick={(e) => e.stopPropagation()}>
          {!ann.opaque && <span className="mt-0.5 shrink-0 text-[10px]">✎</span>}
          <span>{ann.text}</span>
          {(tool === 'eraser' || tool === 'pointer') && (
            <button type="button" className="ml-0.5 mt-0.5 shrink-0 text-[10px] opacity-50 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); setTextAnns((p) => p.filter((a) => a.id !== ann.id)) }}>✕</button>
          )}
        </div>
      ))}
      {pendingPos && (
        <div className="absolute z-30" style={{ left: pendingPos.x, top: pendingPos.y, transform: 'translate(-6px,-14px)' }} onClick={(e) => e.stopPropagation()}>
          <input ref={textInputRef} value={draftText} onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmText(); if (e.key === 'Escape') { setPendingPos(null); setDraftText('') } }}
            onBlur={confirmText} placeholder="输入后 Enter 确认"
            className="w-44 rounded border-2 bg-white px-2.5 py-1.5 text-xs shadow-xl outline-none placeholder:text-gray-300"
            style={{ borderColor: color }} />
        </div>
      )}
      <canvas ref={canvasRef} className={['absolute inset-0 z-[15]', canvasCursor].join(' ')}
        style={{ pointerEvents: canvasEvents, width: '100%', height: '100%' }}
        onMouseDown={onCanvasDown} onMouseMove={onCanvasMove} onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp} />
    </div>
  )
}

// ── PanelShell ─────────────────────────────────────────────────────────────────
function PanelShell({ title, badge, right, children }: {
  title: string; badge?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{title}</span>
        {badge}
        <div className="flex-1" />
        {right}
      </div>
      {children}
    </div>
  )
}

// ── AnswerPanel (左上) ────────────────────────────────────────────────────────
function AnswerPanel() {
  const [pdfDoc, setPdfDoc]         = useState<PDFDocumentProxy | null>(null)
  const [pdfPage, setPdfPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef      = useRef<HTMLDivElement>(null)
  const fileRef      = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    async function render() {
      const page      = await pdfDoc!.getPage(pdfPage); if (cancelled) return
      const container = wrapRef.current; const canvas = pdfCanvasRef.current
      if (!canvas || !container) return
      const naturalW = page.getViewport({ scale: 1 }).width
      const scale    = Math.min((container.offsetWidth - 32) / naturalW, 1.8)
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width; canvas.height = viewport.height
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    }
    render().catch(console.error)
    return () => { cancelled = true }
  }, [pdfDoc, pdfPage])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setLoading(true); setError('')
    try {
      const buf = await file.arrayBuffer()
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
      setPdfDoc(doc); setTotalPages(doc.numPages); setPdfPage(1)
    } catch { setError('PDF 文件解析失败') }
    finally { setLoading(false) }
  }


  const pageNav = pdfDoc ? (
    <div className="flex items-center gap-0.5 text-xs text-[var(--color-text-secondary)]">
      <button type="button" disabled={pdfPage <= 1} onClick={() => setPdfPage((p) => p - 1)}
        className="flex h-5 w-5 items-center justify-center rounded text-sm hover:bg-white disabled:opacity-30">‹</button>
      <span className="w-12 text-center tabular-nums">{pdfPage} / {totalPages}</span>
      <button type="button" disabled={pdfPage >= totalPages} onClick={() => setPdfPage((p) => p + 1)}
        className="flex h-5 w-5 items-center justify-center rounded text-sm hover:bg-white disabled:opacity-30">›</button>
    </div>
  ) : null

  return (
    <PanelShell title="参考答案"
      right={
        <div className="flex items-center gap-1.5">
          {pageNav}
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {pdfDoc ? '更换答案' : '上传答案'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf" className="sr-only" onChange={handleFile} />
        </div>
      }
    >
      <div ref={wrapRef} className="flex-1 overflow-auto bg-[#d4d8dc] p-4">
        {loading && <div className="flex h-full items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>加载中…</div>}
        {!loading && error && <div className="flex h-24 items-center justify-center text-xs text-red-400">{error}</div>}
        {!loading && !error && !pdfDoc && (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="group flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--color-border)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <div className="text-center">
              <div className="text-xs font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)]">上传参考答案 PDF</div>
              <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">用于对照学生提交内容</div>
            </div>
          </button>
        )}
        {!loading && !error && pdfDoc && (
          <div className="mx-auto" style={{ display: 'inline-block' }}>
            <canvas ref={pdfCanvasRef} className="block shadow-[0_2px_20px_rgba(0,0,0,0.15)]" />
          </div>
        )}
      </div>
    </PanelShell>
  )
}

// ── StudentPdfPanel (左下) ────────────────────────────────────────────────────
const StudentPdfPanel = forwardRef<StudentPdfPanelHandle, { item: ReviewItem }>(function StudentPdfPanel({ item }, ref) {
  const [pdfDoc, setPdfDoc]         = useState<PDFDocumentProxy | null>(null)
  const [pdfPage, setPdfPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [pdfError, setPdfError]     = useState('')
  const [previewKind, setPreviewKind] = useState<'pdf' | 'image' | 'other'>('pdf')
  const [imageUrl, setImageUrl]     = useState('')
  const itemKey = `${item.id}|${item.fileName}|${item.fileKind}`
  const [prevItemKey, setPrevItemKey] = useState(itemKey)
  const [tool, setTool]     = useState<Tool>('pointer')
  const [color, setColor]   = useState(COLORS[0])
  const [width, setWidth]   = useState(WIDTHS[1])
  const [strokes, setStrokes]       = useState<DrawingStroke[]>([])
  const [curStroke, setCurStroke]   = useState<DrawingStroke | null>(null)
  const [textAnns, setTextAnns]     = useState<TextAnn[]>([])
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotRef     = useRef<HTMLCanvasElement>(null)
  const wrapRef      = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const blobUrlRef   = useRef<string>('')
  const originalPdfBytesRef = useRef<ArrayBuffer | null>(null)
  const annotationMapRef = useRef<Record<number, PageAnnotationState>>({})
  const renderSizeMapRef = useRef<Record<number, { width: number; height: number }>>({})

  if (prevItemKey !== itemKey) {
    setPrevItemKey(itemKey)
    setPdfLoading(true); setPdfError('')
    setPdfDoc(null)
    setTotalPages(0)
    setPdfPage(1)
    setPreviewKind('pdf')
    setImageUrl('')
  }

  useEffect(() => {
    let cancelled = false
    originalPdfBytesRef.current = null
    fetchSubmissionFileBlob(item.id)
      .then(async (blob) => {
        const url = URL.createObjectURL(blob)
        if (cancelled) { URL.revokeObjectURL(url); return }
        blobUrlRef.current = url
        annotationMapRef.current = {}
        renderSizeMapRef.current = {}
        const hintedPreviewKind = item.fileKind || 'other'
        const detectedPreviewKind = getSubmissionFileKind(item.fileName, blob.type)
        const nextPreviewKind = detectedPreviewKind === 'other' && hintedPreviewKind !== 'other'
          ? hintedPreviewKind
          : detectedPreviewKind
        setPreviewKind(nextPreviewKind)

        if (nextPreviewKind === 'pdf') {
          const sourceBytes = await blob.arrayBuffer()
          originalPdfBytesRef.current = clonePdfBytes(sourceBytes)
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) }).promise
          if (cancelled) return
          setPdfDoc(doc); setTotalPages(doc.numPages); setPdfPage(1)
          return
        }

        if (nextPreviewKind === 'image') {
          setImageUrl(url)
          return
        }

        setPdfError('当前提交文件暂不支持预览')
      })
      .catch(() => { if (!cancelled) setPdfError('无法加载学生提交文件') })
      .finally(() => { if (!cancelled) setPdfLoading(false) })
    return () => {
      cancelled = true
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = '' }
      setImageUrl('')
    }
  }, [item.fileName, item.fileKind, item.id])

  useEffect(() => {
    if (!pdfDoc) return; let cancelled = false
    async function render() {
      const page = await pdfDoc!.getPage(pdfPage); if (cancelled) return
      const container = wrapRef.current; const canvas = pdfCanvasRef.current
      if (!canvas || !container) return
      const naturalW = page.getViewport({ scale: 1 }).width
      const scale    = Math.min((container.offsetWidth - 32) / naturalW, 1.8)
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width; canvas.height = viewport.height
      renderSizeMapRef.current[pdfPage] = { width: viewport.width, height: viewport.height }
      const ann = annotRef.current
      if (ann) { ann.width = viewport.width; ann.height = viewport.height }
      const savedState = annotationMapRef.current[pdfPage] || { strokes: [], textAnns: [] }
      setStrokes(savedState.strokes); setCurStroke(null); setTextAnns(savedState.textAnns)
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    }
    render().catch(console.error)
    return () => { cancelled = true }
  }, [pdfDoc, pdfPage])

  useEffect(() => { const ann = annotRef.current; if (ann) repaint(ann, strokes, curStroke) }, [strokes, curStroke])
  useEffect(() => {
    annotationMapRef.current[pdfPage] = { strokes, textAnns }
  }, [pdfPage, strokes, textAnns])

  useImperativeHandle(ref, () => ({
    hasEdits() {
      if (previewKind !== 'pdf') return false
      return hasAnyAnnotations({
        ...annotationMapRef.current,
        [pdfPage]: { strokes, textAnns },
      })
    },
    async exportReviewedPdfFile() {
      if (previewKind !== 'pdf') return null
      return exportAnnotatedPdfFile({
        originalBytes: originalPdfBytesRef.current,
        pages: {
          ...annotationMapRef.current,
          [pdfPage]: { strokes, textAnns },
        },
        renderSizes: renderSizeMapRef.current,
        fallbackName: `${item.name || 'student-review'}-${item.id}.pdf`,
      })
    },
  }), [item.id, item.name, pdfPage, previewKind, strokes, textAnns])

  function undo() {
    if (curStroke) { setCurStroke(null); return }
    if (strokes.length) { setStrokes((p) => p.slice(0, -1)); return }
    setTextAnns((p) => p.slice(0, -1))
  }
  function changePage(p: number) { setPdfPage(p); setCurStroke(null) }

  const pageNav = pdfDoc ? (
    <div className="flex items-center gap-0.5 text-xs text-[var(--color-text-secondary)]">
      <button type="button" disabled={pdfPage <= 1} onClick={() => changePage(pdfPage - 1)}
        className="flex h-5 w-5 items-center justify-center rounded text-sm hover:bg-white disabled:opacity-30">‹</button>
      <span className="w-12 text-center tabular-nums">{pdfPage} / {totalPages}</span>
      <button type="button" disabled={pdfPage >= totalPages} onClick={() => changePage(pdfPage + 1)}
        className="flex h-5 w-5 items-center justify-center rounded text-sm hover:bg-white disabled:opacity-30">›</button>
    </div>
  ) : null

  return (
    <PanelShell title="学生提交试卷"
      badge={<span className={['rounded-full border px-1.5 py-0.5 text-xs font-medium', getSubmissionStageMeta(item.stageKey).badgeClass].join(' ')}>{item.taskLabel}</span>}
      right={pageNav}
    >
      {previewKind === 'pdf' ? (
        <DrawingToolbar tool={tool} setTool={setTool} color={color} setColor={setColor} width={width} setWidth={setWidth} onUndo={undo} />
      ) : (
        <div className="shrink-0 border-b border-[var(--color-border)] bg-white px-3 py-2 text-xs text-[var(--color-text-muted)]">
          {previewKind === 'image' ? '图片提交支持预览；如需返回批改件，请上传批改 PDF。' : '当前文件类型暂不支持直接预览批改'}
        </div>
      )}
      <div ref={wrapRef} className="flex-1 overflow-auto bg-[#d4d8dc] p-4">
        {pdfLoading && <div className="flex h-full items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>加载学生提交文件…</div>}
        {!pdfLoading && pdfError && <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-red-200 text-xs text-red-400">{pdfError}</div>}
        {!pdfLoading && !pdfError && pdfDoc && (
          <AnnotationLayer tool={tool} color={color} width={width}
            strokes={strokes} setStrokes={setStrokes} curStroke={curStroke} setCurStroke={setCurStroke}
            textAnns={textAnns} setTextAnns={setTextAnns} canvasRef={annotRef} textInputRef={textInputRef}
            className="mx-auto" style={{ display: 'inline-block' }}>
            <canvas ref={pdfCanvasRef} className="block shadow-[0_2px_20px_rgba(0,0,0,0.15)]" />
          </AnnotationLayer>
        )}
        {!pdfLoading && !pdfError && previewKind === 'image' && !!imageUrl && (
          <div className="mx-auto max-w-full overflow-hidden rounded-xl bg-white p-3 shadow-[0_2px_20px_rgba(0,0,0,0.15)]">
            <img src={imageUrl} alt={item.fileName || 'student-submission'} className="mx-auto block max-h-[72vh] max-w-full object-contain" />
          </div>
        )}
      </div>
    </PanelShell>
  )
})

// ── ScorePanel (右上) ─────────────────────────────────────────────────────────
const SCORE_SECTIONS = [
  { key: 's1', label: '第一题', max: 25 },
  { key: 's2', label: '第二题', max: 25 },
  { key: 's3', label: '第三题', max: 25 },
  { key: 's4', label: '第四题', max: 25 },
]

function ScorePanel({ scores, setScores, grade, setGrade }: {
  scores: Record<string, string>
  setScores: React.Dispatch<React.SetStateAction<Record<string, string>>>
  grade: string
  setGrade: React.Dispatch<React.SetStateAction<string>>
}) {
  const totalMax  = SCORE_SECTIONS.reduce((s, r) => s + r.max, 0)
  const totalGot  = SCORE_SECTIONS.reduce((s, r) => s + (parseFloat(scores[r.key] ?? '') || 0), 0)
  const passRate  = totalMax > 0 ? Math.round((totalGot / totalMax) * 100) : 0
  const allFilled = SCORE_SECTIONS.every((r) => scores[r.key] !== undefined && scores[r.key] !== '')

  return (
    <PanelShell title="通过率 · 评分">
      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">

        {/* Pass rate ring */}
        <div className="flex items-center gap-4 rounded-xl bg-[var(--color-bg-left)] px-4 py-3">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="#e5e7eb" strokeWidth="7" />
              <circle cx="32" cy="32" r="26" fill="none"
                stroke={passRate >= 75 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#dc2626'}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - passRate / 100)}`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
            </svg>
            <span className="absolute text-sm font-bold text-[var(--color-text-primary)]">{passRate}%</span>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--color-text-primary)]">
              {allFilled ? `${totalGot} / ${totalMax} 分` : `— / ${totalMax} 分`}
            </div>
            <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {passRate >= 75 ? '通过' : passRate >= 50 ? '接近通过线' : '未通过'}
            </div>
          </div>
        </div>

        {/* Per-section scores */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[var(--color-text-secondary)]">各题得分</div>
          {SCORE_SECTIONS.map((r) => {
            const val  = scores[r.key] ?? ''
            const got  = parseFloat(val) || 0
            const pct  = r.max > 0 ? Math.min(got / r.max, 1) : 0
            return (
              <div key={r.key} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-[var(--color-text-muted)]">{r.label}</span>
                <div className="flex-1 h-2 overflow-hidden rounded-full bg-[var(--color-bg-left)]">
                  <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                    style={{ width: `${pct * 100}%` }} />
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" min={0} max={r.max} value={val}
                    onChange={(e) => setScores((p) => ({ ...p, [r.key]: e.target.value }))}
                    className="w-12 rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-center text-xs outline-none focus:border-[var(--color-primary)]"
                    placeholder="0" />
                  <span className="text-xs text-[var(--color-text-muted)]">/ {r.max}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Grade */}
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">综合评级</div>
          <div className="grid grid-cols-4 gap-1.5">
            {(['优', '良', '中', '差'] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGrade(grade === g ? '' : g)}
                className={['rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                  grade === g ? GRADE_CLS[g] : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]',
                ].join(' ')}>{g}</button>
            ))}
          </div>
        </div>

      </div>
    </PanelShell>
  )
}

// ── ReportPanel (右下) ────────────────────────────────────────────────────────
void ScorePanel
function ReviewGuidePanel() {
  return (
    <PanelShell title="批改说明">
      <div className="flex-1 space-y-3 overflow-auto px-4 py-3 text-xs leading-6 text-[var(--color-text-secondary)]">
        <div className="rounded-xl bg-[var(--color-bg-left)] px-4 py-3">
          当前批改流程只保留批改 PDF，不再填写分数和评语。
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
          可以直接在学生原作业上批注，或者上传一份整理好的批改 PDF。
        </div>
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-white px-4 py-3">
          提交后系统会自动同步到学生端对应的批改反馈入口。
        </div>
      </div>
    </PanelShell>
  )
}

function ReportPanel({ submissionId, studentPdfPanelRef }: {
  submissionId: string
  studentPdfPanelRef: React.RefObject<StudentPdfPanelHandle | null>
}) {
  const [pdfDoc, setPdfDoc]         = useState<PDFDocumentProxy | null>(null)
  const [pdfPage, setPdfPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [tool, setTool]       = useState<Tool>('brush')
  const [color, setColor]     = useState(COLORS[0])
  const [width, setWidth]     = useState(WIDTHS[0])
  const [strokes, setStrokes]     = useState<DrawingStroke[]>([])
  const [curStroke, setCurStroke] = useState<DrawingStroke | null>(null)
  const [textAnns, setTextAnns]   = useState<TextAnn[]>([])
  const [opaqueText, setOpaqueText] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [reviewedFileName, setReviewedFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const notes = ''
  const setNotes = () => {}
  void notes
  void setNotes
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotRef     = useRef<HTMLCanvasElement>(null)
  const wrapRef      = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const fileRef      = useRef<HTMLInputElement>(null)
  const originalPdfBytesRef = useRef<ArrayBuffer | null>(null)
  const annotationMapRef = useRef<Record<number, PageAnnotationState>>({})
  const renderSizeMapRef = useRef<Record<number, { width: number; height: number }>>({})

  useEffect(() => {
    if (!pdfDoc) return; let cancelled = false
    async function renderPage() {
      const page = await pdfDoc!.getPage(pdfPage); if (cancelled) return
      const pdfCanvas = pdfCanvasRef.current; const container = wrapRef.current
      if (!pdfCanvas || !container) return
      const naturalW = page.getViewport({ scale: 1 }).width
      const scale    = Math.min((container.offsetWidth - 32) / naturalW, 1.8)
      const viewport = page.getViewport({ scale })
      pdfCanvas.width = viewport.width; pdfCanvas.height = viewport.height
      renderSizeMapRef.current[pdfPage] = { width: viewport.width, height: viewport.height }
      const ann = annotRef.current
      if (ann) { ann.width = viewport.width; ann.height = viewport.height }
      const savedState = annotationMapRef.current[pdfPage] || { strokes: [], textAnns: [] }
      setStrokes(savedState.strokes); setCurStroke(null); setTextAnns(savedState.textAnns)
      await page.render({ canvas: pdfCanvas, canvasContext: pdfCanvas.getContext('2d')!, viewport }).promise
    }
    renderPage().catch(console.error)
    return () => { cancelled = true }
  }, [pdfDoc, pdfPage])

  useEffect(() => { const ann = annotRef.current; if (ann) repaint(ann, strokes, curStroke) }, [strokes, curStroke])
  useEffect(() => {
    annotationMapRef.current[pdfPage] = { strokes, textAnns }
  }, [pdfPage, strokes, textAnns])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setLoading(true); setError('')
    try {
      const sourceBytes = await file.arrayBuffer()
      originalPdfBytesRef.current = clonePdfBytes(sourceBytes)
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) }).promise
      annotationMapRef.current = {}
      renderSizeMapRef.current = {}
      setPdfDoc(doc); setTotalPages(doc.numPages); setPdfPage(1)
      setReportFile(file)
      setReviewedFileName(file.name)
      setSubmitError('')
      setSubmitted(false)
    } catch { setError('PDF 文件解析失败') }
    finally { setLoading(false) }
  }


  function changePdfPage(p: number) { setPdfPage(p); setCurStroke(null) }
  function undo() {
    if (curStroke) { setCurStroke(null); return }
    if (strokes.length) { setStrokes((p) => p.slice(0, -1)); return }
    setTextAnns((p) => p.slice(0, -1))
  }

  const pageExtra = pdfDoc ? (
    <div className="flex items-center gap-0.5 text-xs text-[var(--color-text-secondary)]">
      <button type="button" disabled={pdfPage <= 1} onClick={() => changePdfPage(pdfPage - 1)}
        className="flex h-5 w-5 items-center justify-center rounded text-sm hover:bg-[var(--color-bg-left)] disabled:opacity-30">‹</button>
      <span className="w-12 text-center tabular-nums">{pdfPage} / {totalPages}</span>
      <button type="button" disabled={pdfPage >= totalPages} onClick={() => changePdfPage(pdfPage + 1)}
        className="flex h-5 w-5 items-center justify-center rounded text-sm hover:bg-[var(--color-bg-left)] disabled:opacity-30">›</button>
    </div>
  ) : null

  const textModeExtra = (
    <button type="button" onClick={() => setOpaqueText((v) => !v)}
      className={['flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors',
        opaqueText
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
      ].join(' ')}>
      {opaqueText ? '覆盖改字' : '批注模式'}
    </button>
  )

  return (
    <PanelShell title="批改报告"
      right={
        <div className="flex items-center gap-1.5">
          {pageExtra}
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {pdfDoc ? '更换模板' : '上传报告模板'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf" className="sr-only" onChange={handleFile} />
        </div>
      }
    >
      <DrawingToolbar tool={tool} setTool={setTool} color={color} setColor={setColor} width={width} setWidth={setWidth} onUndo={undo}
        extra={<>{textModeExtra}</>} />

      {/* PDF area or empty */}
      <div ref={wrapRef} className="min-h-0 flex-1 overflow-auto bg-[#d4d8dc] p-3">
        {loading && <div className="flex h-full items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>加载中…</div>}
        {!loading && error && <div className="flex h-16 items-center justify-center text-xs text-red-400">{error}</div>}
        {!loading && !error && !pdfDoc && (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="group flex h-full min-h-[80px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]">上传报告模板 PDF，直接在模板上批注</span>
          </button>
        )}
        {!loading && !error && pdfDoc && (
          <AnnotationLayer tool={tool} color={color} width={width}
            strokes={strokes} setStrokes={setStrokes} curStroke={curStroke} setCurStroke={setCurStroke}
            textAnns={textAnns} setTextAnns={setTextAnns} canvasRef={annotRef} textInputRef={textInputRef}
            opaque={opaqueText} className="mx-auto" style={{ display: 'inline-block' } as React.CSSProperties}>
            <canvas ref={pdfCanvasRef} className="block shadow-[0_2px_20px_rgba(0,0,0,0.15)]" />
          </AnnotationLayer>
        )}
      </div>

      {/* Report text + submit */}
      <div className="shrink-0 space-y-2 border-t border-[var(--color-border)] px-4 py-3">
        {!!reviewedFileName && (
          <div className="rounded-lg bg-[var(--color-bg-left)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            {`Feedback PDF: ${reviewedFileName}`}
          </div>
        )}
        <textarea rows={3} value="" onChange={() => {}} style={{ display: 'none' }}
          placeholder="批改意见、问题总结与改进建议…"
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-left)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)]" />
        {!!submitError && (
          <div className="text-xs text-red-500">{submitError}</div>
        )}
        {submitted ? (
          <div className="flex items-center justify-center gap-2 py-0.5 text-xs font-medium text-green-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            报告已提交
          </div>
        ) : (
          <button type="button" disabled={submitting} onClick={async () => {
            setSubmitting(true)
            setSubmitError('')
            try {
              const currentPages = {
                ...annotationMapRef.current,
                [pdfPage]: { strokes, textAnns },
              }
              const hasReportEdits = hasAnyAnnotations(currentPages)
              let fileToUpload: File | null = reportFile

              if (reportFile && hasReportEdits) {
                fileToUpload = await exportAnnotatedPdfFile({
                  originalBytes: originalPdfBytesRef.current,
                  pages: currentPages,
                  renderSizes: renderSizeMapRef.current,
                  fallbackName: reviewedFileName || reportFile.name,
                })
              } else if (!reportFile && studentPdfPanelRef.current?.hasEdits()) {
                fileToUpload = await studentPdfPanelRef.current.exportReviewedPdfFile()
              }

              if (!fileToUpload) {
                setSubmitError('请在学生作业上批注，或先上传批改后的 PDF 文件。')
                return
              }

              await uploadReviewedSubmissionPdf(submissionId, fileToUpload)
              await api.put(`/api/submissions/${submissionId}/grade`, {})
              setReviewedFileName(fileToUpload.name)
              setSubmitted(true)
            } catch (error) {
              setSubmitError(error instanceof Error ? error.message : '提交失败，请重试')
            } finally {
              setSubmitting(false)
            }
          }}
            className="w-full rounded-lg bg-[var(--color-primary)] py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
            {submitting ? '提交中…' : '提交批改结果'}
          </button>
        )}
      </div>
    </PanelShell>
  )
}

// ── ResizeHandle ──────────────────────────────────────────────────────────────
function ResizeHandle({ direction, onDragStart }: {
  direction: 'row' | 'col'
  onDragStart: (start: number) => void
}) {
  const isRow = direction === 'row'
  return (
    <div
      className={[
        'group relative z-10 flex shrink-0 items-center justify-center',
        isRow ? 'w-full cursor-row-resize flex-col py-1' : 'h-full cursor-col-resize flex-row px-1',
      ].join(' ')}
      onMouseDown={(e) => { e.preventDefault(); onDragStart(isRow ? e.clientY : e.clientX) }}
    >
      <div className={[
        'bg-[var(--color-border)] transition-colors group-hover:bg-[var(--color-primary)]',
        isRow ? 'h-px w-full' : 'h-full w-px',
      ].join(' ')} />
      <div className={[
        'absolute flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white shadow transition-colors group-hover:border-[var(--color-primary)]',
        isRow ? 'h-4 w-9' : 'h-9 w-4',
      ].join(' ')}>
        {isRow ? (
          <svg width="14" height="7" viewBox="0 0 14 7" fill="none">
            <line x1="1" y1="1.5" x2="13" y2="1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-gray-300" />
            <line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-gray-300" />
          </svg>
        ) : (
          <svg width="7" height="14" viewBox="0 0 7 14" fill="none">
            <line x1="1.5" y1="1" x2="1.5" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-gray-300" />
            <line x1="5.5" y1="1" x2="5.5" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-gray-300" />
          </svg>
        )}
      </div>
    </div>
  )
}

// ── resize utility ────────────────────────────────────────────────────────────
function startResize(
  startPos: number,
  axis: 'x' | 'y',
  ratioRef: React.MutableRefObject<number>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  setRatio: React.Dispatch<React.SetStateAction<number>>,
) {
  const startRatio   = ratioRef.current
  const containerSize = axis === 'y'
    ? (containerRef.current?.offsetHeight ?? 0)
    : (containerRef.current?.offsetWidth  ?? 0)
  if (containerSize === 0) return
  const onMove = (e: MouseEvent) => {
    const delta = (axis === 'y' ? e.clientY : e.clientX) - startPos
    const next  = Math.min(0.8, Math.max(0.2, startRatio + delta / containerSize))
    ratioRef.current = next
    setRatio(next)
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── GradingWorkspace ───────────────────────────────────────────────────────────
export function GradingWorkspace({ item, onBack }: { item: ReviewItem; onBack: () => void }) {
  const pcfg     = PRIORITY_CFG[item.priority]
  const stageMeta = getSubmissionStageMeta(item.stageKey)

  const [leftRatio, setLeftRatio]   = useState(0.5)
  const [rightRatio, setRightRatio] = useState(0.5)
  const [colRatio, setColRatio]     = useState(0.5)
  const leftRatioRef  = useRef(0.5)
  const rightRatioRef = useRef(0.5)
  const colRatioRef   = useRef(0.5)
  const leftColRef  = useRef<HTMLDivElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)
  const outerRowRef = useRef<HTMLDivElement>(null)

  const studentPdfPanelRef = useRef<StudentPdfPanelHandle | null>(null)

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#eaecef]">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 py-2.5 shadow-sm">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-left)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          返回列表
        </button>
        <div className="h-4 w-px bg-[var(--color-border)]" />
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: item.color }}>
          {item.avatar}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{item.name}</span>
            <span className={['rounded-full border px-1.5 py-0.5 text-xs font-medium', stageMeta.badgeClass].join(' ')}>{item.stageLabel}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700">{item.taskLabel}</span>
            <span className={['rounded-full px-1.5 py-0.5 text-xs font-medium', pcfg.cls].join(' ')}>{pcfg.label}</span>
            <span className={['rounded-full border px-1.5 py-0.5 text-xs font-medium',
              item.submittedNormal ? 'border-green-200 bg-green-50 text-green-600' : 'border-orange-200 bg-orange-50 text-orange-500'].join(' ')}>
              {item.submittedNormal ? '正常提交' : '逾期/异常提交'}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span>{item.pointName || item.checkpoint}</span><span>·</span><span>{item.submittedAt}</span><span>·</span><span>截止 {item.deadline}</span>
          </div>
        </div>
        <div className="flex-1" />
        <div className={['flex items-center gap-1.5 rounded-lg border px-3 py-1.5', stageMeta.panelClass].join(' ')}>
          <div className={['h-2 w-2 rounded-full', stageMeta.panelDotClass].join(' ')} />
          <span className="text-xs font-semibold">{item.stageLabel}</span>
          <span className="text-xs opacity-60">{stageMeta.panelDesc}</span>
        </div>
      </div>

      {/* 2-column resizable layout */}
      <div ref={outerRowRef} className="flex flex-1 overflow-hidden p-3">
        {/* Left column */}
        <div ref={leftColRef} style={{ width: `${colRatio * 100}%` }} className="flex min-h-0 flex-col overflow-hidden">
          <div style={{ height: `${leftRatio * 100}%` }} className="min-h-0 overflow-hidden">
            <AnswerPanel />
          </div>
          <ResizeHandle direction="row" onDragStart={(sy) => startResize(sy, 'y', leftRatioRef, leftColRef, setLeftRatio)} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <StudentPdfPanel ref={studentPdfPanelRef} item={item} />
          </div>
        </div>

        {/* Column resize handle */}
        <ResizeHandle direction="col" onDragStart={(sx) => startResize(sx, 'x', colRatioRef, outerRowRef, setColRatio)} />

        {/* Right column */}
        <div ref={rightColRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div style={{ height: `${rightRatio * 100}%` }} className="min-h-0 overflow-hidden">
            <ReviewGuidePanel />
          </div>
          <ResizeHandle direction="row" onDragStart={(sy) => startResize(sy, 'y', rightRatioRef, rightColRef, setRightRatio)} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ReportPanel submissionId={item.id} studentPdfPanelRef={studentPdfPanelRef} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
