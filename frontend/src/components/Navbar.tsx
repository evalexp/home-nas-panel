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
} from 'lucide-react'
import { User } from '../api/client'
import { PVEStatusBadge } from './PVEStatusBadge'

export type TabType = 'nav' | 'pve' | 'setting'

interface NavbarProps {
  user: User | null
  currentTab: TabType
  onSelectTab: (tab: TabType) => void
  onLogout: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  currentTab,
  onSelectTab,
  onLogout,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  // Close drawer on screen resize if window grows to desktop size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileDrawerOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close drawer on Escape key
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
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          {/* Left: Mobile Hamburger Trigger + Brand */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="md:hidden p-2 -ml-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              aria-label="打开侧边导航菜单"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Brand Logo & Name */}
            <div className="flex items-center gap-2.5">
              <div className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Server className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Home NAS
                </span>
                <span className="hidden sm:inline-block font-bold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Panel
                </span>
                <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-md">
                  PWA
                </span>
              </div>
            </div>
          </div>

          {/* Center: Desktop Tabs Navigation (Hidden on mobile) */}
          <nav className="hidden md:flex items-center bg-slate-950/60 p-1 rounded-2xl border border-slate-800/80">
            <button
              onClick={() => handleTabClick('nav')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'nav'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Navigation</span>
            </button>

            <button
              onClick={() => handleTabClick('pve')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'pve'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>PVE Status</span>
            </button>

            <button
              onClick={() => handleTabClick('setting')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'setting'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Setting</span>
            </button>
          </nav>

          {/* Right: PVE Status & User Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* PVE Status Indicator (Text + Styled Background + Tooltip) */}
            <PVEStatusBadge />

            {/* User profile dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 rounded-xl border border-slate-700 text-xs transition-all cursor-pointer"
                aria-label="用户账户选项"
              >
                <div className="w-6 h-6 rounded-lg bg-slate-700 flex items-center justify-center text-cyan-400 font-semibold text-[10px] border border-slate-600">
                  {user?.username?.[0]?.toUpperCase() || 'A'}
                </div>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 hidden sm:block" />
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-2 border-b border-slate-800/80">
                      <p className="text-[10px] text-slate-400">当前登录账号</p>
                      <p className="text-xs font-bold text-white truncate">{user?.username}</p>
                    </div>

                    <button
                      onClick={() => {
                        setDropdownOpen(false)
                        handleTabClick('setting')
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                      <span>系统设置</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false)
                        onLogout()
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>退出登录</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Left Slide-out Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Dark Backdrop with Blur */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer Menu Panel */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[82vw] bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col p-5 z-50 transform transition-transform animate-in slide-in-from-left duration-250 ease-out">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
                  <Server className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">Home NAS Panel</div>
                </div>
              </div>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="关闭侧边菜单"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs List */}
            <div className="py-4 space-y-2 flex-1 overflow-y-auto">
              <button
                onClick={() => handleTabClick('nav')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left text-xs font-semibold transition-all cursor-pointer ${
                  currentTab === 'nav'
                    ? 'bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                }`}
              >
                <div
                  className={`p-2 rounded-xl ${
                    currentTab === 'nav'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 font-bold text-sm">Navigation</div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                onClick={() => handleTabClick('pve')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left text-xs font-semibold transition-all cursor-pointer ${
                  currentTab === 'pve'
                    ? 'bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                }`}
              >
                <div
                  className={`p-2 rounded-xl ${
                    currentTab === 'pve'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 font-bold text-sm">PVE Status</div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                onClick={() => handleTabClick('setting')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left text-xs font-semibold transition-all cursor-pointer ${
                  currentTab === 'setting'
                    ? 'bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                }`}
              >
                <div
                  className={`p-2 rounded-xl ${
                    currentTab === 'setting'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 font-bold text-sm">Setting</div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Drawer Footer: User profile & Logout */}
            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 text-xs font-bold shadow-sm">
                  {user?.username?.[0]?.toUpperCase() || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{user?.username}</div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                    <ShieldCheck className="w-3 h-3" />
                    <span>管理员已连接</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setMobileDrawerOpen(false)
                  onLogout()
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl border border-rose-500/20 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>退出登录</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
