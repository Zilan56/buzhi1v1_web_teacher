/**
 * 教师 token 的唯一存取入口与 JWT 解析。
 *
 * 全项目读写 token 必须经由本模块（grep 验收：`teacher_token` 字面量只允许出现在本文件）。
 * parseJwt 正确处理 base64url（-/_）与 UTF-8 中文 payload——直接 atob 会在两种情况下
 * 静默失败或得到乱码，这是历史 bug 的根源。
 */

import { logger } from './logger'

export const AUTH_EXPIRED_EVENT = 'teacher-auth-expired'

const TOKEN_KEY = 'teacher_token'

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function hasToken(): boolean {
  return getToken().length > 0
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch (error) {
    logger.warn('auth.token.setFailed', { reason: error instanceof Error ? error.message : String(error) })
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 忽略
  }
}

/** 解析 JWT payload（不校验签名）。失败返回 null 并记录日志。 */
export function parseJwt<T extends Record<string, unknown>>(token: string): T | null {
  const payloadPart = token.split('.')[1]
  if (!payloadPart) return null

  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const decoded = new TextDecoder('utf-8').decode(bytes)
    return JSON.parse(decoded) as T
  } catch (error) {
    logger.warn('auth.jwt.parseFailed', { reason: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export interface TeacherIdentity {
  id: string
  name: string
}

/** 从 token 中取当前教师身份（id/name），失败返回空身份。 */
export function getTeacherIdentityFromToken(token = getToken()): TeacherIdentity {
  const payload = parseJwt<{ id?: string | number; name?: string }>(token)
  if (!payload) return { id: '', name: '' }
  return {
    id: payload.id === undefined || payload.id === null ? '' : String(payload.id),
    name: typeof payload.name === 'string' && payload.name ? payload.name : '',
  }
}

/** 401 过期：清 token 并广播事件（App.tsx 监听后回登录页）。 */
export function notifyAuthExpired(reason: string): void {
  logger.warn('auth.token.expired', { reason })
  clearToken()
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

/** 订阅 401 过期事件，返回退订函数。 */
export function onAuthExpired(handler: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, handler)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
}
