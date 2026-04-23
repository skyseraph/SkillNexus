import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage'
import EvalPage from './pages/EvalPage'
import StudioPage from './pages/StudioPage'
import EvoPage from './pages/EvoPage'
import TrendingPage from './pages/TrendingPage'
import SettingsPage from './pages/SettingsPage'
import ToastContainer from './components/ToastContainer'
import { useToast } from './hooks/useToast'
import './App.css'

type Page = 'home' | 'eval' | 'studio' | 'evo' | 'trending' | 'settings'
export type Theme = 'dark' | 'light' | 'system'

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home',     label: 'Home',     icon: '⚡' },
  { id: 'studio',   label: 'Studio',   icon: '🎨' },
  { id: 'eval',     label: 'Eval',     icon: '📊' },
  { id: 'evo',      label: 'Evo',      icon: '🔬' },
  { id: 'trending', label: 'Trending', icon: '🔥' }
]

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
  document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : '')
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [navSkillId, setNavSkillId] = useState<string | null>(null)
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) ?? 'dark')
  const { toasts, toast, dismiss } = useToast()

  const handleNavigate = (p: string, skillId?: string) => {
    setPage(p as Page)
    setNavSkillId(skillId ?? null)
  }

  const checkApiKey = () => {
    window.api.config.get().then((c) => setApiKeySet(c.providers.length > 0))
  }

  useEffect(() => { checkApiKey() }, [])

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('theme', theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage toast={toast} onNavigate={handleNavigate} />
      case 'eval': return <EvalPage initialSkillId={navSkillId ?? undefined} onNavigate={handleNavigate} />
      case 'studio': return <StudioPage initialSkillId={navSkillId ?? undefined} onNavigate={handleNavigate} />
      case 'evo': return <EvoPage initialSkillId={navSkillId ?? undefined} />
      case 'trending': return <TrendingPage />
      case 'settings': return <SettingsPage onConfigSaved={checkApiKey} theme={theme} onThemeChange={setTheme} toast={toast} />
    }
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">SkillNexus</span>
        </div>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => handleNavigate(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Settings pinned at bottom */}
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''} ${apiKeySet === false ? 'nav-warn' : ''}`}
            onClick={() => handleNavigate('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
            {apiKeySet === false && <span className="warn-dot" title="API key not configured" />}
          </button>
        </div>
      </nav>

      <div className="main-area">
        {apiKeySet === false && page !== 'settings' && (
          <div className="api-key-banner">
            <span>⚠️ No LLM provider configured — AI features (Eval, Studio, Evo) will not work.</span>
            <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => handleNavigate('settings')}>
              Configure
            </button>
          </div>
        )}
        <main className="content">{renderPage()}</main>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
