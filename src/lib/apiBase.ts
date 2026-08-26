const DEFAULT_API_BASE_URL = 'https://apix.1v1.buzhi.com'
const RAW_ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const ENV_API_BASE_URL = typeof RAW_ENV_API_BASE_URL === 'string'
  ? RAW_ENV_API_BASE_URL.trim().replace(/\/+$/, '')
  : ''
const HAS_ENV_API_BASE_URL = ENV_API_BASE_URL.length > 0

export const API_BASE_URL = HAS_ENV_API_BASE_URL
  ? ENV_API_BASE_URL
  : (import.meta.env.DEV ? '' : DEFAULT_API_BASE_URL)

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return API_BASE_URL
    ? `${API_BASE_URL}${normalizedPath}`
    : normalizedPath
}
