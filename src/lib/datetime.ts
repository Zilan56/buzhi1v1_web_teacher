/**
 * 日期时间工具（基于 date-fns，本地时区）。
 *
 * 关键约定：
 * - 任何 "取日期字符串" 的场景一律用 toDateKey/dateKeyOf（本地时区），
 *   禁止 `toISOString().slice(0, 10)`——那是 UTC 日期，东八区凌晨 0-8 点会差一天
 * - 周起始日全局唯一：weekStartsOn: 1（周一）
 */

import { format, isValid, parseISO, startOfWeek } from 'date-fns'

/** Date → 本地时区 'yyyy-MM-dd' */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

const DATE_KEY_PATTERN = /^(\d{4}-\d{2}-\d{2})/

/** 后端日期串/Date → 'yyyy-MM-dd'。识别 ISO 前缀与 'YYYY-MM-DD HH:mm:ss'，其余尝试按 Date 解析。 */
export function dateKeyOf(value: string | Date | null | undefined): string {
  if (value instanceof Date) return isValid(value) ? toDateKey(value) : ''

  const text = String(value ?? '').trim()
  if (!text) return ''

  const match = text.match(DATE_KEY_PATTERN)
  if (match) return match[1]

  const parsed = new Date(text)
  return !Number.isNaN(parsed.getTime()) ? toDateKey(parsed) : text
}

/** 解析为 Date：ISO 串走 parseISO（本地语义），其余走 new Date；非法返回 null。 */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null

  const iso = parseISO(value)
  if (isValid(iso)) return iso

  const fallback = new Date(value)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

/** 当前周的周一。全项目周起始日的唯一出处（weekStartsOn: 1）。 */
export function weekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function formatDate(value: string | Date | null | undefined, pattern = 'yyyy-MM-dd'): string {
  const date = toDate(value)
  return date ? format(date, pattern) : ''
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'HH:mm') : ''
}

/** 'yyyy-MM-dd HH:mm'；空/非法值返回 fallback */
export function formatDateTime(value: string | Date | null | undefined, fallback = ''): string {
  const date = toDate(value)
  return date ? format(date, 'yyyy-MM-dd HH:mm') : fallback
}

/** 中文日期：'M月d日' 等，pattern 可传 date-fns 任意 pattern */
export function formatDateZH(value: string | Date | null | undefined, pattern = 'M月d日'): string {
  const date = toDate(value)
  return date ? format(date, pattern) : ''
}
