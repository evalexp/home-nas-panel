import React, { useState, useEffect } from 'react'
import {
  Server,
  Zap,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  Code2,
  RotateCcw,
} from 'lucide-react'
import { api, User, WOLDevice, WOLConfig } from '../api/client'
import { WOLPacketTemplateSection } from '../components/WOLPacketTemplateSection'

interface SettingPageProps {
  user: User | null
  onRefreshUser: () => Promise<void>
}

export const SettingPage: React.FC<SettingPageProps> = ({ user, onRefreshUser }) => {
  // PVE Form State
  const [pveEndpoint, setPveEndpoint] = useState('https://192.168.1.100:8006')
  const [pveTokenId, setPveTokenId] = useState('root@pam!nas-panel')
  const [pveTokenSecret, setPveTokenSecret] = useState('')
  const [detectedNode, setDetectedNode] = useState('')
  const [pveInsecure, setPveInsecure] = useState(true)
  const [pveWolDeviceId, setPveWolDeviceId] = useState<number | null>(null)
  const [pveLoading, setPveLoading] = useState(false)
  const [pveTestSuccess, setPveTestSuccess] = useState('')
  const [pveError, setPveError] = useState('')

  // WOL Devices (for PVE binding selection)
  const [wolDevices, setWolDevices] = useState<WOLDevice[]>([])

  // WOL Control Configuration State
  const [wolHost, setWolHost] = useState('192.168.1.1')
  const [wolPort, setWolPort] = useState<number>(80)
  const [wolUseTls, setWolUseTls] = useState(false)
  const [wolTlsSkipVerify, setWolTlsSkipVerify] = useState(false)
  const [wolPacketTemplate, setWolPacketTemplate] = useState('')
  const [wolConfig, setWolConfig] = useState<WOLConfig | null>(null)
  const [wolLoading, setWolLoading] = useState(false)
  const [wolSuccess, setWolSuccess] = useState('')
  const [wolError, setWolError] = useState('')

  // Passkey Form State
  const [newPasskeyName, setNewPasskeyName] = useState('')
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyMsg, setPasskeyMsg] = useState('')
  const [passkeyErr, setPasskeyErr] = useState('')

  const generateDefaultTemplate = (host: string, port: number, useTls: boolean) => {
    const h = host.trim() || '192.168.1.1'
    const p = port || (useTls ? 443 : 80)
    const hostHeader = (!useTls && p === 80) || (useTls && p === 443) ? h : `${h}:${p}`
    return `GET /wakeup?token=REPLACE_YOUR_TOKEN_HERE&mac={mac} HTTP/1.1\r\nHost: ${hostHeader}\r\nUser-Agent: HomeNASPanel-WOL/1.0\r\nConnection: close\r\n\r\n`
  }

  const loadWolConfig = async () => {
    try {
      const cfg = await api.wol.getConfig()
      setWolConfig(cfg)
      if (cfg.configured) {
        if (cfg.host) setWolHost(cfg.host)
        if (cfg.port) setWolPort(cfg.port)
        setWolUseTls(cfg.useTls ?? false)
        setWolTlsSkipVerify(cfg.tlsSkipVerify ?? false)
        if (cfg.packetTemplate) setWolPacketTemplate(cfg.packetTemplate)
      } else {
        if (!wolPacketTemplate) {
          setWolPacketTemplate(generateDefaultTemplate('192.168.1.1', 80, false))
        }
      }
    } catch {}
  }

  const loadWolDevices = async () => {
    try {
      const devs = await api.wol.getDevices()
      setWolDevices(devs || [])
    } catch {}
  }

  useEffect(() => {
    // Load existing PVE configuration
    api.pve
      .getConfig()
      .then((cfg) => {
        if (cfg.configured) {
          setPveEndpoint(cfg.endpoint || '')
          setPveTokenId(cfg.tokenId || '')
          setDetectedNode(cfg.defaultNode || '')
          setPveInsecure(cfg.insecureSkipVerify ?? true)
          setPveWolDeviceId(cfg.wolDeviceId ?? null)
        }
      })
      .catch(() => {})

    // Load WOL configuration and devices
    loadWolConfig()
    loadWolDevices()
  }, [])

  const handleSavePVE = async (e: React.FormEvent) => {
    e.preventDefault()
    setPveLoading(true)
    setPveError('')
    setPveTestSuccess('')
    try {
      const res = await api.pve.saveConfig({
        endpoint: pveEndpoint,
        tokenId: pveTokenId,
        tokenSecret: pveTokenSecret,
        insecureSkipVerify: pveInsecure,
        wolDeviceId: pveWolDeviceId,
        enabled: true,
      })
      if (res.detectedNode) {
        setDetectedNode(res.detectedNode)
      }
      setPveTestSuccess(`✅ PVE 配置已成功保存！自动绑定主节点: ${res.detectedNode || 'pve'}`)
    } catch (err: any) {
      setPveError(err.message || '保存配置失败')
    } finally {
      setPveLoading(false)
    }
  }

  // Test PVE Connection
  const handleTestPVE = async () => {
    setPveLoading(true)
    setPveError('')
    setPveTestSuccess('')
    try {
      const res = await api.pve.testConnection({
        endpoint: pveEndpoint,
        tokenId: pveTokenId,
        tokenSecret: pveTokenSecret,
        insecureSkipVerify: pveInsecure,
      })
      if (res.detectedNode) {
        setDetectedNode(res.detectedNode)
      }
      setPveTestSuccess(`✅ PVE 连接成功！API 自动识别主节点: ${res.detectedNode || 'pve'}`)
    } catch (err: any) {
      setPveError(err.message || 'PVE 连接测试失败，请检查地址或 Token')
    } finally {
      setPveLoading(false)
    }
  }

  // Save WOL Control configuration
  const handleSaveWol = async (e: React.FormEvent) => {
    e.preventDefault()
    setWolLoading(true)
    setWolError('')
    setWolSuccess('')

    const host = wolHost.trim()
    if (!host) {
      setWolError('请输入有效的域名或 IP 地址')
      setWolLoading(false)
      return
    }

    const templateToSave = wolPacketTemplate.length > 0 ? wolPacketTemplate : generateDefaultTemplate(host, wolPort, wolUseTls)

    try {
      const res = await api.wol.saveConfig({
        host: host,
        port: Number(wolPort) || (wolUseTls ? 443 : 80),
        useTls: wolUseTls,
        tlsSkipVerify: wolTlsSkipVerify,
        packetTemplate: templateToSave,
      })
      setWolSuccess(res.message || 'WOL Control 配置已成功保存')
      setWolConfig({
        configured: true,
        host: host,
        port: Number(wolPort) || (wolUseTls ? 443 : 80),
        useTls: wolUseTls,
        tlsSkipVerify: wolTlsSkipVerify,
        packetTemplate: templateToSave,
        updatedAt: res.updatedAt,
      })
      setWolPacketTemplate(templateToSave)
    } catch (err: any) {
      setWolError(err.message || '保存 WOL 配置失败')
    } finally {
      setWolLoading(false)
    }
  }

  // Delete WOL Control configuration
  const handleDeleteWol = async () => {
    if (!window.confirm('确定要删除已保存的 WOL Control 配置吗？')) return
    setWolLoading(true)
    setWolError('')
    setWolSuccess('')
    try {
      const res = await api.wol.deleteConfig()
      setWolConfig({ configured: false })
      setWolHost('192.168.1.1')
      setWolPort(80)
      setWolUseTls(false)
      setWolTlsSkipVerify(false)
      setWolPacketTemplate(generateDefaultTemplate('192.168.1.1', 80, false))
      setWolSuccess(res.message || 'WOL Control 配置已成功删除')
    } catch (err: any) {
      setWolError(err.message || '删除配置失败')
    } finally {
      setWolLoading(false)
    }
  }

  // Passkey enrollment
  const handleEnrollPasskey = async () => {
    setPasskeyLoading(true)
    setPasskeyErr('')
    setPasskeyMsg('')
    try {
      const name =
        newPasskeyName.trim() ||
        (navigator.userAgent.includes('Mac') ? 'MacBook Touch ID' : '我的设备 Passkey')
      await api.auth.passkeyRegister(name)
      setPasskeyMsg('Passkey 绑定成功！您现在可以使用生物识别一键登录')
      setNewPasskeyName('')
      await onRefreshUser()
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setPasskeyErr('已取消生物识别验证或操作超时')
      } else {
        setPasskeyErr(err.message || 'Passkey 绑定失败或被用户取消')
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleDeletePasskey = async (id: number) => {
    if (!confirm('确定删除此 Passkey 凭证？')) return
    try {
      await api.auth.deletePasskey(id)
      await onRefreshUser()
    } catch (err: any) {
      setPasskeyErr(err.message || '删除失败')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* 1. PVE API Token Configuration */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Proxmox VE (PVE) 节点配置</h3>
            <p className="text-xs text-slate-400">
              配置 PVE 服务器地址与 API Token，控制台将通过此凭证远程读取状态与下发指令
            </p>
          </div>
        </div>

        {pveError && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{pveError}</span>
          </div>
        )}

        {pveTestSuccess && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{pveTestSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSavePVE} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              PVE 服务地址 (Endpoint，含端口 8006)
            </label>
            <input
              type="text"
              value={pveEndpoint}
              onChange={(e) => setPveEndpoint(e.target.value)}
              placeholder="https://192.168.1.100:8006"
              required
              className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                API Token ID (格式: 用户@域!标识符)
              </label>
              <input
                type="text"
                value={pveTokenId}
                onChange={(e) => setPveTokenId(e.target.value)}
                placeholder="root@pam!nas-panel"
                required
                className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Token Secret (UUID 密匙)
              </label>
              <input
                type="password"
                value={pveTokenSecret}
                onChange={(e) => setPveTokenSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••"
                className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Bound WOL Device Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              WOL 绑定设备 (唤醒 PVE 宿主机所使用的 MAC 地址)
            </label>
            <select
              value={pveWolDeviceId ?? ''}
              onChange={(e) => setPveWolDeviceId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
            >
              <option value="">未绑定设备 (请在 WOL 设备中选择)</option>
              {wolDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.mac})
                </option>
              ))}
            </select>
            {wolDevices.length === 0 ? (
              <p className="text-[11px] text-amber-400 mt-1">
                暂无可绑定的 WOL 设备，请在「WOL Control」页面中先添加机器。
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">
                设置绑定后，PVE 状态页的“开机 (WOL)”将直接下发此设备的物理 MAC 地址进行网络唤醒。
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-800/50 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pveInsecureSSL"
                checked={pveInsecure}
                onChange={(e) => setPveInsecure(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="pveInsecureSSL" className="text-xs text-slate-300 cursor-pointer">
                允许自签名证书 (Insecure TLS，PVE 默认自签推荐勾选)
              </label>
            </div>

            {detectedNode && (
              <div className="text-xs text-cyan-400 font-mono flex items-center gap-1.5">
                <span className="text-slate-400 font-sans">API 自动识别主节点:</span>
                <span className="font-bold px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  {detectedNode}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleTestPVE}
              disabled={pveLoading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              测试连接
            </button>
            <button
              type="submit"
              disabled={pveLoading}
              className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
            >
              保存 PVE 配置
            </button>
          </div>
        </form>
      </div>

      {/* 2. WOL Control Configuration (Wake-on-LAN) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">WOL Control 配置 (Wake-on-LAN)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                配置局域网网络唤醒控制网关的通信参数与 HTTP 报文模板
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                wolConfig?.configured
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  wolConfig?.configured ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              {wolConfig?.configured ? '已配置' : '未配置'}
            </span>
          </div>
        </div>

        {wolError && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{wolError}</span>
          </div>
        )}

        {wolSuccess && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{wolSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSaveWol} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                域名或 IP 地址 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={wolHost}
                onChange={(e) => {
                  setWolHost(e.target.value)
                  setWolSuccess('')
                  setWolError('')
                }}
                placeholder="例如: 192.168.1.1 或 router.lan"
                required
                className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                端口 <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={wolPort}
                onChange={(e) => setWolPort(Number(e.target.value))}
                placeholder="80"
                required
                min={1}
                max={65535}
                className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-800/50 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="wolUseTLS"
                checked={wolUseTls}
                onChange={(e) => {
                  const checked = e.target.checked
                  setWolUseTls(checked)
                  if (checked && wolPort === 80) {
                    setWolPort(443)
                  } else if (!checked && wolPort === 443) {
                    setWolPort(80)
                  }
                }}
                className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="wolUseTLS" className="text-xs text-slate-300 cursor-pointer">
                启用 TLS 加密连接 (HTTPS)
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="wolTlsSkipVerify"
                checked={wolTlsSkipVerify}
                onChange={(e) => setWolTlsSkipVerify(e.target.checked)}
                disabled={!wolUseTls}
                className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer disabled:opacity-40"
              />
              <label
                htmlFor="wolTlsSkipVerify"
                className={`text-xs cursor-pointer ${
                  wolUseTls ? 'text-slate-300' : 'text-slate-500 cursor-not-allowed'
                }`}
              >
                启用 TLS 时跳过证书检验 (允许自签名证书)
              </label>
            </div>
          </div>

          {/* WOL Packet Template Upload & Visualizer Section */}
          <WOLPacketTemplateSection
            value={wolPacketTemplate}
            onChange={setWolPacketTemplate}
            host={wolHost}
            port={Number(wolPort) || (wolUseTls ? 443 : 80)}
            useTls={wolUseTls}
            onResetDefault={() =>
              setWolPacketTemplate(generateDefaultTemplate(wolHost, wolPort, wolUseTls))
            }
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            {wolConfig?.configured && (
              <button
                type="button"
                onClick={handleDeleteWol}
                disabled={wolLoading}
                className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 rounded-xl text-xs font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>删除配置</span>
              </button>
            )}
            <button
              type="submit"
              disabled={wolLoading}
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {wolLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>保存 WOL 配置</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3. Passkey & Security */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">通行密钥 (Passkey) 管理</h3>
            <p className="text-xs text-slate-400">
              通过系统级生物识别（Touch ID、Face ID 或 Windows Hello）安全无密登录控制面板
            </p>
          </div>
        </div>

        {passkeyErr && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{passkeyErr}</span>
          </div>
        )}

        {passkeyMsg && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{passkeyMsg}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newPasskeyName}
              onChange={(e) => setNewPasskeyName(e.target.value)}
              placeholder="自定义凭证名称 (例如: MacBook Pro 指纹)"
              className="flex-1 px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleEnrollPasskey}
              disabled={passkeyLoading}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4" />
              <span>{passkeyLoading ? '正在唤起验证...' : '注册新 Passkey'}</span>
            </button>
          </div>

          {/* Bound Passkeys List */}
          <div className="pt-4 border-t border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-400 mb-3">已绑定的通行密钥</h4>
            {user?.passkeys && user.passkeys.length > 0 ? (
              <div className="space-y-2.5">
                {user.passkeys.map((pk) => (
                  <div
                    key={pk.id}
                    className="flex items-center justify-between p-3.5 bg-slate-800/40 border border-slate-800 rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                        <Fingerprint className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{pk.deviceName}</div>
                        <div className="text-[10px] text-slate-500">
                          注册时间: {new Date(pk.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeletePasskey(pk.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      title="删除此凭证"
                      aria-label="删除此凭证"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 p-4 bg-slate-800/20 rounded-2xl text-center border border-slate-800/40">
                尚未绑定通行密钥，建议添加当前设备以便快捷登录
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
