import { api } from '../../../lib/api'

export type ReviewType = '入学诊断' | '卡点练习题' | '卡点考试' | '整卷批改' | '二阶试卷'
export type ReviewPriority = 'urgent' | 'normal' | 'low'
export type SubmissionFileKind = 'pdf' | 'image' | 'other'

export interface Submission {
  id: string
  student_id?: string
  student_name: string
  review_type: string
  checkpoint: string
  point_name?: string
  stage_key?: string
  task_id?: string
  task_label?: string
  deadline: string
  priority: ReviewPriority
  submitted_normal: number
  file_name: string
  file_kind?: SubmissionFileKind
  submitted_at: string
}

export interface ReviewItem {
  id: string
  studentId?: string
  name: string
  avatar: string
  color: string
  contactId: string
  fileName: string
  reviewType: string
  checkpoint: string
  pointName?: string
  stageKey: string
  taskId?: string
  stageLabel: string
  taskLabel: string
  submittedAt: string
  deadline: string
  priority: ReviewPriority
  submittedNormal: boolean
  fileKind?: SubmissionFileKind
}

export function getSubmissionFileKind(fileName = '', mimeType = ''): SubmissionFileKind {
  const normalizedMimeType = String(mimeType || '').toLowerCase()
  if (normalizedMimeType === 'application/pdf') return 'pdf'
  if (normalizedMimeType.startsWith('image/')) return 'image'

  const normalizedName = String(fileName || '').toLowerCase()
  if (normalizedName.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|webp|gif)$/i.test(normalizedName)) return 'image'
  return 'other'
}

export async function fetchSubmissions(): Promise<Submission[]> {
  const data = await api.get<Submission[]>('/api/submissions')
  return Array.isArray(data) ? data : []
}

export async function fetchSubmissionFileBlob(id: string): Promise<Blob> {
  return api.getBlob(`/api/submissions/file/${id}`)
}

export async function fetchSubmissionFileUrl(id: string): Promise<string> {
  const blob = await fetchSubmissionFileBlob(id)
  return URL.createObjectURL(blob)
}

export const fetchSubmissionPdfBlob = fetchSubmissionFileBlob
export const fetchSubmissionPdfUrl = fetchSubmissionFileUrl

export async function uploadReviewedSubmissionPdf(id: string, file: File): Promise<{ reviewedFileName: string }> {
  const body = new FormData()
  body.append('file', file)

  const payload = await api.postForm<{ ok?: boolean; error?: string; reviewedFileName?: string }>(
    `/api/submissions/${id}/review-file`,
    body,
  )
  if (!payload?.ok) {
    throw new Error(payload?.error || '批改文件上传失败')
  }

  return payload as { reviewedFileName: string }
}
