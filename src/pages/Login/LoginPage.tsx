import { useState } from 'react'
import { api } from '../../lib/api'
import { setToken } from '../../lib/auth'

interface LoginPageProps {
  onLogin: (token: string) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')

  // 登录字段
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  // 注册额外字段
  const [name,     setName]     = useState('')
  const [confirm,  setConfirm]  = useState('')

  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const fieldClassName = 'w-full max-w-[320px]'
  const inputClassName = 'h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-left)] pl-10 pr-4 text-[15px] outline-none transition-colors focus:border-[var(--color-primary)] focus:bg-white placeholder:text-[var(--color-text-muted)]'
  const passwordInputClassName = 'h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-left)] pl-10 pr-12 text-[15px] outline-none transition-colors focus:border-[var(--color-primary)] focus:bg-white placeholder:text-[var(--color-text-muted)]'

  function reset() {
    setEmail(''); setPassword(''); setName(''); setConfirm(''); setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password.trim()) { setError('请填写完整信息'); return }
    if (mode === 'register') {
      if (!name.trim())          { setError('请输入姓名'); return }
      if (password.length < 6)   { setError('密码至少 6 位'); return }
      if (password !== confirm)  { setError('两次密码不一致'); return }
    }

    setLoading(true)
    try {
      const path = mode === 'login' ? '/api/auth/teacher/login' : '/api/auth/teacher/register'
      const body = mode === 'login'
        ? { email: email.trim(), password }
        : { name: name.trim(), email: email.trim(), password }

      const data = await api.post<{ token: string; message?: string }>(path, body, { skipAuth: true })

      if (!data?.token) {
        setError('登录响应异常：未返回 token')
      } else {
        setToken(data.token)
        onLogin(data.token)
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '无法连接到服务器，请确认后端已启动')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f2fbf6] to-[#e8f7ef] px-4">
      <div className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Top banner */}
        <div className="bg-[var(--color-primary)] px-6 py-6 text-white">
          <div className="text-lg font-bold leading-tight">带教老师工作台</div>
          <div className="mt-0.5 text-[13px] text-white/70">
            {mode === 'login' ? '请登录您的账号' : '创建新账号'}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-[var(--color-border)]">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button"
              onClick={() => { setMode(m); reset() }}
              className={[
                'flex-1 py-2.5 text-sm font-medium transition-colors',
                mode === m
                  ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
              ].join(' ')}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col items-center px-6 py-6 space-y-4">

          {/* 姓名（注册时显示） */}
          {mode === 'register' && (
            <div className={fieldClassName}>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">姓名</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-[var(--color-text-muted)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input autoFocus type="text" value={name}
                  onChange={(e) => { setName(e.target.value); setError('') }}
                  placeholder="请输入您的姓名"
                  className={inputClassName}
                />
              </div>
            </div>
          )}

          {/* 邮箱 */}
          <div className={fieldClassName}>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">账号</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-[var(--color-text-muted)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
              </span>
              <input autoFocus={mode === 'login'} type="email" autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="请输入账号"
                className={inputClassName}
              />
            </div>
          </div>

          {/* 密码 */}
          <div className={fieldClassName}>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">密码</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-[var(--color-text-muted)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
              </span>
              <input type={showPwd ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
                className={passwordInputClassName}
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">
                {showPwd ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* 确认密码（注册时显示） */}
          {mode === 'register' && (
            <div className={fieldClassName}>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">确认密码</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-[var(--color-text-muted)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </span>
                <input type={showPwd ? 'text' : 'password'} autoComplete="new-password" value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError('') }}
                  placeholder="再次输入密码"
                  className={inputClassName}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={`${fieldClassName} flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading}
            className={`${fieldClassName} h-12 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50`}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                {mode === 'login' ? '登录中…' : '注册中…'}
              </span>
            ) : (mode === 'login' ? '登 录' : '注 册')}
          </button>

          <p className="text-center text-[11px] text-[var(--color-text-muted)]">
            账号注册后即可登录工作台
          </p>
        </form>
      </div>
    </div>
  )
}
