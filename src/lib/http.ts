/**
 * 全项目唯一的 HTTP 请求核心。
 *
 * 职责：超时（AbortController）、HTML 响应防御、JSON 解析防护、blob 分支、
 * 401 → clearToken + 过期事件、失败统一日志。表单上传与 JSON 请求走同一核心。
 * 业务代码不直接 import 本文件——一律通过 `lib/api.ts` 门面。
 */

import { apiUrl } from './apiBase'
import { getToken, notifyAuthExpired } from './auth'
import { logger } from './logger'

export type ApiErrorKind = 'timeout' | 'network' | 'html' | 'http' | 'parse'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly url: string

  constructor(kind: ApiErrorKind, message: string, url: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.url = url
  }
}

export const DEFAULT_TIMEOUT_MS = 15000
export const DEFAULT_FORM_TIMEOUT_MS = 300000

export interface HttpOptions {
  body?: unknown
  form?: FormData
  responseType?: 'json' | 'blob'
  timeoutMs?: number
  /** 登录/注册等无凭证接口设为 true：401 不触发 token 过期广播 */
  skipAuth?: boolean
}

const httpLogger = logger.child('http')

function formatTimeout(timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000)
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分钟` : `${seconds} 秒`
}

function safeParseJson(text: string, url: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    throw new ApiError('parse', `响应不是合法的 JSON。地址: ${url}`, url)
  }
}

export async function httpRequest<T>(method: string, path: string, options: HttpOptions = {}): Promise<T> {
  const url = apiUrl(path)
  const { body, form, responseType = 'json', skipAuth = false } = options
  const isForm = form !== undefined
  const timeoutMs = options.timeoutMs ?? (isForm ? DEFAULT_FORM_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)
  const startedAt = Date.now()

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${getToken()}`,
      },
      body: isForm ? form : body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (error) {
    const durationMs = Date.now() - startedAt
    if (error instanceof DOMException && error.name === 'AbortError') {
      httpLogger.warn('api.request.timeout', { method, path, durationMs, timeoutMs })
      throw new ApiError('timeout', `请求超时（${formatTimeout(timeoutMs)}），请确认服务是否正常：${path}`, url)
    }
    httpLogger.warn('api.request.networkError', { method, path, reason: error instanceof Error ? error.message : String(error) })
    throw new ApiError('network', `无法连接到服务：${path}`, url)
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (response.status === 401 && !skipAuth) {
    notifyAuthExpired(`401 on ${method} ${path}`)
    throw new ApiError('http', '登录已过期，请重新登录', url, 401)
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      httpLogger.warn('api.request.failed', { method, path, status: response.status, durationMs: Date.now() - startedAt })
      throw new ApiError('http', `接口请求失败：${response.status} ${path}`, url, response.status)
    }
    return (await response.blob()) as T
  }

  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('text/html') || text.trim().startsWith('<')) {
    httpLogger.warn('api.request.htmlResponse', { method, path, status: response.status, contentType })
    throw new ApiError('html', `接口返回了网页而不是 JSON。状态码: ${response.status}，地址: ${url}`, url, response.status)
  }

  const data = safeParseJson(text, url)

  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data
      ? String((data as { message?: unknown }).message || '')
      : ''
    httpLogger.warn('api.request.failed', {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      message: message || undefined,
    })
    throw new ApiError('http', message || `接口请求失败：${response.status} ${path}`, url, response.status)
  }

  return data as T
}
