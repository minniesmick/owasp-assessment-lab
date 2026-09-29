import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { FindingStatus, OwaspCode } from '../lib/types'
import { COVERAGE_LABEL, STATUS_LABEL, type CoverageState } from '../lib/derive'
import { useData } from '../lib/data'

/** Thin meter. The value is always also given as text by the caller. */
export function Meter({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <span className="meter" role="img" aria-label={`${label}: ${value} of ${total}`}>
      <span className="meter__fill" style={{ inlineSize: `${pct}%` }} />
    </span>
  )
}

export function StatusPill({ status }: { status: FindingStatus }) {
  return <span className={`status-pill status-${status}`}>{STATUS_LABEL[status] ?? status}</span>
}

export function CoveragePill({ state }: { state: CoverageState }) {
  return (
    <span className={`coverage-pill coverage-${state}`}>
      <span className="coverage-pill__dot" aria-hidden="true" />
      {COVERAGE_LABEL[state]}
    </span>
  )
}

export function OwaspTag({ code, link = true }: { code: OwaspCode; link?: boolean }) {
  const data = useData()
  const name = data.owasp.find((o) => o.code === code)?.name ?? code
  if (!link) return <abbr className="owasp-tag mono" title={name}>{code}</abbr>
  return (
    <Link className="owasp-tag mono" to={`/findings?owasp=${code}`} title={`${name} — show findings`}>
      {code}
    </Link>
  )
}

export function Monogram({ name }: { name: string }) {
  return (
    <span className="monogram" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function PageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {lead && <p className="page-header__lead">{lead}</p>}
      </div>
      {children && <div className="page-header__aside">{children}</div>}
    </header>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {children && <div className="empty-state__body">{children}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}

export function GuideLink({ anchor = '', children }: { anchor?: string; children: ReactNode }) {
  const data = useData()
  return (
    <a href={`https://github.com/${data.repo}/blob/main/BASLANGIC.md${anchor}`} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

export function Section({ title, meta, children, id }: { title: string; meta?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section__head">
        <h2 id={id}>{title}</h2>
        {meta && <div className="section__meta">{meta}</div>}
      </div>
      {children}
    </section>
  )
}
