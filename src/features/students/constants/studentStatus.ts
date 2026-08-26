export type StudentStatusTone = 'success' | 'danger' | 'info' | 'neutral' | 'accent'

export const studentStatusMeta = {
  normal: { label: '正常', tone: 'success' },
  warning: { label: '异常', tone: 'danger' },
  new: { label: '新学员', tone: 'info' },
  leave: { label: '已请假', tone: 'neutral' },
  completed: { label: '已完成', tone: 'accent' },
} satisfies Record<string, { label: string; tone: StudentStatusTone }>
