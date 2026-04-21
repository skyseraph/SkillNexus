import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage'
import EvalPage from './pages/EvalPage'
import StudioPage from './pages/StudioPage'
import TestCasePage from './pages/TestCasePage'
import EvoPage from './pages/EvoPage'
import TrendingPage from './pages/TrendingPage'
import SettingsPage from './pages/SettingsPage'
import './App.css'

type Page = 'home' | 'eval' | 'studio' | 'testcase' | 'evo' | 'trending' | 'settings'

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⚡' },
  { id: 'eval', label: 'Eval', icon: '📊' },
  { id: 'studio', label: 'Studio', icon: '🎨' },
  { id: 'testcase', label: 'TestCase', icon: '🧪' },
  { id: 'evo', label: 'Evo', icon: '🔬' },
  { id: 'trending', label: 'Trending', icon: '🔥' }
]

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)

  const checkApiKey = () => {
    window.api.config.get().then((c) => setApiKeySet(c.anthropicApiKeySet || c.openaiApiKeySet))
  }

  useEffect(() => { checkApiKey() }, [])

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage />
      case 'eval': return <EvalPage />
      case 'studio': return <StudioPage />
      case 'testcase': return <TestCasePage />
      case 'evo': return <EvoPage />
      case 'trending': return <TrendingPage />
      case 'settings': return <SettingsPage onConfigSaved={checkApiKey} />
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
                onClick={() => setPage(item.id)}
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
            onClick={() => setPage('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
            {apiKeySet === false && <span className="warn-dot" title="API key not configured" />}
          </button>
        </div>
      </nav>

      <div className="main-area">
        {/* Global banner when no API key is configured */}
        {apiKeySet === false && page !== 'settings' && (
          <div className="api-key-banner">
            <span>⚠️ No API key configured — AI features (Eval, Studio) will not work.</span>
            <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setPage('settings')}>
              Configure
            </button>
          </div>
        )}
        <main className="content">{renderPage()}</main>
      </div>
    </div>
  )
}
