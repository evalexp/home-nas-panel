import { CLEAR_NAV_CACHE, navigationCacheName } from './navCacheShared'

// Awaiting this acknowledgement makes logout and subsequent reads independent of worker timing.
export async function clearNavigationCache(token: string | null): Promise<void> {
  if (!token || !('caches' in window) || !crypto.subtle) return
  const controller = navigator.serviceWorker?.controller
  if (controller) {
    const acknowledged = await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel()
      const timer = window.setTimeout(() => finish(false), 2000)
      const finish = (success: boolean) => {
        window.clearTimeout(timer)
        channel.port1.close()
        resolve(success)
      }
      channel.port1.onmessage = (event) => finish(event.data?.ok === true)
      controller.postMessage({ type: CLEAR_NAV_CACHE, token }, [channel.port2])
    })
    if (acknowledged) return
  }
  await caches.delete(await navigationCacheName(token))
}
