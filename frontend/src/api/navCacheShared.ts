export const NAV_CACHE_PREFIX = 'nas-nav-v1-'
export const NAV_LIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000
export const NAV_ICON_MAX_AGE = 30 * 24 * 60 * 60 * 1000
export const NAV_CACHE_MAX_ENTRIES = 258
export const NAV_CACHE_MAX_SESSIONS = 4
export const CLEAR_NAV_CACHE = 'CLEAR_NAV_CACHE'

export function isNavigationRead(path: string): boolean {
  return path === '/api/nav' || path === '/api/nav/icons' || /^\/api\/nav\/icons\/[1-9]\d*$/.test(path)
}

export function navigationInvalidations(path: string, method: string): string[] {
  if ((path === '/api/nav' && method === 'POST') ||
      (/^\/api\/nav\/[1-9]\d*$/.test(path) && (method === 'PUT' || method === 'DELETE')) ||
      (path === '/api/nav/reorder' && method === 'POST')) {
    return ['/api/nav']
  }
  if (path === '/api/nav/icons' && method === 'POST') return ['/api/nav/icons']
  if (/^\/api\/nav\/icons\/[1-9]\d*$/.test(path) && method === 'DELETE') {
    return ['/api/nav', '/api/nav/icons', path]
  }
  return []
}

export function tokenExpiresAt(token: string): number {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(payload))
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : 0
  } catch {
    return 0
  }
}

export async function navigationCacheName(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return NAV_CACHE_PREFIX + fingerprint
}
