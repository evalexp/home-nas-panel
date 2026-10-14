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
      // Silently catch in badge
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

  return (
    <button
      type="button"
      onClick={() => fetchStatus(true)}
      disabled={loading}
      className={`relative flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-full border transition-all duration-300 cursor-pointer shadow-sm select-none ${
        isOnline
          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25 shadow-emerald-500/10'
          : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
      }`}
      title="PVE 节点运行状态（定时每 10 秒刷新，点击可手动刷新）"
    >
      {/* Animated Status Indicator Dot or Refresh Spinner */}
      <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5 items-center justify-center">
        {loading ? (
          <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400" />
        ) : (
          <>
            {isOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 ${
                isOnline ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            />
          </>
        )}
      </span>

      {/* Text reminder */}
      <span className="text-[11px] sm:text-xs font-bold tracking-wide whitespace-nowrap">
        {data ? (isOnline ? 'PVE 运行中' : 'PVE 已停机') : '检测中...'}
      </span>
    </button>
  )
}
