/**
 * 前端分级日志工具。
 *
 * - 分级：debug / info / warn / error，低于当前级别的日志被丢弃
 * - 模块前缀：logger.child('ws') 产生带 scope 的子 logger
 * - 内存环形缓冲：最近 500 条，可通过 window.__WORKBENCH_LOGS__.entries() 导出排障
 * - 级别来源（优先级从高到低）：localStorage 'teacher_log_level' → VITE_LOG_LEVEL →
 *   开发环境 debug / 生产环境 warn
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const BUFFER_LIMIT = 500
const STORAGE_KEY = 'teacher_log_level'
const LEVELS = Object.keys(LEVEL_ORDER) as LogLevel[]

export interface LogEntry {
  time: string
  level: LogLevel
  scope: string
  event: string
  context?: Record<string, unknown>
}

function resolveInitialLevel(): LogLevel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LEVELS as string[]).includes(stored)) return stored as LogLevel
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级
  }

  const envLevel = import.meta.env.VITE_LOG_LEVEL as string | undefined
  if (envLevel && (LEVELS as string[]).includes(envLevel)) return envLevel as LogLevel

  return import.meta.env.DEV ? 'debug' : 'warn'
}

let currentLevel = resolveInitialLevel()
let buffer: LogEntry[] = []

export function setLogLevel(level: LogLevel) {
  currentLevel = level
  try {
    localStorage.setItem(STORAGE_KEY, level)
  } catch {
    // 忽略写入失败
  }
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

export function getRecentLogs(limit?: number): LogEntry[] {
  return typeof limit === 'number' && limit > 0 ? buffer.slice(-limit) : [...buffer]
}

function toTimeString(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function write(level: LogLevel, scope: string, event: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return

  const entry: LogEntry = {
    time: toTimeString(new Date()),
    level,
    scope,
    event,
    context,
  }
  buffer.push(entry)
  if (buffer.length > BUFFER_LIMIT) buffer = buffer.slice(-BUFFER_LIMIT)

  const prefix = `[${entry.time}][${scope}]`
  const suffix = context ? ` ${JSON.stringify(context)}` : ''
  const line = `${prefix} ${event}${suffix}`

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else if (level === 'info') console.info(line)
  else console.debug(line)
}

export interface Logger {
  debug(event: string, context?: Record<string, unknown>): void
  info(event: string, context?: Record<string, unknown>): void
  warn(event: string, context?: Record<string, unknown>): void
  error(event: string, context?: Record<string, unknown>): void
  child(scope: string): Logger
}

function createLogger(scope: string): Logger {
  return {
    debug: (event, context) => write('debug', scope, event, context),
    info: (event, context) => write('info', scope, event, context),
    warn: (event, context) => write('warn', scope, event, context),
    error: (event, context) => write('error', scope, event, context),
    child: (childScope) => createLogger(childScope.includes(scope) ? childScope : `${scope}.${childScope}`),
  }
}

export const logger = createLogger('app')

declare global {
  interface Window {
    /** 现场排障入口：__WORKBENCH_LOGS__.entries() 取最近日志，.export() 导出 JSON 字符串 */
    __WORKBENCH_LOGS__?: {
      entries: (limit?: number) => LogEntry[]
      export: () => string
      setLevel: (level: LogLevel) => void
    }
  }
}

if (typeof window !== 'undefined') {
  window.__WORKBENCH_LOGS__ = {
    entries: getRecentLogs,
    export: () => JSON.stringify(getRecentLogs(), null, 2),
    setLevel: setLogLevel,
  }
}
