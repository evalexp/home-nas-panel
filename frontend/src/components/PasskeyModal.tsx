import React, { useState } from 'react'
import { X, KeyRound, Plus, Trash2, Fingerprint, Smartphone, Laptop, Check } from 'lucide-react'
import { api, User } from '../api/client'

interface PasskeyModalProps {
  isOpen: boolean
  onClose: () => void
  user: User | null
  onRefreshUser: () => Promise<void>
}

export const PasskeyModal: React.FC<PasskeyModalProps> = ({
  isOpen,
  onClose,
  user,
  onRefreshUser,
}) => {
  const [deviceName, setDeviceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen) return null

  const handleRegisterPasskey = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const name = deviceName.trim() || navigator.userAgent.includes('Mac') ? 'MacBook / Touch ID' : '当前设备 Passkey'
      await api.auth.passkeyRegister(name)
      setSuccess('Passkey 绑定成功！您现在可以使用生物识别一键登录')
      setDeviceName('')
      await onRefreshUser()
    } catch (err: any) {
      setError(err.message || 'Passkey 绑定失败或被用户取消')
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePasskey = async (id: number) => {
    if (!confirm('确定要移除此 Passkey 凭证吗？')) return

    try {
      await api.auth.deletePasskey(id)
      await onRefreshUser()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-2xl">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Passkey 凭证管理</h2>
            <p className="text-xs text-slate-400">使用 Touch ID、Face ID 或安全密钥免密安全登录</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{success}</span>
          </div>
        )}

        {/* Existing Passkeys List */}
        <div className="mt-5 space-y-2.5">
          <label className="block text-xs font-semibold text-slate-300">已绑定的设备凭证</label>
          {(!user?.passkeys || user.passkeys.length === 0) ? (
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 text-center">
              <KeyRound className="w-6 h-6 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400">尚未绑定任何 Passkey 设备凭证</p>
              <p className="text-[11px] text-slate-500 mt-1">推荐立即绑定，享受指纹/面容秒速开门体验</p>
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
                    <div className="text-sm font-medium text-slate-200">{pk.deviceName}</div>
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
        <div className="mt-6 pt-5 border-t border-slate-800 space-y-3">
          <label className="block text-xs font-semibold text-slate-300">绑定当前设备</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="设备备注名称 (例如 我的 iPhone / MacBook)"
              className="flex-1 px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleRegisterPasskey}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm rounded-xl transition-all shadow-md shadow-cyan-500/20 active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{loading ? '等待验证...' : '立即绑定'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            点击后系统将调用系统原生的 Touch ID / Face ID 或 Windows Hello 鉴权流程。
          </p>
        </div>
      </div>
    </div>
  )
}
