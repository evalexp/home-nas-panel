import React, { useState, useEffect } from 'react'
import {
  Server,
  Fingerprint,
  Lock,
  User as UserIcon,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  KeyRound,
  AlertCircle,
} from 'lucide-react'
import { api, setToken, User } from '../api/client'

interface LoginPageProps {
  onLoginSuccess: (user: User) => void
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [mode, setMode] = useState<'passkey' | 'password'>('passkey')

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState('')
  const [guideRegisterPasskey, setGuideRegisterPasskey] = useState(false)

  // Check initial system status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.auth.getStatus()
        setIsInitialized(res.initialized)
        setHasPasskey(res.hasPasskey)
        if (!res.hasPasskey) {
          setMode('password')
        }
      } catch (err: any) {
        setError('无法连接到 NAS 面板后台服务，请检查网络')
      }
    }
    checkStatus()
  }, [])

  // Passkey Login flow
  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true)
    setError('')
    try {
      const res = await api.auth.passkeyLogin(username || undefined)
      setToken(res.token)
      onLoginSuccess(res.user)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('已取消 Passkey 验证或操作超时')
      } else {
        setError(err.message || 'Passkey 验证失败或已取消')
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  // Password Login / Register flow
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!isInitialized) {
        // First-time setup
        if (password !== confirmPassword) {
          throw new Error('两次输入的密码不一致')
        }
        if (password.length < 6) {
          throw new Error('密码长度不能少于 6 位')
        }
        const res = await api.auth.register(username, password)
        setToken(res.token)
        setIsInitialized(true)
        setGuideRegisterPasskey(true)
        // Prompt to register passkey right now
      } else {
        // Password login
        const res = await api.auth.login(username, password)
        setToken(res.token)
        onLoginSuccess(res.user)
      }
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  // Wizard prompt after initial registration
  const handleRegisterPasskeyNow = async () => {
    setPasskeyLoading(true)
    try {
      const name = navigator.userAgent.includes('Mac') ? 'MacBook Touch ID' : '管理员设备 Passkey'
      await api.auth.passkeyRegister(name)
      const me = await api.auth.me()
      onLoginSuccess(me)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('已取消生物识别验证或操作超时')
      } else {
        setError(err.message || 'Passkey 绑定失败')
      }
      // fallback proceed
      const me = await api.auth.me()
      onLoginSuccess(me)
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 animate-in fade-in duration-300">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/25 mb-4">
            <Server className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Home NAS Panel</h1>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Wizard: Register Passkey right after initial admin creation */}
        {guideRegisterPasskey ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
              <Fingerprint className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">管理员创建成功！</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                强烈建议现在为当前设备绑定 Passkey，下次即可使用指纹/面容一秒免密登录。
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={handleRegisterPasskeyNow}
                disabled={passkeyLoading}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Fingerprint className="w-4 h-4" />
                <span>{passkeyLoading ? '等待生物识别...' : '立即启用 Passkey 登录'}</span>
              </button>
              <button
                onClick={async () => {
                  const me = await api.auth.me()
                  onLoginSuccess(me)
                }}
                className="w-full py-2.5 text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
              >
                稍后在设置中绑定
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* First-time initial setup prompt */}
            {isInitialized === false && (
              <div className="mb-6 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl text-cyan-400 text-xs text-center font-medium">
                ✨ 首次使用：请先设置家庭 NAS 控制面板的管理员账号
              </div>
            )}

            {/* If initialized and has passkey, offer prominent Passkey button */}
            {isInitialized && hasPasskey && mode === 'passkey' ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="w-full py-4 px-6 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-95 text-white rounded-2xl font-bold text-base shadow-xl shadow-cyan-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer group"
                >
                  <Fingerprint className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  <span>{passkeyLoading ? '正在验证生物特征...' : 'Passkey 一键免密登录'}</span>
                </button>

                <div className="pt-4 border-t border-slate-800 text-center">
                  <button
                    type="button"
                    onClick={() => setMode('password')}
                    className="text-xs text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                  >
                    使用账号密码登录 ➔
                  </button>
                </div>
              </div>
            ) : (
              /* Password form (or initial registration) */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    管理员用户名
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    登录密码
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {!isInitialized && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      确认密码
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-95 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <span>{loading ? '提交中...' : isInitialized ? '登录面板' : '创建管理员并继续'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {isInitialized && hasPasskey && (
                  <div className="pt-3 text-center">
                    <button
                      type="button"
                      onClick={() => setMode('passkey')}
                      className="text-xs text-cyan-400 hover:underline cursor-pointer"
                    >
                      切换回 Passkey 生物识别登录
                    </button>
                  </div>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
