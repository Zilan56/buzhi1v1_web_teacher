export type TeacherIdentity = 'coach' | 'diagnosis' | 'drill' | 'manager' | 'principal' | ''
export type TeamRoleKey = 'coach' | 'diagnosis' | 'drill' | 'manager'

type TeacherRoleCarrier = {
  role?: string
  roles?: string[]
  title?: string
  teamRole?: string
  teamRoleConfigured?: boolean
}

export const TEAM_ROLE_LABELS: Record<TeamRoleKey, string> = {
  coach: '带教老师',
  diagnosis: '诊断老师',
  drill: '刷题老师',
  manager: '学管老师',
}

export const TEACHER_IDENTITY_LABELS: Record<Exclude<TeacherIdentity, ''>, string> = {
  manager: '学管',
  coach: '带教',
  principal: '校长',
  diagnosis: '诊断',
  drill: '刷题',
}

export const TEACHER_IDENTITY_OPTIONS: Array<{
  value: TeacherIdentity
  label: string
  description: string
}> = [
  { value: 'manager', label: '学管', description: '拥有全部角色选择权限。' },
  { value: 'coach', label: '带教', description: '出现在带教相关分配里。' },
  { value: 'principal', label: '校长', description: '拥有全部角色选择权限。' },
  { value: 'diagnosis', label: '诊断', description: '出现在诊断相关分配里。' },
  { value: 'drill', label: '刷题', description: '出现在刷题相关分配里。' },
  { value: '', label: '暂不设置', description: '先不分类，但保留全部角色选择权限。' },
]

const FULL_ACCESS_IDENTITIES: TeacherIdentity[] = ['manager', 'principal', '']
const ROLE_SCOPE: TeamRoleKey[] = ['coach', 'diagnosis', 'drill', 'manager']

export function normalizeTeacherIdentity(value: unknown): TeacherIdentity {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'manager' || normalized.includes('学管')) return 'manager'
  if (normalized === 'principal' || normalized.includes('校长')) return 'principal'
  if (normalized === 'diagnosis' || normalized.includes('诊断')) return 'diagnosis'
  if (normalized === 'drill' || normalized.includes('刷题')) return 'drill'
  if (normalized === 'coach' || normalized.includes('带教')) return 'coach'
  return ''
}

export function inferTeacherIdentityFromTitle(title?: string): TeacherIdentity {
  return normalizeTeacherIdentity(title) || 'coach'
}

export function isFullAccessTeacherIdentity(identity: TeacherIdentity): boolean {
  return FULL_ACCESS_IDENTITIES.includes(identity)
}

export function getIdentityLabel(identity: TeacherIdentity, configured = true): string {
  if (!configured) return '未设置'
  return identity ? TEACHER_IDENTITY_LABELS[identity] : '暂不设置'
}

export function getTeacherRoleScope(teacher: TeacherRoleCarrier): TeamRoleKey[] {
  const normalizedRoles = Array.isArray(teacher.roles)
    ? teacher.roles.map((item) => normalizeTeacherIdentity(item)).filter(Boolean)
    : []

  if (normalizedRoles.length > 0) {
    if (normalizedRoles.some((role) => isFullAccessTeacherIdentity(role))) {
      return [...ROLE_SCOPE]
    }
    return ROLE_SCOPE.filter((role) => normalizedRoles.includes(role))
  }

  const explicitIdentity = normalizeTeacherIdentity(teacher.teamRole || teacher.role)
  if (explicitIdentity) {
    return isFullAccessTeacherIdentity(explicitIdentity)
      ? [...ROLE_SCOPE]
      : ROLE_SCOPE.filter((role) => role === explicitIdentity)
  }

  if (teacher.teamRoleConfigured) {
    return [...ROLE_SCOPE]
  }

  const inferredIdentity = inferTeacherIdentityFromTitle(teacher.title)
  return isFullAccessTeacherIdentity(inferredIdentity)
    ? [...ROLE_SCOPE]
    : ROLE_SCOPE.filter((role) => role === inferredIdentity)
}

export function teacherCanHandleRole(teacher: TeacherRoleCarrier, role: TeamRoleKey): boolean {
  return getTeacherRoleScope(teacher).includes(role)
}
