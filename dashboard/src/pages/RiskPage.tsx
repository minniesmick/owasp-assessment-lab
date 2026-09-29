import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../lib/data'
import { byRisk, countBy, SEVERITIES, SEVERITY_LABEL } from '../lib/derive'
import type { Finding } from '../lib/types'
import { EmptyState, GuideLink, PageHeader, Section } from '../components/ui'
import { SeverityBadge, SeverityGlyph } from '../components/Severity'

// CVSS 3.1 sub-score ranges: exploitability 0.1–3.9, impact 0–6.1 (scope changed can reach ~6.0).
const X_MAX = 4
const Y_MAX = 6.5
const W = 640
const H = 360
const PAD = { top: 16, right: 20, bottom: 44, left: 52 }

export function RiskPage() {
  const data = useData()
  const scored = data.findings.filter((f) => f.cvss)

  if (data.findings.length === 0) {
    return (
      <>
        <PageHeader title="Risk" />
        <EmptyState title="No findings to plot yet" action={<GuideLink anchor="#4-bulgu-ekleme-ve-pull-request">How to add a finding</GuideLink>}>
          Each finding is placed by the exploitability and impact sub-scores of its CVSS 3.1 vector, so the chart fills in as findings are merged.
        </EmptyState>
      </>
    )
  }

  const counts = countBy(data.findings, (f) => f.severity)
  const total = data.findings.length
  const top = [...data.findings].sort(byRisk).slice(0, 5)

  return (
    <>
      <PageHeader
        title="Risk"
        lead="Where each finding sits by how easy it is to exploit and how much damage it does, from its CVSS 3.1 vector."
      />

      <Section title="Severity distribution" id="severity-distribution">
        <div className="distribution">
          <div className="distribution__bar" role="img" aria-label={SEVERITIES.map((s) => `${counts[s] ?? 0} ${s}`).join(', ')}>
            {SEVERITIES.filter((s) => counts[s]).map((s) => (
              <span key={s} className={`distribution__seg sev-${s}`} style={{ flexGrow: counts[s] }} />
            ))}
          </div>
          <ul className="distribution__legend">
            {SEVERITIES.map((s) => (
              <li key={s} className={counts[s] ? undefined : 'is-zero'}>
                <span className={`sev-${s}`}><SeverityGlyph severity={s} /></span>
                <span>{SEVERITY_LABEL[s]}</span>
                <span className="num distribution__n">{counts[s] ?? 0}</span>
                <span className="num muted">{Math.round(((counts[s] ?? 0) / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <div className="risk-grid">
      <Section title="Exploitability × impact" id="risk-plot" meta={<span className="muted">{scored.length} plotted</span>}>
        <RiskPlot findings={scored} />
      </Section>

      <Section title="Highest risk" id="top-risks">
        <ol className="top-risks">
          {top.map((f) => (
            <li key={f.id}>
              <SeverityBadge severity={f.severity} score={f.cvssScore} />
              <Link to={`/findings/${f.id}`}>
                <span className="mono">{f.id}</span> {f.title}
              </Link>
            </li>
          ))}
        </ol>
      </Section>
      </div>
    </>
  )
}

function RiskPlot({ findings }: { findings: Finding[] }) {
  const navigate = useNavigate()
  const [active, setActive] = useState<Finding | null>(null)
  const x = (v: number) => PAD.left + (v / X_MAX) * (W - PAD.left - PAD.right)
  const y = (v: number) => H - PAD.bottom - (v / Y_MAX) * (H - PAD.top - PAD.bottom)

  // Findings with identical sub-scores would overlap: nudge duplicates around the point.
  const seen = new Map<string, number>()
  const points = findings.map((f) => {
    const key = `${f.cvss!.exploitability}|${f.cvss!.impact}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    const angle = n * 2.4
    const r = n === 0 ? 0 : 7 + n * 1.5
    return { f, cx: x(f.cvss!.exploitability) + Math.cos(angle) * r, cy: y(f.cvss!.impact) + Math.sin(angle) * r }
  })

  const tip = active ? points.find((p) => p.f.id === active.id) : undefined

  return (
    <figure className="risk-plot">
      <div className="risk-plot__canvas">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Findings by exploitability and impact">
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={`x${t}`}>
            <line className="risk-plot__grid" x1={x(t)} x2={x(t)} y1={PAD.top} y2={H - PAD.bottom} />
            <text className="risk-plot__tick" x={x(t)} y={H - PAD.bottom + 16} textAnchor="middle">{t}</text>
          </g>
        ))}
        {[0, 2, 4, 6].map((t) => (
          <g key={`y${t}`}>
            <line className="risk-plot__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="risk-plot__tick" x={PAD.left - 10} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        <text className="risk-plot__axis" x={(PAD.left + W - PAD.right) / 2} y={H - 6} textAnchor="middle">Exploitability →</text>
        <text className="risk-plot__axis" transform={`translate(14 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`} textAnchor="middle">Impact →</text>

        {points.map(({ f, cx, cy }) => (
          <g
            key={f.id}
            className={`risk-plot__point sev-${f.severity}${active?.id === f.id ? ' is-active' : ''}`}
            transform={`translate(${cx} ${cy})`}
            tabIndex={0}
            role="link"
            aria-label={`${f.id}, ${f.title}, ${SEVERITY_LABEL[f.severity]} ${f.cvssScore ?? ''}`}
            onMouseEnter={() => setActive(f)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(f)}
            onBlur={() => setActive(null)}
            onClick={() => navigate(`/findings/${f.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate(`/findings/${f.id}`)
              }
            }}
          >
            <circle r="11" className="risk-plot__hit" />
            <g transform="translate(-6 -6)">
              <SeverityGlyph severity={f.severity} size={12} />
            </g>
          </g>
        ))}
      </svg>
      {active && tip && (
        <div
          className={`risk-plot__tip${tip.cx > W * 0.6 ? ' is-left' : ''}${tip.cy < H * 0.3 ? ' is-below' : ''}`}
          style={{ left: `${(tip.cx / W) * 100}%`, top: `${(tip.cy / H) * 100}%` }}
          role="status"
        >
          <span className="mono">{active.id}</span>
          <span className="risk-plot__tip-title">{active.title}</span>
          <span className="num muted">
            E {active.cvss!.exploitability.toFixed(1)} · I {active.cvss!.impact.toFixed(1)} · {active.cvssScore?.toFixed(1)}
          </span>
        </div>
      )}
      </div>
      <figcaption className="muted">
        Exploitability combines attack vector, complexity, privileges and user interaction; impact combines confidentiality,
        integrity, availability and scope. Select a point to open the finding.
      </figcaption>
    </figure>
  )
}
