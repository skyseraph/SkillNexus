import { useState } from 'react'
import HomePage from './pages/HomePage'
import EvalPage from './pages/EvalPage'
import StudioPage from './pages/StudioPage'
import TestCasePage from './pages/TestCasePage'
import EvoPage from './pages/EvoPage'
import TrendingPage from './pages/TrendingPage'
import './App.css'

type Page = 'home' | 'eval' | 'studio' | 'testcase' | 'evo' | 'trending'

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

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage />
      case 'eval': return <EvalPage />
      case 'studio': return <StudioPage />
      case 'testcase': return <TestCasePage />
      case 'evo': return <EvoPage />
      case 'trending': return <TrendingPage />
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
      </nav>
      <main className="content">{renderPage()}</main>
    </div>
  )
}
