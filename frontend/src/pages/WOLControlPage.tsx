import React, { useState, useEffect } from 'react'
import {
  Zap,
  Plus,
  Server,
  RefreshCw,
  Trash2,
  Edit2,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle,
  X,
  ExternalLink,
  Laptop,
  Info,
} from 'lucide-react'
import { api, WOLDevice, WOLConfig } from '../api/client'

interface WOLControlPageProps {
  onNavigateToSetting?: () => void
}

export const WOLControlPage: React.FC<WOLControlPageProps> = ({ onNavigateToSetting }) => {
  const [devices, setDevices] = useState<WOLDevice[]>([])
  const [wolConfig, setWolConfig] = useState<WOLConfig | null>(null)
  const [pveBoundId, setPveBoundId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<WOLDevice | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [deviceMac, setDeviceMac] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Wake action state per device ID
  const [wakingId, setWakingId] = useState<number | null>(null)

  // Copy state
  const [copiedMac, setCopiedMac] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const [devList, cfg, pveCfg] = await Promise.all([
        api.wol.getDevices(),
        api.wol.getConfig(),
        api.pve.getConfig().catch(() => null),
      ])
      const sorted = (devList || []).slice().sort((a, b) => a.id - b.id)
      setDevices(sorted)
      setWolConfig(cfg)
      if (pveCfg && pveCfg.wolDeviceId) {
        setPveBoundId(pveCfg.wolDeviceId)
      } else {
        setPveBoundId(null)
      }
    } catch (err: any) {
      setError(err.message || '加载 WOL 设备列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleOpenAddModal = () => {
    setEditingDevice(null)
    setDeviceName('')
    setDeviceMac('')
    setFormError('')
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (device: WOLDevice) => {
    setEditingDevice(device)
    setDeviceName(device.name)
    setDeviceMac(device.mac)
    setFormError('')
    setIsModalOpen(true)
  }

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const trimmedName = deviceName.trim()
    const trimmedMac = deviceMac.trim()

    if (!trimmedName) {
      setFormError('请输入机器名称')
      return
    }

    // Basic MAC address validation (supports colons or dashes)
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    if (!macRegex.test(trimmedMac)) {
      setFormError('MAC 地址格式不正确，示例: AA:BB:CC:DD:EE:FF 或 00-11-22-33-44-55')
      return
    }

    setSubmitting(true)
    try {
      if (editingDevice) {
        await api.wol.updateDevice(editingDevice.id, {
          name: trimmedName,
          mac: trimmedMac,
        })
        setSuccessMsg(`设备「${trimmedName}」已成功更新`)
      } else {
        await api.wol.createDevice({
          name: trimmedName,
          mac: trimmedMac,
        })
        setSuccessMsg(`设备「${trimmedName}」添加成功`)
      }
      setIsModalOpen(false)
      await fetchData()
    } catch (err: any) {
      setFormError(err.message || '保存设备失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteDevice = async (device: WOLDevice) => {
    if (!confirm(`确定删除设备「${device.name}」吗？`)) return
    try {
      await api.wol.deleteDevice(device.id)
      setSuccessMsg(`设备「${device.name}」已删除`)
      await fetchData()
    } catch (err: any) {
      setError(err.message || '删除设备失败')
    }
  }

  const handleWakeDevice = async (device: WOLDevice) => {
    setWakingId(device.id)
    setError('')
    setSuccessMsg('')
    try {
      const res = await api.wol.wakeDevice(device.id)
      setSuccessMsg(res.message || `已向设备「${device.name}」(${device.mac}) 发送唤醒指令！`)
    } catch (err: any) {
      setError(err.message || `唤醒设备「${device.name}」失败`)
    } finally {
      setWakingId(null)
    }
  }

  const handleCopyMac = (mac: string) => {
    navigator.clipboard.writeText(mac)
    setCopiedMac(mac)
    setTimeout(() => setCopiedMac(null), 2000)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d
        .toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        .replace(/\//g, '-')
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white tracking-tight">WOL 控制 (Wake-on-LAN)</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                局域网网络唤醒
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                共 {devices.length} 台设备
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              管理与远程唤醒局域网内的物理主机，通过自定义 HTTP 报文向目标设备下发唤醒指令
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="刷新列表"
            aria-label="刷新列表"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新增设备</span>
          </button>
        </div>
      </div>

      {/* Unconfigured Alert Banner */}
      {wolConfig && !wolConfig.configured && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
            <span>
              尚未配置 WOL 控制参数。在唤醒设备前，请前往系统设置配置局域网控制网关与报文模板。
            </span>
          </div>
          {onNavigateToSetting && (
            <button
              onClick={onNavigateToSetting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded-xl text-xs font-semibold self-start sm:self-auto cursor-pointer transition-colors"
            >
              <span>前往系统设置</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg('')}
            className="text-emerald-400/70 hover:text-emerald-300 p-1 cursor-pointer transition-colors"
            aria-label="关闭提示"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="text-rose-400/70 hover:text-rose-300 p-1 cursor-pointer transition-colors"
            aria-label="关闭提示"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table Container or Empty State */}
      {devices.length === 0 && !loading ? (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-500">
            <Laptop className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">暂无 WOL 设备</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              添加您的第一台支持网络唤醒的物理设备（如 PVE 宿主机、NAS、工作站等），即可实现一键开机唤醒。
            </p>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer shadow-lg shadow-amber-500/20 mt-2"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>添加第一台设备</span>
          </button>
        </div>
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
          {/* Card Top Information */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <Server className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-base text-white tracking-tight">受控物理设备列表</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-amber-400 border border-slate-700">
                {devices.length} 台
              </span>
            </div>

            {wolConfig?.configured && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400">唤醒网关:</span>
                <span className="font-mono text-slate-200">
                  {wolConfig.host}:{wolConfig.port}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-cyan-300">
                  {wolConfig.useTls ? 'TLS' : 'TCP'}
                </span>
              </div>
            )}
          </div>

          {/* Desktop Table View (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4 rounded-l-xl w-16 text-center">ID</th>
                  <th className="py-3 px-4">机器名称</th>
                  <th className="py-3 px-4">物理 MAC 地址</th>
                  <th className="py-3 px-4">创建时间</th>
                  <th className="py-3 px-4 text-right rounded-r-xl">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {devices.map((device) => {
                  const isPveBound = pveBoundId === device.id
                  const isWaking = wakingId === device.id

                  return (
                    <tr
                      key={device.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Hardware Device ID */}
                      <td className="py-4 px-4 text-center font-mono text-cyan-400 font-bold text-xs">
                        #{device.id}
                      </td>

                      {/* Machine Name */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                            <Server className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm tracking-tight">
                                {device.name}
                              </span>
                              {isPveBound && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                  PVE 绑定宿主机
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500">
                              局域网受控设备
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* MAC Address */}
                      <td className="py-4 px-4">
                        <div className="inline-flex items-center gap-2 bg-slate-950/70 border border-slate-800/80 px-3 py-1.5 rounded-xl group/mac">
                          <span className="font-mono font-bold text-cyan-300 text-xs tracking-wider">
                            {device.mac}
                          </span>
                          <button
                            onClick={() => handleCopyMac(device.mac)}
                            className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                            title="复制 MAC 地址"
                            aria-label="复制 MAC 地址"
                          >
                            {copiedMac === device.mac ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Created Time */}
                      <td className="py-4 px-4 font-mono text-slate-400 text-xs">
                        {formatDate(device.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleWakeDevice(device)}
                            disabled={isWaking || !wolConfig?.configured}
                            title={
                              !wolConfig?.configured
                                ? '需先在设置中配置 WOL 控制参数'
                                : `向 ${device.name} 发送唤醒指令`
                            }
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isWaking ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                            ) : (
                              <Zap className="w-3.5 h-3.5 fill-emerald-400/20" />
                            )}
                            <span>{isWaking ? '唤醒中...' : '开机唤醒'}</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(device)}
                            className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-xl border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
                            title="编辑设备"
                            aria-label="编辑设备"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteDevice(device)}
                            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer"
                            title="删除设备"
                            aria-label="删除设备"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (< sm) */}
          <div className="block sm:hidden divide-y divide-slate-800/80">
            {devices.map((device) => {
              const isPveBound = pveBoundId === device.id
              const isWaking = wakingId === device.id

              return (
                <div key={device.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{device.name}</h4>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-slate-800 text-cyan-400 border border-slate-700">
                            #{device.id}
                          </span>
                          {isPveBound && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              PVE 宿主机
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          添加于: {formatDate(device.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(device)}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="编辑设备"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDevice(device)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="删除设备"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* MAC Box */}
                  <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 px-3 py-2 rounded-xl">
                    <span className="font-mono text-xs text-cyan-300 font-bold tracking-wide">
                      {device.mac}
                    </span>
                    <button
                      onClick={() => handleCopyMac(device.mac)}
                      className="text-slate-400 hover:text-white p-1 cursor-pointer"
                      title="复制 MAC 地址"
                    >
                      {copiedMac === device.mac ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Wake Action */}
                  <button
                    onClick={() => handleWakeDevice(device)}
                    disabled={isWaking || !wolConfig?.configured}
                    title={
                      !wolConfig?.configured
                        ? '需先在设置中配置 WOL 控制参数'
                        : `向 ${device.name} 发送唤醒指令`
                    }
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isWaking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 fill-emerald-400/20" />
                    )}
                    <span>{isWaking ? '正在唤醒...' : '开机唤醒 (Wake)'}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Guidelines / Tips Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 sm:p-6 shadow-lg">
        <div className="flex items-center gap-2.5 mb-3 text-slate-300 font-semibold text-xs sm:text-sm">
          <Info className="w-4 h-4 text-amber-400" />
          <span>网络唤醒使用指南与排查提示</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs text-slate-400 leading-relaxed">
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
            <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              BIOS / UEFI 唤醒支持
            </div>
            <p className="text-[11px] text-slate-400">
              目标物理主机需在 BIOS 中开启「Wake on LAN」、「PCI-E 设备唤醒」或「ACPI 网络开机」，并接通电源与物理有线网线。
            </p>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
            <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              操作系统网卡配置
            </div>
            <p className="text-[11px] text-slate-400">
              Windows 系统需在网卡高级属性中勾选「允许此设备唤醒计算机」，并关闭系统的「快速启动」功能以保证关机后网卡保持微电待机。
            </p>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4">
            <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              网关报文转发
            </div>
            <p className="text-[11px] text-slate-400">
              面板通过您在系统设置中配置的局域网控制网关或路由器转发唤醒报文，报文中的{' '}
              <code className="text-cyan-300 font-mono">&#123;mac&#125;</code>{' '}
              会自动替换为目标设备的物理 MAC 地址。
            </p>
          </div>
        </div>
      </div>

      {/* Add / Edit Device Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => !submitting && setIsModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl animate-in zoom-in-95 duration-200 z-10">
            <button
              onClick={() => !submitting && setIsModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              aria-label="关闭窗口"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingDevice ? '编辑 WOL 设备' : '新增 WOL 设备'}
                </h3>
                <p className="text-xs text-slate-400">
                  设置机器名称与网卡物理 MAC 地址以支持网络唤醒
                </p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveDevice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  机器名称 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="例如: PVE 宿主机 / 客厅 NAS / 主力工作站"
                  required
                  className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  机器 MAC 地址 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={deviceMac}
                  onChange={(e) => setDeviceMac(e.target.value)}
                  placeholder="例如: 00:11:22:33:44:55 或 AA-BB-CC-DD-EE-FF"
                  required
                  className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 font-mono tracking-wider transition-colors"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  12 位十六进制物理地址，支持冒号或短横线分隔
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingDevice ? '保存修改' : '确认添加'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
