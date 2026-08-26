import type { ComplaintRecord, ContactItem } from '../types'

type ContactsByTab = {
  todayMessages: ContactItem[]
  yesterdayUnreplied: ContactItem[]
  complaints: ContactItem[]
  colleagues: ContactItem[]
  abnormalUsers: ContactItem[]
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function startOfDay(date: Date): number {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next.getTime()
}

function isToday(value?: string | null): boolean {
  const ts = toTimestamp(value)
  if (!ts) return false

  const now = new Date()
  const todayStart = startOfDay(now)
  return ts >= todayStart
}

function isYesterday(value?: string | null): boolean {
  const ts = toTimestamp(value)
  if (!ts) return false

  const now = new Date()
  const todayStart = startOfDay(now)
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  return ts >= yesterdayStart && ts < todayStart
}

function sortByRecent(left: ContactItem, right: ContactItem): number {
  return toTimestamp(right.lastMessageAt) - toTimestamp(left.lastMessageAt)
}

function buildComplaintPreview(record?: ComplaintRecord): string {
  if (!record) return '投诉跟进'

  return record.reason || record.demand || record.suggestion || '投诉跟进'
}

export function buildContactsByTab(
  contacts: ContactItem[],
  complaintsMap: Record<string, ComplaintRecord[]>,
): ContactsByTab {
  const studentContacts = contacts.filter((item) => item.contactType !== 'colleague')
  const colleagueContacts = contacts.filter((item) => item.contactType === 'colleague')

  const complaintRecordsByStudentId = Object.entries(complaintsMap).reduce<Record<string, ComplaintRecord>>((acc, [studentId, records]) => {
    const pending = records
      .filter((item) => item.status !== 'resolved')
      .sort((left, right) => toTimestamp(right.submittedAt) - toTimestamp(left.submittedAt))

    if (pending[0]) {
      acc[studentId] = pending[0]
    }

    return acc
  }, {})

  const complaints = studentContacts
    .filter((item) => item.studentId && complaintRecordsByStudentId[item.studentId])
    .map((item) => ({
      ...item,
      tag: 'complaint' as const,
      preview: buildComplaintPreview(item.studentId ? complaintRecordsByStudentId[item.studentId] : undefined),
    }))
    .sort(sortByRecent)

  return {
    todayMessages: studentContacts
      .filter((item) => isToday(item.lastMessageAt) && (item.lastSenderType === 'student' || (item.unreadCount ?? 0) > 0))
      .sort(sortByRecent),
    yesterdayUnreplied: studentContacts
      .filter((item) => isYesterday(item.lastMessageAt) && item.lastSenderType === 'student')
      .sort(sortByRecent),
    complaints,
    colleagues: colleagueContacts.sort(sortByRecent),
    abnormalUsers: [],
  }
}
