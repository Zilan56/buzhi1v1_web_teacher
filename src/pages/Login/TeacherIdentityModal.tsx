import { useState } from 'react'
import { api } from '../../lib/api'
import { TEACHER_IDENTITY_OPTIONS, getIdentityLabel, normalizeTeacherIdentity, type TeacherIdentity } from '../../lib/teacherRoles'

export type TeacherProfile = {
  id: number | string
  name: string
  email?: string
  title?: string
  teamRole: TeacherIdentity
  teamRoleConfigured: boolean
  teamRoleLabel?: string
}

export function TeacherIdentityModal({
  profile,
  onSaved,
  onClose,
}: {
  profile: TeacherProfile
  onSaved: (profile: TeacherProfile) => void
  onClose?: () => void
}) {
  const [selectedRole, setSelectedRole] = useState<TeacherIdentity>(normalizeTeacherIdentity(profile.teamRole))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSaving(true)
    setError('')

    try {
      const nextProfile = await api.put<TeacherProfile>('/api/auth/teacher/profile', {
        teamRole: selectedRole,
      })
      onSaved({
        ...nextProfile,
        teamRole: normalizeTeacherIdentity(nextProfile.teamRole),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存身份失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 py-6">
      <div className="w-full max-w-[680px] rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">选择老师身份</div>
            <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {profile.name}，请先确认你的当前身份。后续老师分配、课程分配和任务入口都会按这个身份显示。
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-left)] hover:text-[var(--color-text-primary)]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {TEACHER_IDENTITY_OPTIONS.map((option) => {
            const active = selectedRole === option.value
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => setSelectedRole(option.value)}
                className={[
                  'rounded-2xl border px-4 py-4 text-left transition-colors',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] bg-white hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-left)]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">{option.label}</div>
                  {active ? (
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
                      已选择
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{option.description}</div>
              </button>
            )
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-left)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          当前将保存为：{getIdentityLabel(selectedRole, true)}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '确认身份'}
          </button>
        </div>
      </div>
    </div>
  )
}
