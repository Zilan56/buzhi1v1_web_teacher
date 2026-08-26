import { API_BASE_URL } from '../../../lib/apiBase'
import { api } from '../../../lib/api'
import { getToken } from '../../../lib/auth'
import { colorFromName } from '../../../lib/color'
import type { ChatMessage, ContactItem, GroupMember } from '../types'

interface ChatRoomResponse {
  id: string
  name: string
  avatar: string
  preview: string
  time: string
  unreadCount: number
  contactType: 'student' | 'teacher'
  studentId?: string
  studentStatus?: 'normal' | 'warning' | 'new' | 'leave' | 'completed'
  subject?: string
  grade?: string
  lastSenderType?: 'teacher' | 'student' | null
  lastMessageAt?: string | null
}

interface ChatMessageResponse {
  id: string
  roomId: string
  senderType: 'teacher' | 'student'
  senderName: string
  content: string
  type: 'text' | 'image' | 'file' | 'audio'
  replyToId: string | null
  createdAt: string
}

export interface SocketChatMessageResponse {
  id: string
  roomId: string
  senderType: 'teacher' | 'student'
  senderName: string
  content: string
  messageType?: 'text' | 'image' | 'file' | 'audio'
  replyToId?: string | null
  createdAt: string
}

export interface MappedChatMessage {
  message: ChatMessage
  replyToId: string | null
}

interface ChatMemberResponse {
  id: string
  teacherId?: string
  name: string
  role: GroupMember['role']
  avatar: string
}

function mapGroupMember(item: ChatMemberResponse): GroupMember {
  return {
    teacherId: item.teacherId,
    name: item.name,
    role: item.role,
  }
}

function toTimeLabel(value?: string | null): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function toDateLabel(value?: string | null): string | undefined {
  if (!value) return undefined

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mapSenderRole(senderType: ChatMessageResponse['senderType'] | SocketChatMessageResponse['senderType']): ChatMessage['sender'] {
  return senderType === 'teacher' ? '带教老师' : '学生'
}

function mapChatMessage(
  contactId: string,
  item: ChatMessageResponse | SocketChatMessageResponse,
  clientId?: string,
): MappedChatMessage {
  const messageType = 'type' in item ? item.type : item.messageType

  return {
    replyToId: item.replyToId ?? null,
    message: {
      id: item.id,
      clientId,
      contactId,
      sender: mapSenderRole(item.senderType),
      senderName: item.senderName,
      text: item.content,
      time: toTimeLabel(item.createdAt),
      date: toDateLabel(item.createdAt),
      pending: false,
      msgType: messageType ?? 'text',
    },
  }
}

export function buildChatSocketUrl(contactId: string): string {
  const token = getToken()
  const baseUrl = new URL(API_BASE_URL || window.location.origin, window.location.origin)

  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  baseUrl.search = ''
  baseUrl.hash = ''
  baseUrl.searchParams.set('token', token)
  baseUrl.searchParams.set('roomId', contactId)

  return baseUrl.toString()
}

export function mapSocketChatMessage(
  contactId: string,
  item: SocketChatMessageResponse,
  clientId?: string,
): MappedChatMessage {
  return mapChatMessage(contactId, item, clientId)
}

export async function fetchChatRooms(): Promise<ContactItem[]> {
  const data = await api.get<ChatRoomResponse[]>('/api/chat/rooms')
  if (!Array.isArray(data)) {
    // 非数组（错误对象等）直接抛出：调用方保留旧数据并告警，而不是被空列表顶掉选中会话
    throw new Error('会话列表响应异常')
  }

  return data.map((item) => ({
    id: item.id,
    name: item.name,
    avatar: item.avatar || String(item.name || '?').slice(0, 1),
    color: colorFromName(item.name),
    preview: item.preview ?? '',
    time: item.time ?? '',
    unreadCount: item.unreadCount ?? 0,
    contactType: item.contactType === 'teacher' ? 'colleague' : 'student',
    subtitle: [item.grade, item.subject].filter(Boolean).join(' · '),
    studentId: item.studentId,
    studentStatus: item.studentStatus,
    lastMessageAt: item.lastMessageAt ?? null,
    lastSenderType: item.lastSenderType ?? null,
  }))
}

export async function fetchChatMembers(contactId: string): Promise<GroupMember[]> {
  const data = await api.get<ChatMemberResponse[]>(`/api/chat/rooms/${contactId}/members`)
  if (!Array.isArray(data)) return []

  return data.map(mapGroupMember)
}

export async function fetchChatMemberCandidates(contactId: string): Promise<GroupMember[]> {
  const data = await api.get<ChatMemberResponse[]>(`/api/chat/rooms/${contactId}/member-candidates`)
  if (!Array.isArray(data)) return []

  return data.map(mapGroupMember)
}

export async function addChatMember(contactId: string, member: GroupMember): Promise<GroupMember> {
  const data = await api.post<ChatMemberResponse>(`/api/chat/rooms/${contactId}/members`, {
    teacherId: member.teacherId,
    role: member.role,
  })

  return mapGroupMember(data)
}

export async function removeChatMember(contactId: string, teacherId: string): Promise<void> {
  await api.delete(`/api/chat/rooms/${contactId}/members/${teacherId}`)
}

export async function fetchChatMessages(contactId: string, before?: string): Promise<ChatMessage[]> {
  const suffix = before ? `?before=${encodeURIComponent(before)}&limit=30` : '?limit=30'
  const data = await api.get<ChatMessageResponse[]>(`/api/chat/rooms/${contactId}/messages${suffix}`)
  if (!Array.isArray(data)) return []

  const baseMessages = data.map((item) => mapChatMessage(contactId, item))
  const messageMap = new Map(baseMessages.map((item) => [item.message.id, item.message]))

  return baseMessages.map(({ message, replyToId }) => ({
    ...message,
    replyTo: replyToId
      ? (() => {
          const replyTarget = messageMap.get(replyToId)
          return replyTarget
            ? { id: replyTarget.id, senderName: replyTarget.senderName, text: replyTarget.text }
            : undefined
        })()
      : undefined,
  }))
}

export async function postChatMessage(
  contactId: string,
  content: string,
  replyToId?: string | null,
  clientId?: string,
): Promise<ChatMessage> {
  const data = await api.post<ChatMessageResponse | { message?: string }>(`/api/chat/rooms/${contactId}/messages`, {
    content,
    type: 'text',
    reply_to_id: replyToId ?? undefined,
    // WS ack 超时走 HTTP 回退时带上同一 clientId，服务端可据此幂等去重
    clientId: clientId ?? undefined,
  })

  if (!data || typeof data !== 'object' || !('id' in data)) {
    throw new Error('消息发送响应异常')
  }

  return mapChatMessage(contactId, data).message
}
