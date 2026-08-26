import { api } from '../../../lib/api'
import type { LearningPathStage } from '../config/studentLearningPath'

export interface LearningPathPayload {
  studentId: string
  pointName: string
  updatedAt?: string
  stages: LearningPathStage[]
}

export interface TheoryLessonConfigItem {
  id?: string
  title: string
  videoId: string
  preClassUrl: string
  analysisUrl: string
  answerUrl: string
  knowledgeTitle: string
  learningStatusRaw: string
  courseStatus: string
  noteText: string
}

export interface StudentTheoryConfigPayload {
  studentId: string
  pointName: string
  version?: string
  versionName?: string
  province?: string
  provinceLabel?: string
  theoryLessons: TheoryLessonConfigItem[]
}

export interface DiagnosePaperBundlePayload {
  optionId: string
  optionLabel: string
  questionIds: string[]
  questions: Array<{
    id: string
    title: string
    sortOrder: number
    paperUrl: string
    answerUrl: string
    videoId: string
  }>
  videoLessons: Array<{
    id: string
    title: string
    sortOrder: number
    videoId: string
  }>
  paperUrl: string
  answerUrl: string
}

export function fetchStudentLearningPath(studentId: string, pointName: string): Promise<LearningPathPayload> {
  const query = new URLSearchParams({
    pointName,
    _ts: String(Date.now()),
  })
  return api.get<LearningPathPayload>(`/api/teacher/students/${studentId}/learning-path?${query.toString()}`)
}

export function fetchStudentTheoryConfig(studentId: string, pointName: string): Promise<StudentTheoryConfigPayload> {
  const query = new URLSearchParams({
    pointName,
    _ts: String(Date.now()),
  })
  return api.get<StudentTheoryConfigPayload>(`/api/teacher/students/${studentId}/theory-config?${query.toString()}`)
}

export function saveStudentTheoryConfig(
  studentId: string,
  data: {
    pointName: string
    theoryLessons: TheoryLessonConfigItem[]
  },
): Promise<{ ok: boolean }> {
  return api.put<{ ok: boolean }>(`/api/teacher/students/${studentId}/theory-config`, data)
}

export function updateStudentLearningPathTask(
  studentId: string,
  taskId: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return api.patch<{ ok: boolean }>(`/api/teacher/students/${studentId}/learning-path/tasks/${taskId}`, data)
}

export async function uploadPdf(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const result = await api.postForm<{ url: string }>('/api/teacher/upload/pdf', form)
  return result.url
}

export function previewDiagnosePaperBundle(optionId: string, questionIds: string[]): Promise<DiagnosePaperBundlePayload> {
  return api.post<DiagnosePaperBundlePayload>('/api/teacher/diagnose-paper-bundles/preview', {
    optionId,
    questionIds,
  })
}

export function saveDiagnosePaperBundle(
  studentId: string,
  pointName: string,
  optionId: string,
  questionIds: string[],
): Promise<{ ok: boolean; bundle: DiagnosePaperBundlePayload }> {
  return api.post<{ ok: boolean; bundle: DiagnosePaperBundlePayload }>(
    `/api/teacher/students/${studentId}/diagnose-paper-bundles`,
    {
      pointName,
      optionId,
      questionIds,
    },
  )
}
