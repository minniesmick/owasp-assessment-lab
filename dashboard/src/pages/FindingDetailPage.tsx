import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useData } from '../lib/data'
import { memberName } from '../lib/derive'
import { formatDate } from '../lib/format'
import { renderMarkdown } from '../lib/markdown'
import { EmptyState, OwaspTag, StatusPill } from '../components/ui'
import { SeverityBadge } from '../components/Severity'

const CVSS_METRICS: Record<string, [string, Record<string, string>]> = {
  AV: ['Attack vector', { N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' }],
  AC: ['Attack complexity', { L: 'Low', H: 'High' }],
  PR: ['Privileges required', { N: 'None', L: 'Low', H: 'High' }],
  UI: ['User interaction', { N: 'None', R: 'Required' }],
  S: ['Scope', { U: 'Unchanged', C: 'Changed' }],
  C: ['Confidentiality', { H: 'High', L: 'Low', N: 'None' }],
  I: ['Integrity', { H: 'High', L: 'Low', N: 'None' }],
  A: ['Availability', { H: 'High', L: 'Low', N: 'None' }],
}

export function FindingDetailPage() {
  const { id } = useParams()
  const data = useData()
  const finding = data.findings.find((f) => f.id === id)
  const html = useMemo(() => (finding ? renderMarkdown(finding.body) : ''), [finding])

  if (!finding) {
    return (
      <EmptyState title={`Finding ${id} not found`} action={<Link to="/findings">Back to findings</Link>}>
        It may have been renamed, or it is not merged into <code>main</code> yet.
      </EmptyState>
    )
  }

  const metrics = (finding.cvssVector ?? '')
    .replace(/^CVSS:3\.1\//, '')
    .split('/')
    .map((part) => part.split(':'))
    .filter(([k]) => k in CVSS_METRICS)
  const cweNumber = /^CWE-(\d+)$/.exec(finding.cwe ?? '')?.[1]

  return (
    <article className="finding">
      <Link to="/findings" className="back-link">
        <ArrowLeft size={14} aria-hidden="true" /> Findings
      </Link>

      <header className="finding__head">
        <p className="finding__id mono">{finding.id}</p>
        <h1>{finding.title}</h1>
        <div className="finding__badges">
          <SeverityBadge severity={finding.severity} score={finding.cvssScore} />
          <OwaspTag code={finding.owasp} />
          <StatusPill status={finding.status} />
        </div>
      </header>

      <div className="finding__layout">
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

        <aside className="finding__aside" aria-label="Finding details">
          <dl className="kv">
            <div><dt>Target</dt><dd>{finding.target}</dd></div>
            <div><dt>Source</dt><dd>{finding.source === 'portswigger' ? 'PortSwigger Academy' : 'OWASP Juice Shop'}</dd></div>
            <div><dt>Category</dt><dd><OwaspTag code={finding.owasp} /> {data.owasp.find((o) => o.code === finding.owasp)?.name}</dd></div>
            <div>
              <dt>Weakness</dt>
              <dd>
                {cweNumber ? (
                  <a href={`https://cwe.mitre.org/data/definitions/${cweNumber}.html`} target="_blank" rel="noreferrer" className="mono">
                    {finding.cwe}
                  </a>
                ) : finding.cwe}
              </dd>
            </div>
            <div><dt>Tester</dt><dd>{finding.testerId ? memberName(data, finding.testerId) : finding.tester}</dd></div>
            <div><dt>Tools</dt><dd>{finding.tools.length ? finding.tools.join(', ') : '—'}</dd></div>
            <div><dt>Date</dt><dd className="num">{finding.date ? formatDate(finding.date) : '—'}</dd></div>
          </dl>

          <section className="cvss" aria-labelledby="cvss-title">
            <h2 id="cvss-title">CVSS 3.1</h2>
            <p className="cvss__scores num">
              <span><strong>{finding.cvssScore?.toFixed(1) ?? '—'}</strong> base</span>
              {finding.cvss && (
                <>
                  <span>{finding.cvss.exploitability.toFixed(1)} exploitability</span>
                  <span>{finding.cvss.impact.toFixed(1)} impact</span>
                </>
              )}
            </p>
            <dl className="cvss__metrics">
              {metrics.map(([k, v]) => (
                <div key={k}>
                  <dt>{CVSS_METRICS[k][0]}</dt>
                  <dd>{CVSS_METRICS[k][1][v] ?? v}</dd>
                </div>
              ))}
            </dl>
            <code className="cvss__vector">{finding.cvssVector}</code>
          </section>

          <a className="source-link" href={finding.url} target="_blank" rel="noreferrer">
            View source file on GitHub <ExternalLink size={13} aria-hidden="true" />
          </a>
        </aside>
      </div>
    </article>
  )
}
