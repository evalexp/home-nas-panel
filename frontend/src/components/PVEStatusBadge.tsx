import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { api, PVEOnlineStatus } from '../api/client'

export const PVEStatusBadge: React.FC = () => {
  const [data, setData] = useState<PVEOnlineStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchStatus = async (manual = false) => {
    if (manual) setLoading(true)
    try {
      const res = await api.pve.getOnline()
      setData(res)
    } catch {
      // Keep the last known state when a background refresh fails.
    } finally {
      if (manual) setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus(false)
    const timer = setInterval(() => fetchStatus(false), 10000)
    return () => clearInterval(timer)
  }, [])

  const isOnline = data?.online ?? false
  const label = data ? (isOnline ? 'PVE 运行中' : 'PVE 已停机') : '检测中...'

  return (
    <button
      type="button"
      onClick={() => fetchStatus(true)}
      disabled={loading}
      className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
        isOnline ? 'bg-success-soft text-success hover:bg-raised' : 'bg-raised text-muted hover:bg-raised-strong'
      }`}
      title={`${label}（每 10 秒自动刷新，点击立即刷新）`}
      aria-label={`${label}，点击刷新 PVE 状态`}
    >
      {loading ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-success' : 'bg-muted'}`} />
      )}
      <span className="hidden whitespace-nowrap min-[420px]:inline">{label}</span>
    </button>
  )
}
