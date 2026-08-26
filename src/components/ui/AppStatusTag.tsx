/**
 * 学生状态标签：状态 → 文案/色调的唯一映射（studentStatusMeta）。
 * 替代散落 5 处的手写映射表；对历史遗留的未知状态值（如 'abnormal'）按 warning 展示并记录日志。
 */

import { studentStatusMeta } from '../../features/students/constants/studentStatus'
import { logger } from '../../lib/logger'
import { StatusBadge } from './StatusBadge'

export type StudentStatusKey = keyof typeof studentStatusMeta

const FALLBACK_KEY: StudentStatusKey = 'warning'

export function AppStatusTag({ status }: { status: string | null | undefined }) {
  const key = (status ?? '') as StudentStatusKey
  const meta = studentStatusMeta[key]
  if (!meta) {
    logger.warn('studentStatus.unknown', { status: String(status) })
    const fallback = studentStatusMeta[FALLBACK_KEY]
    return <StatusBadge label={fallback.label} tone={fallback.tone} />
  }
  return <StatusBadge label={meta.label} tone={meta.tone} />
}
