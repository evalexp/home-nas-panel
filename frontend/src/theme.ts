import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'home-nas-panel-theme'
const listeners = new Set<() => void>()
const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined'
const media = canUseDOM && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

function readPreference(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

let preference = canUseDOM ? readPreference() : null
let theme: Theme = preference ?? (media?.matches ? 'dark' : 'light')

function applyTheme() {
  if (!canUseDOM) return
  // Keep the pre-paint script in index.html aligned with these DOM updates.
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', theme === 'dark' ? '#1c2332' : '#f2f4f8',
  )
}

function refreshTheme() {
  const next = preference ?? (media?.matches ? 'dark' : 'light')
  const changed = next !== theme
  theme = next
  applyTheme()
  if (changed) listeners.forEach((listener) => listener())
}

function toggleTheme() {
  // Retain the explicit choice in memory even when storage is unavailable.
  preference = theme === 'dark' ? 'light' : 'dark'
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // The current page still keeps the choice for this session.
  }
  refreshTheme()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

if (canUseDOM) {
  applyTheme()
  media?.addEventListener('change', refreshTheme)
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    try {
      if (event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    preference = event.newValue === 'light' || event.newValue === 'dark'
      ? event.newValue
      : null
    refreshTheme()
  })
}

export function useTheme() {
  const currentTheme = useSyncExternalStore(subscribe, () => theme, () => 'light' as Theme)
  return { theme: currentTheme, toggleTheme }
}
