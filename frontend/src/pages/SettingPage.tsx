import React, { useState, useEffect } from 'react'
import {
  Server,
  Zap,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Fingerprint,
} from 'lucide-react'
import { api, User, WOLDevice, WOLConfig } from '../api/client'

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
  const [wakeUrl, setWakeUrl] = useState('')
  const [statusUrl, setStatusUrl] = useState('')
  const [wolTlsSkipVerify, setWolTlsSkipVerify] = useState(false)
  const [wolConfig, setWolConfig] = useState<WOLConfig | null>(null)
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
      setWakeUrl(cfg.wakeUrl ?? '')
      setStatusUrl(cfg.statusUrl ?? '')
      setWolTlsSkipVerify(cfg.tlsSkipVerify ?? false)
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
    setWolError('')
    setWolSuccess('')

    const urls = { wakeUrl: wakeUrl.trim(), statusUrl: statusUrl.trim() }
    for (const [label, value] of [
      ['唤醒 URL', urls.wakeUrl],
      ['在线检测 URL', urls.statusUrl],
    ]) {
      try {
        if (!/^https?:\/\/[^\s/\\?#]+/i.test(value) || /[\s\\]/.test(value)) {
          throw new Error('invalid URL')
        }
        const url = new URL(value.replace(/\{mac\}/g, '00:11:22:33:44:55'))
        if (!url.hostname || !['http:', 'https:'].includes(url.protocol)) {
          throw new Error('invalid URL')
        }
      } catch {
        setWolError(`${label} 必须是以 http:// 或 https:// 开头的完整 URL`)
        return
      }
      if (!value.includes('{mac}')) {
        setWolError(`${label} 必须包含 {mac} 占位符`)
        return
      }
    }

    setWolLoading(true)
    try {
      const res = await api.wol.saveConfig({ ...urls, tlsSkipVerify: wolTlsSkipVerify })
      setWolSuccess(res.message || 'WOL Control 配置已成功保存')
      setWolConfig(res)
      setWakeUrl(res.wakeUrl ?? '')
      setStatusUrl(res.statusUrl ?? '')
      setWolTlsSkipVerify(res.tlsSkipVerify ?? false)
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
      setWakeUrl('')
      setStatusUrl('')
      setWolTlsSkipVerify(false)
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
                配置局域网唤醒与在线检测的 GET Webhook URL
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
            <label htmlFor="wolWakeUrl" className="block text-xs font-semibold text-slate-300 mb-1.5">
              唤醒 URL <span className="text-rose-400">*</span>
            </label>
            <input
              id="wolWakeUrl"
              type="text"
              value={wakeUrl}
              onChange={(e) => {
                setWakeUrl(e.target.value)
                setWolSuccess('')
                setWolError('')
              }}
              placeholder="http://router.lan:57820/wakeup?token=YOUR_TOKEN&mac={mac}"
              required
              className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          <div>
            <label htmlFor="wolStatusUrl" className="block text-xs font-semibold text-slate-300 mb-1.5">
              在线检测 URL <span className="text-rose-400">*</span>
            </label>
            <input
              id="wolStatusUrl"
              type="text"
              value={statusUrl}
              onChange={(e) => {
                setStatusUrl(e.target.value)
                setWolSuccess('')
                setWolError('')
              }}
              placeholder="http://router.lan:57820/wakeup?token=YOUR_TOKEN&checkOnline={mac}"
              required
              className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 p-3.5 bg-slate-800/50 rounded-2xl border border-slate-800">
            <input
              type="checkbox"
              id="wolTlsSkipVerify"
              checked={wolTlsSkipVerify}
              onChange={(e) => {
                setWolTlsSkipVerify(e.target.checked)
                setWolSuccess('')
                setWolError('')
              }}
              className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="wolTlsSkipVerify" className="text-xs text-slate-300 cursor-pointer">
              允许跳过 TLS 证书校验（用于自签名证书，对两个 HTTPS Webhook 均生效）
            </label>
          </div>

          <div className="space-y-1.5 p-3.5 bg-slate-800/50 rounded-2xl border border-slate-800 text-xs text-slate-400">
            <p>
              两个 Webhook 均使用 GET 请求，每项填写一个完整的 HTTP/HTTPS URL，必须包含{' '}
              <code className="text-amber-400">{'{mac}'}</code> 占位符，后端会将其替换为设备的 MAC 地址。
              是否使用 TLS 由 URL 协议决定。
            </p>
            <p>
              在线检测接口应返回 JSON：<code className="text-slate-300">{'{"success":true,"online":true}'}</code>，
              <code className="text-slate-300">online</code> 为 <code className="text-slate-300">false</code> 表示离线。
            </p>
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
