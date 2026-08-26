import type { TaskKey } from '../types'

export const taskMeta: Record<
  TaskKey,
  { label: string; badgeTone?: 'alert' }
> = {
  pendingClass: { label: '待上课' },
  pendingReply: { label: '待回复' },
  abnormalUser: { label: '异常学员', badgeTone: 'alert' },
  pendingReview: { label: '待批改' },
  pendingReport: { label: '待上传报告', badgeTone: 'alert' },
  pendingAssign: { label: '待分配学员' },
  pendingDiagnosePaper: { label: '待配诊断卷' },
  pendingLink: { label: '待上传链接' },
  liveDrill: { label: '直播刷题' },
  pendingHandout: { label: '待上传讲义' },
  pendingFeedback: { label: '学生反馈' },
}
