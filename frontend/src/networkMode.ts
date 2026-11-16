import { useSyncExternalStore } from 'react'
import type { NavItem } from './api/client'

export type NetworkMode = 'external' | 'internal'

const STORAGE_KEY = 'home-nas-panel-network-mode'
const listeners = new Set<() => void>()
const canUseDOM = typeof window !== 'undefined'

function readMode(): NetworkMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'internal' ? 'internal' : 'external'
  } catch {
    return 'external'
  }
}

let mode: NetworkMode = canUseDOM ? readMode() : 'external'

function updateMode(next: NetworkMode) {
  if (mode === next) return
  mode = next
  listeners.forEach((listener) => listener())
}

function toggleNetworkMode() {
  const next = mode === 'internal' ? 'external' : 'internal'
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // A restricted browser can still keep the selection for this page session.
  }
  updateMode(next)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

if (canUseDOM) {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    try {
      if (event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    updateMode(event.newValue === 'internal' ? 'internal' : 'external')
  })
}

export function resolveNavigationUrl(item: Pick<NavItem, 'url' | 'internalUrl'>, networkMode: NetworkMode): string {
  return networkMode === 'internal' ? item.internalUrl?.trim() || item.url : item.url
}

export function useNetworkMode() {
  const networkMode = useSyncExternalStore(subscribe, () => mode, () => 'external' as NetworkMode)
  return { networkMode, toggleNetworkMode }
}
