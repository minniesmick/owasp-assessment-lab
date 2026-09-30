import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Moon, Network, Sun } from 'lucide-react'
import { useDataState } from '../lib/data'
import { daysSince, relativeTime } from '../lib/format'
import { setTheme, type Theme } from '../lib/theme'

const TABS = [
  { to: '/team', label: 'Team' },
  { to: '/coverage', label: 'Coverage' },
  { to: '/findings', label: 'Findings' },
  { to: '/risk', label: 'Risk' },
  { to: '/activity', label: 'Activity' },
]

export function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <NavLink to="/team" className="brand" aria-label="OWASP Assessment Lab — home">
          <BrandMark />
          <span className="brand__name">OWASP Assessment Lab</span>
        </NavLink>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `tabs__link${isActive ? ' is-active' : ''}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__end">
          <a
            className="topbar-link"
            href="./codebase/index.html"
            target="_blank"
            rel="noreferrer"
            title="Repository map: file tree, import/link graph and report (opens in a new tab)"
          >
            <Network size={15} aria-hidden="true" />
            <span className="topbar-link__label">Code map</span>
          </a>
          <DataStamp />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function BrandMark() {
  return (
    <svg className="brand__mark" width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--surface-raised)" stroke="var(--border-strong)" />
      <path d="M9 21.5 16 9l7 12.5z" fill="none" stroke="var(--sev-critical)" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="16" cy="18.2" r="1.6" fill="var(--ink)" />
    </svg>
  )
}

function DataStamp() {
  const state = useDataState()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])
  if (state.status !== 'ready') return null
  const { commit } = state.data
  const stale = daysSince(commit.date) > 7
  return (
    <a
      className={`data-stamp${stale ? ' is-stale' : ''}`}
      href={commit.url}
      target="_blank"
      rel="noreferrer"
      title={`Data built from commit ${commit.sha}${stale ? ' — no push in over a week' : ''}`}
    >
      <span className="data-stamp__label">Data</span>
      <span className="mono">{commit.short}</span>
      <span className="data-stamp__time">{relativeTime(commit.date)}</span>
    </a>
  )
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'dark')
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => {
        setTheme(next, { animate: true })
        setThemeState(next)
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme${next === 'light' ? ' (better on projectors)' : ''}`}
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
}
