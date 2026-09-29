import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DashboardData } from './types'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DashboardData }

const DataContext = createContext<State>({ status: 'loading' })

async function load(): Promise<DashboardData> {
  // Dev only: `?fixture` loads sample data to exercise populated states. Never bundled in production.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture')) {
    // Glob import resolves to {} when the fixture was not generated (npm run fixture), so builds never depend on it.
    const fixtures = import.meta.glob<{ default: DashboardData }>('../../dev/fixture.json')
    const loadFixture = Object.values(fixtures)[0]
    if (loadFixture) return (await loadFixture()).default
    throw new Error('No fixture: run `npm run fixture` first')
  }
  const res = await fetch('./data.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`data.json responded ${res.status}`)
  return res.json()
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    load()
      .then((data) => setState({ status: 'ready', data }))
      .catch((e: unknown) => setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
  }, [])
  return <DataContext.Provider value={state}>{children}</DataContext.Provider>
}

export const useDataState = () => useContext(DataContext)

/** For components rendered only when data is ready. */
export function useData(): DashboardData {
  const state = useContext(DataContext)
  if (state.status !== 'ready') throw new Error('useData called before data was ready')
  return state.data
}
