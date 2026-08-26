export interface SubmissionStageMeta {
  label: string
  badgeClass: string
  panelClass: string
  panelDotClass: string
  panelDesc: string
}

const DEFAULT_STAGE_META: SubmissionStageMeta = {
  label: '未分类',
  badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
  panelClass: 'border-slate-200 bg-slate-50 text-slate-600',
  panelDotClass: 'bg-slate-400',
  panelDesc: '按具体学习任务批改',
}

const STAGE_META_MAP: Record<string, SubmissionStageMeta> = {
  diagnose: {
    label: '诊断',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    panelClass: 'border-sky-200 bg-sky-50 text-sky-700',
    panelDotClass: 'bg-sky-500',
    panelDesc: '入学测评与诊断反馈',
  },
  theory: {
    label: '理论',
    badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
    panelClass: 'border-violet-200 bg-violet-50 text-violet-700',
    panelDotClass: 'bg-violet-500',
    panelDesc: '理论学习与课后作业',
  },
  training: {
    label: '实训',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    panelClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    panelDotClass: 'bg-emerald-500',
    panelDesc: '实训练习与心得反馈',
  },
  exam: {
    label: '考试',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    panelClass: 'border-amber-200 bg-amber-50 text-amber-700',
    panelDotClass: 'bg-amber-500',
    panelDesc: '阶段测试与讲评反馈',
  },
  report: {
    label: '完成',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    panelClass: 'border-slate-200 bg-slate-50 text-slate-700',
    panelDotClass: 'bg-slate-500',
    panelDesc: '结项结果与总结材料',
  },
  drill: {
    label: '刷题',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    panelClass: 'border-rose-200 bg-rose-50 text-rose-700',
    panelDotClass: 'bg-rose-500',
    panelDesc: '刷题作业与老师反馈',
  },
  practice: {
    label: '作业',
    badgeClass: 'border-teal-200 bg-teal-50 text-teal-700',
    panelClass: 'border-teal-200 bg-teal-50 text-teal-700',
    panelDotClass: 'bg-teal-500',
    panelDesc: '单独布置的作业提交',
  },
}

const EXACT_TASK_LABELS: Record<string, string> = {
  diagnose_paper_upload: '诊断试卷上传',
  theory_mindmap_upload: '思维导图上传',
  theory_correction_upload: '纠偏课后作业',
  exam_homework_upload: '考试作业上传',
  drill_upload: '刷题作业上传',
}

function stripFileExtension(fileName = ''): string {
  return String(fileName || '').replace(/\.[^.]+$/, '').trim()
}

function titleCaseSegment(segment = ''): string {
  return segment
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeTaskFallback(taskId = ''): string {
  const safeTaskId = String(taskId || '').trim()
  if (!safeTaskId) return ''
  return titleCaseSegment(safeTaskId)
}

export function getSubmissionStageMeta(stageKey = ''): SubmissionStageMeta {
  return STAGE_META_MAP[String(stageKey || '').trim()] || DEFAULT_STAGE_META
}

export function getSubmissionStageLabel(stageKey = ''): string {
  return getSubmissionStageMeta(stageKey).label
}

export function getSubmissionTaskLabel(taskId = '', fileName = '', taskLabel = ''): string {
  const safeTaskId = String(taskId || '').trim()
  const safeTaskLabel = String(taskLabel || '').trim()

  if (safeTaskLabel) {
    return safeTaskLabel
  }

  if (EXACT_TASK_LABELS[safeTaskId]) {
    return EXACT_TASK_LABELS[safeTaskId]
  }

  const trainingMatch = safeTaskId.match(/^training_round_(\d+)_(homework|reflection)_upload$/)
  if (trainingMatch) {
    return trainingMatch[2] === 'homework'
      ? `实训第${trainingMatch[1]}轮作业`
      : `实训第${trainingMatch[1]}轮心得`
  }

  const examMatch = safeTaskId.match(/^exam(?:_round|_remedial)?_(\d+)_homework_upload$/)
  if (examMatch) {
    return `考试第${examMatch[1]}轮作业`
  }

  if (safeTaskId.endsWith('_upload')) {
    return normalizeTaskFallback(safeTaskId.replace(/_upload$/, '')) || '上传任务'
  }

  return stripFileExtension(fileName) || normalizeTaskFallback(safeTaskId) || '未命名任务'
}
