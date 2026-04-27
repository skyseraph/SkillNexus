import { useState, useEffect, useRef } from 'react'
import HomePage from './pages/HomePage'
import EvalPage from './pages/EvalPage'
import StudioPage from './pages/StudioPage'
import EvoPage from './pages/EvoPage'
import TrendingPage from './pages/TrendingPage'
import TasksPage from './pages/TasksPage'
import SettingsPage from './pages/SettingsPage'
import ToastContainer from './components/ToastContainer'
import TelemetryConsentDialog from './components/TelemetryConsentDialog'
import { useToast } from './hooks/useToast'
import './App.css'
import type { EvoSession } from '../../shared/types'

type Page = 'home' | 'eval' | 'studio' | 'evo' | 'tasks' | 'trending' | 'settings'
export type Theme = 'dark' | 'light' | 'system'

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home',     label: 'Home',     icon: '◈' },
  { id: 'studio',   label: 'Studio',   icon: '✦' },
  { id: 'eval',     label: 'Eval',     icon: '◎' },
  { id: 'evo',      label: 'Evo',      icon: '⟳' },
  { id: 'tasks',    label: 'Tasks',    icon: '≡' },
  { id: 'trending', label: 'Trending', icon: '↑' }
]

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
  document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : '')
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [navSkillId, setNavSkillId] = useState<string | null>(null)
  const [navJobId, setNavJobId] = useState<string | null>(null)
  // Track nav version per page — incrementing forces remount when navigating with a skillId
  const [navVersion, setNavVersion] = useState<Record<string, number>>({})
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) ?? 'dark')
  const { toasts, toast, dismiss } = useToast()
  const evoSessionRef = useRef<EvoSession | null>(null)
  // Track which pages have been visited (for lazy mount)
  const [mounted, setMounted] = useState<Set<Page>>(new Set(['home']))
  // Incremented every time the user navigates to a page — used by skill-selector pages
  // to re-fetch the skill list (in case new skills were installed on Home)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)

  const handleNavigate = (p: string, skillId?: string, jobId?: string) => {
    const newPage = p as Page
    setPage(newPage)
    setMounted(prev => new Set([...prev, newPage]))
    if (skillId || jobId) {
      // Force remount of target page when navigating with a specific skillId or jobId
      setNavVersion(prev => ({ ...prev, [newPage]: (prev[newPage] ?? 0) + 1 }))
    }
    setNavSkillId(skillId ?? null)
    setNavJobId(jobId ?? null)
    // Refresh skill list whenever navigating to a page that has a skill selector
    if (['eval', 'evo', 'studio', 'trending'].includes(p)) {
      setSkillsRefreshKey(k => k + 1)
    }
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

  const v = (p: Page) => navVersion[p] ?? 0

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">S</div>
          <div className="logo-text-group">
            <span className="logo-text">SkillNexus</span>
            <span className="logo-tagline">Skill 创造平台</span>
          </div>
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
        <main className="content">
          {/* Lazy-mount: each page is rendered once on first visit and kept alive with display:none */}
          <div style={{ display: page === 'home' ? undefined : 'none', height: '100%' }}>
            {mounted.has('home') && <HomePage toast={toast} onNavigate={handleNavigate} />}
          </div>
          <div style={{ display: page === 'studio' ? undefined : 'none', height: '100%' }}>
            {mounted.has('studio') && <StudioPage key={v('studio')} initialSkillId={navSkillId ?? undefined} onNavigate={handleNavigate} />}
          </div>
          <div style={{ display: page === 'eval' ? undefined : 'none', height: '100%' }}>
            {mounted.has('eval') && <EvalPage key={v('eval')} initialSkillId={navSkillId ?? undefined} onNavigate={handleNavigate} skillsRefreshKey={skillsRefreshKey} />}
          </div>
          <div style={{ display: page === 'evo' ? undefined : 'none', height: '100%' }}>
            {mounted.has('evo') && <EvoPage key={v('evo')} session={evoSessionRef} initialSkillId={navSkillId ?? undefined} onNavigate={handleNavigate} skillsRefreshKey={skillsRefreshKey} />}
          </div>
          <div style={{ display: page === 'tasks' ? undefined : 'none', height: '100%' }}>
            {mounted.has('tasks') && <TasksPage key={v('tasks')} initialJobId={navJobId ?? undefined} onNavigate={handleNavigate} toast={toast} />}
          </div>
          <div style={{ display: page === 'trending' ? undefined : 'none', height: '100%' }}>
            {mounted.has('trending') && <TrendingPage onNavigate={handleNavigate} />}
          </div>
          <div style={{ display: page === 'settings' ? undefined : 'none', height: '100%' }}>
            {mounted.has('settings') && <SettingsPage onConfigSaved={checkApiKey} theme={theme} onThemeChange={setTheme} toast={toast} />}
          </div>
        </main>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <TelemetryConsentDialog />
    </div>
  )
}
