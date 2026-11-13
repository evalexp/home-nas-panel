import React, { useState, useEffect } from 'react'
import {
  Server,
  Cpu,
  Activity,
  HardDrive,
  Layers,
  Power,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Play,
  Clock,
  X,
  Zap,
  CheckCircle2,
} from 'lucide-react'
import { api, PVEOnlineStatus, PVEGuest } from '../api/client'

export const PVEStatusPage: React.FC = () => {
  const [status, setStatus] = useState<any>(null)
  const [guests, setGuests] = useState<PVEGuest[]>([])
  const [onlineStatus, setOnlineStatus] = useState<PVEOnlineStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [confirmPowerOn, setConfirmPowerOn] = useState(false)
  const [confirmShutdown, setConfirmShutdown] = useState(false)
  const [confirmReboot, setConfirmReboot] = useState(false)
  const [guestActionTarget, setGuestActionTarget] = useState<{
    guest: PVEGuest
    action: 'start' | 'shutdown' | 'reboot'
  } | null>(null)

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [stRes, onlineRes] = await Promise.allSettled([
        api.pve.getStatus(),
        api.pve.getOnline(),
      ])

      if (stRes.status === 'fulfilled') {
        setStatus(stRes.value)
        setError('')
      } else if (!silent) {
        setError(stRes.reason?.message || '获取 PVE 宿主机状态失败，请在设置中检查 Token 配置')
      }

      if (onlineRes.status === 'fulfilled') {
        setOnlineStatus(onlineRes.value)
      }

      try {
        const gs = await api.pve.getGuests()
        if (Array.isArray(gs)) {
          const sorted = [...gs].sort((a, b) => Number(a.vmid) - Number(b.vmid))
          setGuests(sorted)
        }
      } catch {}
    } catch (err: any) {
      if (!silent) setError(err.message || '数据刷新失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(false)
    const timer = setInterval(() => fetchData(true), 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionLoading) {
        setConfirmPowerOn(false)
        setConfirmShutdown(false)
        setConfirmReboot(false)
        setGuestActionTarget(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actionLoading])

  const openPowerOnModal = () => {
    setModalError('')
    setError('')
    setActionSuccess('')
    setConfirmPowerOn(true)
  }

  const openShutdownModal = () => {
    setModalError('')
    setError('')
    setActionSuccess('')
    setConfirmShutdown(true)
  }

  const openRebootModal = () => {
    setModalError('')
    setError('')
    setActionSuccess('')
    setConfirmReboot(true)
  }

  const handlePowerOn = async () => {
    setActionLoading(true)
    setModalError('')
    setError('')
    try {
      const res = await api.pve.start()
      setConfirmPowerOn(false)
      setActionSuccess(res?.message || '已成功向绑定的 WOL 设备发送网络唤醒指令！')
      setStatus((prev: any) => (prev ? { ...prev, status: 'booting' } : { status: 'booting' }))
      setTimeout(() => fetchData(true), 2500)
    } catch (err: any) {
      const msg = err.message || '唤醒指令发送失败'
      setModalError(msg)
      setError(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const handleGuestAction = async () => {
    if (!guestActionTarget) return
    setActionLoading(true)
    setModalError('')
    setError('')
    const { guest, action } = guestActionTarget
    try {
      let res: { message: string }
      if (action === 'start') {
        res = await api.pve.startGuest(guest.type, guest.vmid, status?.node)
      } else if (action === 'shutdown') {
        res = await api.pve.shutdownGuest(guest.type, guest.vmid, status?.node)
      } else {
        res = await api.pve.rebootGuest(guest.type, guest.vmid, status?.node)
      }
      setGuestActionTarget(null)
      setActionSuccess(res?.message || '操作指令已成功发送！')
      setTimeout(() => fetchData(true), 1500)
    } catch (err: any) {
      const msg = err.message || '操作指令下发失败'
      setModalError(msg)
      setError(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const handleShutdown = async () => {
    setActionLoading(true)
    setModalError('')
    setError('')
    try {
      await api.pve.shutdown(true)
      setConfirmShutdown(false)
      setActionSuccess('已向 PVE 宿主机下发关机指令，系统正在安全关机...')
      setStatus((prev: any) => (prev ? { ...prev, status: 'shutting_down' } : null))
    } catch (err: any) {
      const msg = err.message || '关机指令发送失败'
      setModalError(msg)
      setError(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReboot = async () => {
    setActionLoading(true)
    setModalError('')
    setError('')
    try {
      await api.pve.reboot(true)
      setConfirmReboot(false)
      setActionSuccess('已向 PVE 宿主机下发重启指令，系统正在重启...')
      setStatus((prev: any) => (prev ? { ...prev, status: 'rebooting' } : null))
    } catch (err: any) {
      const msg = err.message || '重启指令发送失败'
      setModalError(msg)
      setError(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const formatUptime = (seconds: number) => {
    if (!seconds) return '离线'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}天 ${hours}小时 ${mins}分`
    return `${hours}小时 ${mins}分`
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(1)} GB`
  }

  const cpuPercent = Math.min(100, Math.round((status?.cpuUsage || 0) * 100))
  const memPercent = status?.memoryTotal
    ? Math.min(100, Math.round((status.memoryUsed / status.memoryTotal) * 100))
    : 0
  const diskPercent = status?.diskTotal
    ? Math.min(100, Math.round((status.diskUsed / status.diskTotal) * 100))
    : 0

  const isOnline = status?.status === 'online'

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Node Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent-soft border border-accent-border flex items-center justify-center text-accent shadow-panel">
            <Server className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-ink">{status?.node || 'pve'}</h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isOnline
                    ? 'bg-success-soft text-success border border-success-border'
                    : 'bg-danger-soft text-danger border border-danger-border'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-success' : 'bg-danger'
                  }`}
                />
                {isOnline ? '宿主机运行中' : status?.status || '离线 / 未连接'}
              </span>
            </div>
            <p className="text-xs text-muted mt-1 font-mono">
              内核: {status?.kversion || 'Linux (PVE)'} • 版本: {status?.pveversion || 'PVE Manager'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(false)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-raised hover:bg-raised-strong active:translate-y-px text-body rounded-lg text-xs font-semibold border border-border disabled:opacity-50 transition-all cursor-pointer"
            title="刷新数据"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">刷新</span>
          </button>

          {isOnline ? (
            <>
              <button
                onClick={openRebootModal}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-raised hover:bg-raised-strong active:translate-y-px text-ink rounded-lg text-xs font-semibold border border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-accent" />
                <span>重启</span>
              </button>

              <button
                onClick={openShutdownModal}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-danger-soft hover:bg-danger-soft active:translate-y-px text-danger rounded-lg text-xs font-semibold border border-danger-border disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>关机</span>
              </button>
            </>
          ) : (
            <button
              onClick={openPowerOnModal}
              disabled={!onlineStatus?.wolConfigured || actionLoading}
              title={
                !onlineStatus?.wolConfigured
                  ? !onlineStatus?.wolDeviceBound
                    ? '需先在设置的 PVE 配置中绑定 WOL 设备'
                    : '需先在设置中配置 WOL 控制参数'
                  : `通过 WOL 控制唤醒物理宿主机 (${onlineStatus?.wolDeviceName || '已绑定设备'})`
              }
              className="flex items-center gap-1.5 px-3.5 py-2 bg-success-soft hover:bg-success-soft active:translate-y-px text-success rounded-lg text-xs font-semibold border border-success-border disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-panel"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>开机 (WOL)</span>
            </button>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-success-soft border border-success-border rounded-xl text-success text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess('')}
            className="text-success hover:text-success p-1 cursor-pointer transition-colors"
            aria-label="关闭提示"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && !confirmPowerOn && !confirmShutdown && !confirmReboot && (
        <div className="p-4 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="text-danger hover:text-danger p-1 cursor-pointer transition-colors"
            aria-label="关闭提示"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Popup Modal for Power On */}
      {confirmPowerOn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => !actionLoading && setConfirmPowerOn(false)}
          />
          <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-float animate-in zoom-in-95 duration-200 z-10">
            <button
              onClick={() => !actionLoading && setConfirmPowerOn(false)}
              className="absolute top-5 right-5 p-1.5 text-muted hover:text-ink hover:bg-raised rounded-lg transition-colors cursor-pointer"
              aria-label="关闭窗口"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 rounded-xl bg-success-soft border border-success-border text-success">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">确认唤醒 PVE 宿主机？</h3>
                <p className="text-xs text-muted">唤醒方式: WOL 控制报文 (Wake-on-LAN)</p>
              </div>
            </div>

            <div className="bg-raised border border-border rounded-xl p-4 text-xs text-body leading-relaxed mb-4 space-y-2">
              <p>系统将向配置的局域网控制网关发送唤醒指令报文，通过网络唤醒 (Wake-on-LAN) 启动物理宿主机。</p>
              {onlineStatus?.wolDeviceName && (
                <div className="pt-2 border-t border-border flex items-center justify-between font-mono text-[11px]">
                  <span className="text-muted">绑定设备: {onlineStatus.wolDeviceName}</span>
                  <span className="text-accent font-semibold">{onlineStatus.wolDeviceMac}</span>
                </div>
              )}
            </div>

            {modalError && (
              <div className="mb-4 p-4 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs flex items-start gap-3 animate-in fade-in duration-150">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
                <div className="flex-1">
                  <p className="font-semibold text-danger text-xs">唤醒请求失败</p>
                  <p className="text-[11px] text-danger mt-1 leading-relaxed font-mono break-all">{modalError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmPowerOn(false)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-body hover:bg-raised transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handlePowerOn}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold rounded-lg shadow-panel transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{actionLoading ? '唤醒请求发送中...' : '确认发送唤醒'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Modal for Shutdown */}
      {confirmShutdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => !actionLoading && setConfirmShutdown(false)}
          />
          <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-float animate-in zoom-in-95 duration-200 z-10">
            {/* Close Button */}
            <button
              onClick={() => !actionLoading && setConfirmShutdown(false)}
              className="absolute top-5 right-5 p-1.5 text-muted hover:text-ink hover:bg-raised rounded-lg transition-colors cursor-pointer"
              aria-label="关闭窗口"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 rounded-xl bg-danger-soft border border-danger-border text-danger">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">确认关闭 PVE 宿主机？</h3>
                <p className="text-xs text-muted">目标节点: {status?.node || 'pve'}</p>
              </div>
            </div>

            <div className="bg-raised border border-border rounded-xl p-4 text-xs text-body leading-relaxed mb-4">
              <p>系统将向 PVE 下发关机指令，所有虚拟机与容器将有序保存状态并关机。</p>
            </div>

            {modalError && (
              <div className="mb-4 p-4 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs flex items-start gap-3 animate-in fade-in duration-150">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
                <div className="flex-1">
                  <p className="font-semibold text-danger text-xs">关机请求失败</p>
                  <p className="text-[11px] text-danger mt-1 leading-relaxed font-mono break-all">{modalError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmShutdown(false)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-body hover:bg-raised transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleShutdown}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2 bg-danger-action hover:bg-danger-action text-on-primary text-xs font-semibold rounded-lg shadow-panel transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{actionLoading ? '关机指令执行中...' : '确认关机'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Modal for Reboot */}
      {confirmReboot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => !actionLoading && setConfirmReboot(false)}
          />
          <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-float animate-in zoom-in-95 duration-200 z-10">
            {/* Close Button */}
            <button
              onClick={() => !actionLoading && setConfirmReboot(false)}
              className="absolute top-5 right-5 p-1.5 text-muted hover:text-ink hover:bg-raised rounded-lg transition-colors cursor-pointer"
              aria-label="关闭窗口"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 rounded-xl bg-accent-soft border border-accent-border text-accent">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">确认重启 PVE 宿主机？</h3>
                <p className="text-xs text-muted">目标节点: {status?.node || 'pve'}</p>
              </div>
            </div>

            <div className="bg-raised border border-border rounded-xl p-4 text-xs text-body leading-relaxed mb-4">
              <p>宿主机将执行安全重启流程，保存当前状态并重新载入系统。</p>
            </div>

            {modalError && (
              <div className="mb-4 p-4 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs flex items-start gap-3 animate-in fade-in duration-150">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
                <div className="flex-1">
                  <p className="font-semibold text-danger text-xs">重启请求失败</p>
                  <p className="text-[11px] text-danger mt-1 leading-relaxed font-mono break-all">{modalError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmReboot(false)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-body hover:bg-raised transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleReboot}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold rounded-lg shadow-panel transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{actionLoading ? '重启中...' : '确认重启'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Modal for Guest Action (VM / Container) */}
      {guestActionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => !actionLoading && setGuestActionTarget(null)}
          />
          <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-float animate-in zoom-in-95 duration-200 z-10">
            <button
              onClick={() => !actionLoading && setGuestActionTarget(null)}
              className="absolute top-5 right-5 p-1.5 text-muted hover:text-ink hover:bg-raised rounded-lg transition-colors cursor-pointer"
              aria-label="关闭窗口"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3.5 mb-4">
              <div
                className={`p-3 rounded-xl ${
                  guestActionTarget.action === 'start'
                    ? 'bg-success-soft border border-success-border text-success'
                    : guestActionTarget.action === 'reboot'
                    ? 'bg-accent-soft border border-accent-border text-accent'
                    : 'bg-danger-soft border border-danger-border text-danger'
                }`}
              >
                {guestActionTarget.action === 'start' && <Play className="w-6 h-6" />}
                {guestActionTarget.action === 'reboot' && <RotateCcw className="w-6 h-6" />}
                {guestActionTarget.action === 'shutdown' && <Power className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">
                  {guestActionTarget.action === 'start' && '确认启动实例？'}
                  {guestActionTarget.action === 'shutdown' && '确认关闭实例？'}
                  {guestActionTarget.action === 'reboot' && '确认重启实例？'}
                </h3>
                <p className="text-xs text-muted">
                  {guestActionTarget.guest.name} (VMID: {guestActionTarget.guest.vmid} • {guestActionTarget.guest.type.toUpperCase()})
                </p>
              </div>
            </div>

            <div className="bg-raised border border-border rounded-xl p-4 text-xs text-body leading-relaxed mb-4">
              {guestActionTarget.action === 'start' && (
                <p>系统将向 PVE 下发开机指令，启动该 {guestActionTarget.guest.type === 'qemu' ? '虚拟机' : 'LXC 容器'}。</p>
              )}
              {guestActionTarget.action === 'shutdown' && (
                <p>系统将向 PVE 下发优雅关机指令，实例将有序停止服务并关机。</p>
              )}
              {guestActionTarget.action === 'reboot' && (
                <p>系统将向 PVE 下发重启指令，重新引导该 {guestActionTarget.guest.type === 'qemu' ? '虚拟机' : 'LXC 容器'}。</p>
              )}
            </div>

            {modalError && (
              <div className="mb-4 p-4 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs flex items-start gap-3 animate-in fade-in duration-150">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
                <div className="flex-1">
                  <p className="font-semibold text-danger text-xs">操作失败</p>
                  <p className="text-[11px] text-danger mt-1 leading-relaxed font-mono break-all">{modalError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setGuestActionTarget(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-body hover:bg-raised transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleGuestAction}
                disabled={actionLoading}
                className={`flex items-center gap-2 px-5 py-2 text-on-primary text-xs font-semibold rounded-lg shadow-panel transition-all cursor-pointer disabled:opacity-50 ${
                  guestActionTarget.action === 'start'
                    ? 'bg-primary hover:bg-primary-hover '
                    : guestActionTarget.action === 'reboot'
                    ? 'bg-primary hover:bg-primary-hover '
                    : 'bg-danger-action hover:bg-danger-action '
                }`}
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {actionLoading
                    ? '指令执行中...'
                    : guestActionTarget.action === 'start'
                    ? '确认开机'
                    : guestActionTarget.action === 'shutdown'
                    ? '确认关机'
                    : '确认重启'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Gauge */}
        <div className="p-5 bg-surface border border-border rounded-2xl shadow-panel flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted text-xs mb-3">
            <span className="flex items-center gap-1.5 font-semibold text-body">
              <Cpu className="w-4 h-4 text-muted" /> CPU 利用率
            </span>
            <span className="font-mono text-xl metric-value">{cpuPercent}%</span>
          </div>
          <div className="w-full bg-raised h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                cpuPercent > 80 ? 'bg-danger-action' : 'bg-primary'
              }`}
              style={{ width: `${cpuPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-muted font-mono">
            {status?.cpus ? `${status.cpus} 核心处理能力` : '等待连接'}
          </div>
        </div>

        {/* Memory Gauge */}
        <div className="p-5 bg-surface border border-border rounded-2xl shadow-panel flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted text-xs mb-3">
            <span className="flex items-center gap-1.5 font-semibold text-body">
              <Activity className="w-4 h-4 text-muted" /> 内存占用率
            </span>
            <span className="font-mono text-xl metric-value">{memPercent}%</span>
          </div>
          <div className="w-full bg-raised h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                memPercent > 85 ? 'bg-warning' : 'bg-primary'
              }`}
              style={{ width: `${memPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-muted font-mono truncate">
            {formatBytes(status?.memoryUsed || 0)} / {formatBytes(status?.memoryTotal || 0)}
          </div>
        </div>

        {/* RootFS Storage */}
        <div className="p-5 bg-surface border border-border rounded-2xl shadow-panel flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted text-xs mb-3">
            <span className="flex items-center gap-1.5 font-semibold text-body">
              <HardDrive className="w-4 h-4 text-muted" /> 根存储分区
            </span>
            <span className="font-mono text-xl metric-value">{diskPercent}%</span>
          </div>
          <div className="w-full bg-raised h-2 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${diskPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-muted font-mono truncate">
            {formatBytes(status?.diskUsed || 0)} / {formatBytes(status?.diskTotal || 0)}
          </div>
        </div>

        {/* Uptime */}
        <div className="p-5 bg-surface border border-border rounded-2xl shadow-panel flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted text-xs mb-3">
            <span className="flex items-center gap-1.5 font-semibold text-body">
              <Clock className="w-4 h-4 text-muted" /> 运行时间
            </span>
          </div>
          <div className="text-lg font-semibold text-ink font-mono my-auto">
            {formatUptime(status?.uptime || 0)}
          </div>
        </div>
      </div>

      {/* Guest VMs and Containers Section */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-panel">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-accent" />
            <h3 className="font-semibold text-base text-ink">虚拟机与容器 (Guests)</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-raised text-accent border border-border">
              {guests.length} 个实例
            </span>
          </div>
        </div>

        {guests.length === 0 ? (
          <div className="p-8 text-center text-muted text-xs">
            暂无虚拟机或容器数据（请确保在「设置」中配置了正确的 PVE API Token）
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-body">
              <thead className="bg-inset text-muted text-[11px]">
                <tr>
                  <th className="py-3 px-4 rounded-l-xl">VMID</th>
                  <th className="py-3 px-4">名称</th>
                  <th className="py-3 px-4">类型</th>
                  <th className="py-3 px-4">状态</th>
                  <th className="py-3 px-4">CPU</th>
                  <th className="py-3 px-4">内存占用</th>
                  <th className="py-3 px-4">运行时间</th>
                  <th className="py-3 px-4 text-right rounded-r-xl">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {guests
                  .slice()
                  .sort((a, b) => Number(a.vmid) - Number(b.vmid))
                  .map((g) => {
                  const isRunning = g.status === 'running'
                  const gCpu = Math.round((g.cpu || 0) * 100)
                  return (
                    <tr key={g.vmid} className="hover:bg-raised transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-accent">{g.vmid}</td>
                      <td className="py-3.5 px-4 font-sans font-semibold text-ink">
                        {g.name}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-raised border border-border">
                          {g.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isRunning
                              ? 'bg-success-soft text-success border border-success-border'
                              : 'bg-raised text-muted border border-border'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isRunning ? 'bg-success' : 'bg-muted'
                            }`}
                          />
                          {isRunning ? '运行中' : '已停止'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">{isRunning ? `${gCpu}%` : '-'}</td>
                      <td className="py-3.5 px-4">
                        {isRunning
                          ? `${formatBytes(g.mem || 0)} / ${formatBytes(g.maxmem || 0)}`
                          : '-'}
                      </td>
                      <td className="py-3.5 px-4 font-sans text-muted">
                        {isRunning ? formatUptime(g.uptime || 0) : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isRunning ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setModalError('')
                                  setError('')
                                  setActionSuccess('')
                                  setGuestActionTarget({ guest: g, action: 'reboot' })
                                }}
                                disabled={actionLoading || !isOnline}
                                title={!isOnline ? 'PVE 宿主机离线，无法操作' : '重启实例'}
                                className="flex items-center gap-1 px-2.5 py-1 bg-raised hover:bg-accent-soft text-body hover:text-accent rounded-lg text-[11px] font-medium border border-border hover:border-accent-border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <RotateCcw className="w-3 h-3 text-accent" />
                                <span>重启</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setModalError('')
                                  setError('')
                                  setActionSuccess('')
                                  setGuestActionTarget({ guest: g, action: 'shutdown' })
                                }}
                                disabled={actionLoading || !isOnline}
                                title={!isOnline ? 'PVE 宿主机离线，无法操作' : '安全关机实例'}
                                className="flex items-center gap-1 px-2.5 py-1 bg-raised hover:bg-danger-soft text-body hover:text-danger rounded-lg text-[11px] font-medium border border-border hover:border-danger-border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Power className="w-3 h-3 text-danger" />
                                <span>关机</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setModalError('')
                                setError('')
                                setActionSuccess('')
                                setGuestActionTarget({ guest: g, action: 'start' })
                              }}
                              disabled={actionLoading || !isOnline}
                              title={!isOnline ? 'PVE 宿主机离线，无法操作' : '开机启动实例'}
                              className="flex items-center gap-1 px-3 py-1 bg-success-soft hover:bg-success-soft active:translate-y-px text-success rounded-lg text-[11px] font-semibold border border-success-border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-panel"
                            >
                              <Play className="w-3 h-3" />
                              <span>开机</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
