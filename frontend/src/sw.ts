/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import {
  CLEAR_NAV_CACHE,
  NAV_CACHE_PREFIX,
  NAV_LIST_MAX_AGE,
  NAV_ICON_MAX_AGE,
  NAV_CACHE_MAX_ENTRIES,
  NAV_CACHE_MAX_SESSIONS,
  isNavigationRead,
  navigationInvalidations,
  navigationCacheName,
  tokenExpiresAt,
} from './api/navCacheShared'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

void self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api(?:\/|$)/],
}))

const cachedAtHeader = 'X-Nav-Cached-At'
const generations = new Map<string, number>()
const queues = new Map<string, Promise<unknown>>()

function generation(key: string): number {
  return generations.get(key) || 0
}

function advance(key: string) {
  generations.set(key, generation(key) + 1)
}

// Serialize cache writes and invalidations so a slow, older response cannot restore deleted data.
function serialize<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const result = (queues.get(name) || Promise.resolve()).catch(() => {}).then(operation)
  queues.set(name, result)
  void result.finally(() => {
    if (queues.get(name) === result) queues.delete(name)
  }).catch(() => {})
  return result
}

async function clearSession(token: string) {
  advance(token)
  const name = await navigationCacheName(token)
  advance(name)
  await serialize(name, () => caches.delete(name))
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== CLEAR_NAV_CACHE || typeof event.data.token !== 'string') return
  event.waitUntil(clearSession(event.data.token).then(
    () => event.ports[0]?.postMessage({ ok: true }),
    () => event.ports[0]?.postMessage({ ok: false }),
  ))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => name.startsWith('nas-nav-') && !name.startsWith(NAV_CACHE_PREFIX))
    .map((name) => caches.delete(name)))))
})

async function invalidate(token: string, paths: string[]) {
  paths.forEach((path) => advance(token + path))
  const name = await navigationCacheName(token)
  await serialize(name, async () => {
    const cache = await caches.open(name)
    await Promise.all(paths.map((path) => cache.delete(new URL(path, self.location.origin).href)))
  })
}

async function readNavigation(request: Request, token: string): Promise<Response> {
  const expiresAt = tokenExpiresAt(token)
  if (expiresAt <= Date.now()) {
    await clearSession(token).catch(() => {})
    return fetch(request, { cache: 'no-store' })
  }

  // Capture versions before hashing: logout may arrive while crypto.subtle is still pending.
  const path = new URL(request.url).pathname
  const key = token + path
  const force = request.cache === 'reload' || request.cache === 'no-store'
  if (force) advance(key)
  const sessionGeneration = generation(token)
  const entryGeneration = generation(key)
  const name = await navigationCacheName(token)
  const cacheGeneration = generation(name)
  const isCurrent = () => generation(token) === sessionGeneration && generation(key) === entryGeneration && generation(name) === cacheGeneration
  let cache: Cache | undefined
  try {
    cache = await caches.open(name)
    if (!force) {
      const cached = await cache.match(request.url)
      const storedAt = Number(cached?.headers.get(cachedAtHeader))
      const maxAge = /^\/api\/nav\/icons\/\d+$/.test(path) ? NAV_ICON_MAX_AGE : NAV_LIST_MAX_AGE
      if (cached && storedAt > 0 && Date.now() - storedAt < maxAge && isCurrent()) return cached
    }
  } catch {
    // Storage may be unavailable or full; an online read must still work.
  }

  const response = await fetch(request, { cache: 'no-store' })
  if (response.status === 401) {
    await clearSession(token).catch(() => {})
    return response
  }
  if (!response.ok || !cache || !isCurrent() || expiresAt <= Date.now()) return response

  const copy = response.clone()
  try {
    const headers = new Headers(copy.headers)
    headers.set(cachedAtHeader, String(Date.now()))
    const cachedResponse = new Response(await copy.arrayBuffer(), { status: copy.status, headers })
    await serialize(name, async () => {
      if (!isCurrent()) return
      await cache.put(request.url, cachedResponse)
      const keys = await cache.keys()
      // Keep the two small indexes; evict the oldest icon entries first.
      const icons = keys.filter((entry) => /\/icons\/\d+$/.test(new URL(entry.url).pathname))
      await Promise.all(icons.slice(0, Math.max(0, keys.length - NAV_CACHE_MAX_ENTRIES))
        .map((entry) => cache.delete(entry)))
    })
    const sessions = (await caches.keys()).filter((entry) => entry.startsWith(NAV_CACHE_PREFIX) && entry !== name)
    await Promise.all(sessions.slice(0, Math.max(0, sessions.length + 1 - NAV_CACHE_MAX_SESSIONS))
      .map((entry) => {
        advance(entry)
        return serialize(entry, () => caches.delete(entry))
      }))
  } catch {
    // A failed cache write must not discard a successful server response.
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token || url.search) return
  if (request.method === 'GET' && isNavigationRead(url.pathname)) {
    event.respondWith(readNavigation(request, token))
    return
  }

  const paths = navigationInvalidations(url.pathname, request.method)
  if (paths.length) {
    event.respondWith((async () => {
      const response = await fetch(request)
      if (response.ok) await invalidate(token, paths).catch(async () => {
        // If targeted invalidation fails, discard the session cache instead.
        await clearSession(token)
      }).catch((error) => console.warn('无法清理导航缓存', error))
      return response
    })())
  }
})
