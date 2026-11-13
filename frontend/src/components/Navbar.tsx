import React, { useState, useEffect } from 'react'
import {
  Server,
  Compass,
  Activity,
  Settings,
  ShieldCheck,
  LogOut,
  KeyRound,
  Menu,
  X,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { User } from '../api/client'
import { PVEStatusBadge } from './PVEStatusBadge'
import { ThemeToggle } from './ThemeToggle'

export type TabType = 'nav' | 'pve' | 'wol' | 'setting'

interface NavbarProps {
  user: User | null
  currentTab: TabType
  onSelectTab: (tab: TabType) => void
  onLogout: () => void
}

const tabs = [
  { id: 'nav', label: 'Navigation', icon: Compass },
  { id: 'pve', label: 'PVE Status', icon: Activity },
  { id: 'wol', label: 'WOL Control', icon: Zap },
  { id: 'setting', label: 'Setting', icon: Settings },
] as const

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

export const Navbar: React.FC<NavbarProps> = ({
  user,
  currentTab,
  onSelectTab,
  onLogout,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileDrawerOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false)
        setDropdownOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleTabClick = (tab: TabType) => {
    onSelectTab(tab)
    setMobileDrawerOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <button
              type="button"
              onClick={() => { setDropdownOpen(false); setMobileDrawerOpen(true) }}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-body hover:bg-raised hover:text-ink lg:hidden motion-safe:transition-colors cursor-pointer ${focusClass}`}
              aria-label="打开侧边导航菜单"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5" aria-label="Home NAS Panel">
              <Server className="h-6 w-6 shrink-0 text-accent sm:h-8 sm:w-8" aria-hidden="true" />
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-ink sm:text-base">
                <span className="sm:hidden">NAS</span>
                <span className="hidden sm:inline">Home NAS Panel</span>
              </span>
            </div>
          </div>

          <nav aria-label="主导航" className="hidden items-center gap-1 lg:flex">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleTabClick(id)}
                aria-current={currentTab === id ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold motion-safe:transition-colors cursor-pointer ${focusClass} ${
                  currentTab === id
                    ? 'bg-accent-soft text-accent'
                    : 'text-body hover:bg-raised hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <PVEStatusBadge />
            <ThemeToggle />

            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-1.5 text-ink hover:border-border-strong hover:bg-raised sm:px-2.5 motion-safe:transition-colors cursor-pointer ${focusClass}`}
                aria-label="用户账户选项"
                aria-expanded={dropdownOpen}
                aria-controls="account-options"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold text-accent">
                  {user?.username?.[0]?.toUpperCase() || 'A'}
                </span>
                <ShieldCheck className="hidden h-3.5 w-3.5 text-success sm:block" aria-hidden="true" />
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div id="account-options" className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-border bg-surface py-2 shadow-float">
                    <div className="border-b border-border px-4 py-2">
                      <p className="text-xs text-muted">当前登录账号</p>
                      <p className="truncate text-sm font-semibold text-ink">{user?.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setDropdownOpen(false); handleTabClick('setting') }}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-body hover:bg-raised hover:text-accent cursor-pointer ${focusClass}`}
                    >
                      <KeyRound className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                      <span>系统设置</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDropdownOpen(false); onLogout() }}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-danger hover:bg-danger-soft cursor-pointer ${focusClass}`}
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>退出登录</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-overlay" onClick={() => setMobileDrawerOpen(false)} />
          <div id="mobile-navigation" className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[88vw] flex-col border-r border-border bg-surface p-4 shadow-float">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Server className="h-7 w-7 text-accent" aria-hidden="true" />
                <span className="text-sm font-semibold text-ink">Home NAS Panel</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-body hover:bg-raised hover:text-ink cursor-pointer ${focusClass}`}
                aria-label="关闭侧边导航菜单"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="侧边导航" className="flex-1 space-y-2 overflow-y-auto py-4">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleTabClick(id)}
                  aria-current={currentTab === id ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm font-semibold motion-safe:transition-colors cursor-pointer ${focusClass} ${
                    currentTab === id
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-transparent text-body hover:bg-raised hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{label}</span>
                  <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                </button>
              ))}
            </nav>

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-inset p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold text-accent">
                  {user?.username?.[0]?.toUpperCase() || 'A'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-ink">{user?.username}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-success">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    <span>管理员已连接</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setMobileDrawerOpen(false); onLogout() }}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border border-danger-border px-3 py-2.5 text-xs font-semibold text-danger hover:bg-danger-soft cursor-pointer ${focusClass}`}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>退出登录</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
