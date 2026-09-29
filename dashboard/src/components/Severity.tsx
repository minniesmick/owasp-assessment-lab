import type { Severity } from '../lib/types'
import { SEVERITY_LABEL } from '../lib/derive'

/** Distinct shape per severity so it reads without color (projectors, color-vision deficiency). */
export function SeverityGlyph({ severity, size = 10 }: { severity: Severity; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 10 10', 'aria-hidden': true, className: `glyph sev-${severity}` }
  switch (severity) {
    case 'critical':
      return (
        <svg {...common}>
          <path d="M5 0.4 9.6 5 5 9.6 0.4 5z" fill="currentColor" />
        </svg>
      )
    case 'high':
      return (
        <svg {...common}>
          <path d="M5 0.8 9.6 9.2H0.4z" fill="currentColor" />
        </svg>
      )
    case 'medium':
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="4.4" fill="currentColor" />
        </svg>
      )
    case 'low':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
  }
}

export function SeverityBadge({ severity, score }: { severity: Severity; score?: number | null }) {
  return (
    <span className={`sev-badge sev-${severity}`}>
      <SeverityGlyph severity={severity} />
      <span>{SEVERITY_LABEL[severity] ?? severity}</span>
      {score != null && <span className="sev-badge__score num">{score.toFixed(1)}</span>}
    </span>
  )
}

/** Compact "◆2 ▲1 ●3" counts; zero counts are omitted. */
export function SeverityCounts({ counts }: { counts: Partial<Record<Severity, number>> }) {
  const entries = (['critical', 'high', 'medium', 'low', 'info'] as Severity[]).filter((s) => (counts[s] ?? 0) > 0)
  if (entries.length === 0) return <span className="muted">—</span>
  return (
    <span className="sev-counts">
      {entries.map((s) => (
        <span key={s} className={`sev-counts__item sev-${s}`} title={`${counts[s]} ${SEVERITY_LABEL[s].toLowerCase()}`}>
          <SeverityGlyph severity={s} />
          <span className="num">{counts[s]}</span>
          <span className="visually-hidden"> {SEVERITY_LABEL[s].toLowerCase()}</span>
        </span>
      ))}
    </span>
  )
}
