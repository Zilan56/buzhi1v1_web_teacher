import { useEffect, useState } from 'react'
import { TeacherWorkbench } from './pages/TeacherWorkbench/TeacherWorkbench'
import { useWorkbenchStore } from './pages/TeacherWorkbench/store/workbenchStore'
import { LoginPage } from './pages/Login/LoginPage'
import { api } from './lib/api'
import { clearToken, getToken, onAuthExpired, parseJwt } from './lib/auth'
import { logger } from './lib/logger'
import { normalizeTeacherIdentity } from './lib/teacherRoles'
import { TeacherIdentityModal, type TeacherProfile } from './pages/Login/TeacherIdentityModal'
import { ToastHost } from './components/ui/toast'

function buildFallbackTeacherProfile(token: string): TeacherProfile {
  const payload = parseJwt<{ name?: string }>(token)

  return {
    id: '',
    name: (typeof payload?.name === 'string' && payload.name) || '老师',
    email: '',
    title: '',
    teamRole: '',
    teamRoleConfigured: true,
    teamRoleLabel: '点击设置身份',
  }
}

function AppShell() {
  const [token, setTokenState] = useState<string>(() => getToken())
  const [profile, setProfile] = useState<TeacherProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [identityModalOpen, setIdentityModalOpen] = useState(false)

  function resetAuthState() {
    // 401/登出：清 token 的同时复位工作台 store（断 WS、清消息），防换号闪现上一账号数据
    useWorkbenchStore.getState().resetWorkbench()
    setTokenState('')
    setProfile(null)
    setProfileError('')
    setIdentityModalOpen(false)
  }

  function handleLogin(nextToken: string) {
    setTokenState(nextToken)
    setProfile(null)
    setProfileError('')
    setIdentityModalOpen(false)
  }

  function handleLogout() {
    logger.info('auth.logout')
    clearToken()
    resetAuthState()
  }

  useEffect(() => onAuthExpired(resetAuthState), [])

  async function loadTeacherProfile() {
    setProfileLoading(true)
    setProfileError('')

    try {
      const result = await api.get<TeacherProfile>('/api/auth/teacher/profile')
      const nextProfile = {
        ...result,
        teamRole: normalizeTeacherIdentity(result.teamRole),
      }
      setProfile(nextProfile)
      return nextProfile
    } catch (errorObject) {
      const message = errorObject instanceof Error ? errorObject.message : '加载老师信息失败'
      logger.warn('auth.profile.loadFailed', { message })
      setProfile(null)
      setProfileError(message)
      return null
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    if (!token) {
      setProfile(null)
      setProfileLoading(false)
      setProfileError('')
      return
    }

    let cancelled = false
    void loadTeacherProfile().then((nextProfile) => {
      if (cancelled) return
      if (!nextProfile) return
      setIdentityModalOpen(false)
    })

    return () => {
      cancelled = true
    }
  }, [token])

  function handleIdentitySaved(nextProfile: TeacherProfile) {
    setProfile(nextProfile)
    setIdentityModalOpen(false)
  }

  async function handleOpenIdentitySettings() {
    if (profile) {
      setIdentityModalOpen(true)
      return
    }

    setIdentityModalOpen(true)
    await loadTeacherProfile()
  }

  const modalProfile = profile ?? (identityModalOpen ? buildFallbackTeacherProfile(token) : null)

  if (!token) {
    return <LoginPage onLogin={handleLogin} />
  }

  if (profileLoading && !profile) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] text-sm text-[var(--color-text-secondary)]">正在加载老师信息...</div>
  }

  if (profileError && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-page-bg)] px-6 text-center">
        <div className="text-sm font-semibold text-[#d96b4d]">老师信息加载失败</div>
        <div className="max-w-md text-[13px] text-[var(--color-text-muted)]">{profileError}</div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void loadTeacherProfile()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            重试
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-left)]"
          >
            退出登录
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <TeacherWorkbench
        onLogout={handleLogout}
        onOpenIdentitySettings={() => void handleOpenIdentitySettings()}
        teacherRoleLabel={profile?.teamRoleLabel || (profileLoading ? '身份加载中...' : '点击设置身份')}
      />
      {modalProfile && (!profile || !profile.teamRoleConfigured || identityModalOpen) ? (
        <TeacherIdentityModal
          profile={modalProfile}
          onSaved={handleIdentitySaved}
          onClose={profile?.teamRoleConfigured !== false ? () => setIdentityModalOpen(false) : undefined}
        />
      ) : null}
    </>
  )
}

function App() {
  return (
    <>
      <ToastHost />
      <AppShell />
    </>
  )
}

export default App
