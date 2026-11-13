import React, { useState, useEffect } from 'react'
import {
  Server,
  Fingerprint,
  Lock,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { api, setToken, User } from '../api/client'
import { ThemeToggle } from '../components/ThemeToggle'

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
      } catch {
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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-4 pb-8 pt-20 text-ink">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-panel sm:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Server className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Home NAS Panel</h1>
          <p className="mt-2 text-sm leading-relaxed text-body">家庭服务导航、主机状态与远程唤醒</p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-danger-border bg-danger-soft p-3.5 text-xs text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Wizard: Register Passkey right after initial admin creation */}
        {guideRegisterPasskey ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-accent-soft text-accent">
              <Fingerprint className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">管理员创建成功！</h2>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-body">
                强烈建议现在为当前设备绑定 Passkey，下次即可使用指纹/面容一秒免密登录。
              </p>
            </div>
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={handleRegisterPasskeyNow}
                disabled={passkeyLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 motion-safe:transition-colors cursor-pointer"
              >
                <Fingerprint className="h-4 w-4" aria-hidden="true" />
                <span>{passkeyLoading ? '等待生物识别...' : '立即启用 Passkey 登录'}</span>
              </button>
              <button
                onClick={async () => {
                  const me = await api.auth.me()
                  onLoginSuccess(me)
                }}
                className="w-full rounded-lg py-2.5 text-xs text-body hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:transition-colors cursor-pointer"
              >
                稍后在设置中绑定
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* First-time initial setup prompt */}
            {isInitialized === false && (
              <div className="mb-6 rounded-lg border border-border bg-accent-soft p-3 text-center text-xs font-medium leading-relaxed text-accent">
                首次使用：请先设置家庭 NAS 控制面板的管理员账号
              </div>
            )}

            {/* If initialized and has passkey, offer prominent Passkey button */}
            {isInitialized && hasPasskey && mode === 'passkey' ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 py-4 text-base font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 motion-safe:transition-colors cursor-pointer"
                >
                  <Fingerprint className="h-6 w-6 shrink-0" aria-hidden="true" />
                  <span>{passkeyLoading ? '正在验证生物特征...' : 'Passkey 一键免密登录'}</span>
                </button>

                <div className="border-t border-border pt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setMode('password')}
                    className="rounded-lg px-2 py-2 text-xs text-body hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:transition-colors cursor-pointer"
                  >
                    使用账号密码登录 ➔
                  </button>
                </div>
              </div>
            ) : (
              /* Password form (or initial registration) */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-body">
                    管理员用户名
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 h-4 w-4 text-muted" aria-hidden="true" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      required
                      className="w-full rounded-lg border border-border-strong bg-field py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-body">
                    登录密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted" aria-hidden="true" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full rounded-lg border border-border-strong bg-field py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>

                {!isInitialized && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-body">
                      确认密码
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted" aria-hidden="true" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full rounded-lg border border-border-strong bg-field py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 motion-safe:transition-colors cursor-pointer"
                >
                  <span>{loading ? '提交中...' : isInitialized ? '登录面板' : '创建管理员并继续'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                {isInitialized && hasPasskey && (
                  <div className="pt-3 text-center">
                    <button
                      type="button"
                      onClick={() => setMode('passkey')}
                      className="rounded-lg px-2 py-2 text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
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
