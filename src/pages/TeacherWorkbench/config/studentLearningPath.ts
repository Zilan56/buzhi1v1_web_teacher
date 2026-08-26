export type LearningPathStageKey = 'diagnose' | 'theory' | 'training' | 'exam' | 'report' | 'drill'
export type LearningPathItemStatus = 'done' | 'current' | 'pending'
export type LearningPathTimeType = 'fixed' | 'deadline'

export interface LearningPathResource {
  resourceType: string
  title: string
  url: string
  videoId?: string
  liveUrl?: string
  replayUrl?: string
  noteUrl?: string
  videoLessons?: Array<{
    id: string
    title: string
    sortOrder?: number
    videoId: string
  }>
}

export interface LearningPathTaskResult {
  status?: string
  submissionId?: string
  fileName?: string
  reviewType?: string
  checkpoint?: string
  gradedAt?: string
  reviewedFileName?: string
  hasReviewedFile?: boolean
}

export interface LearningPathItemDefinition {
  id: string
  title: string
  desc: string
  timeLabel?: string
  timeType?: LearningPathTimeType
  timeDisplayLabel?: string
  actionText?: string
  actionType: string
  secondaryActionText?: string
  secondaryActionType?: string
  resource?: LearningPathResource | null
  requireDoneTaskId?: string
  blockedToast?: string
}

export interface LearningPathGroupDefinition {
  title: string
  items: LearningPathItemDefinition[]
}

export interface LearningPathStageDefinition {
  stageKey: LearningPathStageKey
  stageIndex: string
  stageName: string
  stageSubtitle: string
  sectionTitle: string
  groups: LearningPathGroupDefinition[]
}

export interface LearningPathItem extends LearningPathItemDefinition {
  status: LearningPathItemStatus
  resource?: LearningPathResource | null
  uploads?: Array<Record<string, unknown>>
  appointment?: Record<string, unknown> | null
  result?: LearningPathTaskResult | null
  meta?: Record<string, unknown>
}

export interface LearningPathGroup {
  title: string
  items: LearningPathItem[]
}

export interface LearningPathStage extends Omit<LearningPathStageDefinition, 'groups'> {
  pointName: string
  currentTaskId: string
  status?: LearningPathItemStatus
  groups: LearningPathGroup[]
}

export const LEARNING_PATH_STAGE_ORDER: LearningPathStageKey[] = ['diagnose', 'theory', 'training', 'exam', 'report', 'drill']
