import { useEffect } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DataProvider, useDataState } from './lib/data'
import { TopBar } from './components/TopBar'
import { EmptyState } from './components/ui'
import { TeamPage } from './pages/TeamPage'
import { CoveragePage } from './pages/CoveragePage'
import { FindingsPage } from './pages/FindingsPage'
import { FindingDetailPage } from './pages/FindingDetailPage'
import { RiskPage } from './pages/RiskPage'
import { ActivityPage } from './pages/ActivityPage'

const TITLES: Record<string, string> = {
  team: 'Team',
  coverage: 'Coverage',
  findings: 'Findings',
  risk: 'Risk',
  activity: 'Activity',
}

export function App() {
  return (
    <HashRouter>
      <DataProvider>
        <a className="skip-link" href="#main">Skip to content</a>
        <TopBar />
        <main id="main" className="page" tabIndex={-1}>
          <PageContent />
        </main>
      </DataProvider>
    </HashRouter>
  )
}

function PageContent() {
  const state = useDataState()
  const location = useLocation()

  useEffect(() => {
    const [, section, id] = location.pathname.split('/')
    const name = id ?? TITLES[section] ?? 'Dashboard'
    document.title = `${name} · OWASP Assessment Lab`
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  if (state.status === 'loading') return <LoadingSkeleton />
  if (state.status === 'error') {
    return (
      <EmptyState
        title="The dashboard data could not be loaded"
        action={
          <a href="https://github.com/minniesmick/owasp-assessment-lab/actions" target="_blank" rel="noreferrer">
            Check the latest GitHub Actions run
          </a>
        }
      >
        <code>data.json</code> is generated on every push to <code>main</code>. Error: {state.message}
      </EmptyState>
    )
  }

  return (
    <div className="page__content" key={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/team" replace />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/coverage" element={<CoveragePage />} />
        <Route path="/findings" element={<FindingsPage />} />
        <Route path="/findings/:id" element={<FindingDetailPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route
          path="*"
          element={<EmptyState title="Page not found" action={<Link to="/team">Go to the team overview</Link>} />}
        />
      </Routes>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading dashboard data">
      <div className="skeleton__line skeleton__line--title" />
      <div className="skeleton__line skeleton__line--lead" />
      <div className="members">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton__panel" />
        ))}
      </div>
    </div>
  )
}
