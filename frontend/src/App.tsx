import React, { useState, useEffect } from 'react'
import { Navbar, TabType } from './components/Navbar'
import { LoginPage } from './pages/LoginPage'
import { NavigationPage } from './pages/NavigationPage'
import { PVEStatusPage } from './pages/PVEStatusPage'
import { WOLControlPage } from './pages/WOLControlPage'
import { SettingPage } from './pages/SettingPage'
import { api, getToken, User } from './api/client'

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [currentTab, setCurrentTab] = useState<TabType>('nav')

  const checkAuth = async () => {
    const token = getToken()
    if (!token) {
      setUser(null)
      setAuthChecking(false)
      return
    }

    try {
      const me = await api.auth.me()
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setAuthChecking(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  const handleLogout = () => {
    api.auth.logout()
    setUser(null)
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">正在连接 NAS 面板...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <LoginPage
        onLoginSuccess={(loggedUser) => {
          setUser(loggedUser)
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* Top Navbar with PVE Status Badge in the Top Right */}
      <Navbar
        user={user}
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentTab === 'nav' && <NavigationPage />}
        {currentTab === 'pve' && <PVEStatusPage />}
        {currentTab === 'wol' && (
          <WOLControlPage onNavigateToSetting={() => setCurrentTab('setting')} />
        )}
        {currentTab === 'setting' && (
          <SettingPage
            user={user}
            onRefreshUser={async () => {
              const me = await api.auth.me()
              setUser(me)
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
