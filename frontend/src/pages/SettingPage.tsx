import React, { useState, useEffect } from 'react'
import {
  Server,
  Zap,
  KeyRound,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Fingerprint,
  Link,
  Laptop,
} from 'lucide-react'
import { api, User } from '../api/client'

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
  const [pveLoading, setPveLoading] = useState(false)
  const [pveTestSuccess, setPveTestSuccess] = useState('')
  const [pveError, setPveError] = useState('')

  // WOL Configuration State
  const [wolUrl, setWolUrl] = useState('')
  const [wolInsecure, setWolInsecure] = useState(false)
  const [wolConfig, setWolConfig] = useState<{
    configured: boolean
    webhookUrl: string
    insecureSkipVerify?: boolean
    enabled?: boolean
    updatedAt?: string
  } | null>(null)
  const [wolLoading, setWolLoading] = useState(false)
  const [wolSuccess, setWolSuccess] = useState('')
  const [wolError, setWolError] = useState('')

  // Passkey Form State
  const [newPasskeyName, setNewPasskeyName] = useState('')
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyMsg, setPasskeyMsg] = useState('')
  const [passkeyErr, setPasskeyErr] = useState('')

  const loadWolConfig = async () => {
    try {
      const cfg = await api.wol.getConfig()
      setWolConfig(cfg)
      if (cfg.configured) {
        if (cfg.webhookUrl) setWolUrl(cfg.webhookUrl)
        setWolInsecure(cfg.insecureSkipVerify ?? false)
      }
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
        }
      })
      .catch(() => {})

    // Load existing WOL configuration
    loadWolConfig()
  }, [])

  const handleSaveWol = async (e: React.FormEvent) => {
    e.preventDefault()
    setWolLoading(true)
    setWolError('')
    setWolSuccess('')
    try {
      const res = await api.wol.saveConfig({
        webhookUrl: wolUrl,
        insecureSkipVerify: wolInsecure,
      })
      setWolSuccess(res.message || '开机 Webhook 配置已保存')
      setWolConfig({
        configured: true,
        webhookUrl: wolUrl,
        insecureSkipVerify: wolInsecure,
        updatedAt: res.updatedAt,
      })
    } catch (err: any) {
      setWolError(err.message || '保存失败')
    } finally {
      setWolLoading(false)
    }
  }

  const handleDeleteWol = async () => {
    if (!window.confirm('确定要删除已保存的开机 Webhook 配置吗？')) return
    setWolLoading(true)
    setWolError('')
    setWolSuccess('')
    try {
      const res = await api.wol.deleteConfig()
      setWolConfig({ configured: false, webhookUrl: '' })
      setWolUrl('')
      setWolInsecure(false)
      setWolSuccess(res.message || '开机 Webhook 配置已成功删除')
    } catch (err: any) {
      setWolError(err.message || '删除配置失败')
    } finally {
      setWolLoading(false)
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

  // Save PVE Config
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
              配置 PVE 服务器地址与 API Token，控制台将通过此凭证远程读取状态与下发关机指令
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

      {/* 2. Wake-on-LAN Webhook Configuration */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">开机 Webhook 配置 (WOL)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                通过向 OpenWrt 发送 Webhook 请求触发网络唤醒 (Wake-on-LAN) 启动物理宿主机
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
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Webhook 唤醒地址 (URL)
            </label>
            <input
              type="url"
              value={wolUrl}
              onChange={(e) => {
                setWolUrl(e.target.value)
                setWolSuccess('')
                setWolError('')
              }}
              placeholder="http://192.168.1.1:8080/wakeup?mac=aa:bb:cc:dd:ee:ff&token=..."
              required
              className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-800/50 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="wolInsecureTLS"
                checked={wolInsecure}
                onChange={(e) => setWolInsecure(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="wolInsecureTLS" className="text-xs text-slate-300 cursor-pointer">
                允许自签名证书 (Insecure TLS，用于 HTTPS 自签名证书)
              </label>
            </div>
          </div>

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
              className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {wolLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>保存 Webhook 配置</span>
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
            <h3 className="text-lg font-bold text-white">Passkey 生物识别与安全管理</h3>
            <p className="text-xs text-slate-400">
              管理已授权的 Touch ID、Face ID 或硬件安全密钥凭证
            </p>
          </div>
        </div>

        {passkeyErr && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
            {passkeyErr}
          </div>
        )}

        {passkeyMsg && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs">
            {passkeyMsg}
          </div>
        )}

        {/* Existing Passkeys List */}
        <div className="space-y-2.5 mb-6">
          <label className="block text-xs font-semibold text-slate-300">已绑定的设备凭证</label>
          {!user?.passkeys || user.passkeys.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 text-center">
              <p className="text-xs text-slate-400">尚未绑定任何 Passkey 凭证</p>
            </div>
          ) : (
            user.passkeys.map((pk) => (
              <div
                key={pk.id}
                className="flex items-center justify-between p-3.5 bg-slate-800/60 border border-slate-700 rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-700/60 text-cyan-400">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-200">{pk.deviceName}</div>
                    <div className="text-[11px] text-slate-400">
                      创建时间: {new Date(pk.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePasskey(pk.id)}
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                  title="删除此凭证"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Enroll New Passkey */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <label className="block text-xs font-semibold text-slate-300">为当前设备新增凭证</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPasskeyName}
              onChange={(e) => setNewPasskeyName(e.target.value)}
              placeholder="设备备注 (例如 iPhone Face ID)"
              className="flex-1 px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleEnrollPasskey}
              disabled={passkeyLoading}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{passkeyLoading ? '等待验证...' : '绑定当前设备'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
