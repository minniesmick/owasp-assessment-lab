import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useData } from '../lib/data'
import { byRisk, memberName, SEVERITIES, SEVERITY_LABEL, STATUS_LABEL, STATUSES } from '../lib/derive'
import { formatDate, plural } from '../lib/format'
import type { Finding, Severity } from '../lib/types'
import { EmptyState, GuideLink, OwaspTag, PageHeader, StatusPill } from '../components/ui'
import { SeverityBadge, SeverityGlyph } from '../components/Severity'

type SortKey = 'risk' | 'id' | 'date'

const SORTS: Record<SortKey, (a: Finding, b: Finding) => number> = {
  risk: byRisk,
  id: (a, b) => a.id.localeCompare(b.id),
  date: (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || byRisk(a, b),
}

export function FindingsPage() {
  const data = useData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const sevFilter = new Set((params.get('severity') ?? '').split(',').filter(Boolean) as Severity[])
  const owasp = params.get('owasp') ?? ''
  const member = params.get('member') ?? ''
  const source = params.get('source') ?? ''
  const status = params.get('status') ?? ''
  const sort = (params.get('sort') as SortKey) || 'risk'

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const toggleSeverity = (s: Severity) => {
    const next = new Set(sevFilter)
    if (next.has(s)) next.delete(s)
    else next.add(s)
    update('severity', [...next].join(','))
  }

  const filtered = useMemo(
    () =>
      data.findings
        .filter((f) => sevFilter.size === 0 || sevFilter.has(f.severity))
        .filter((f) => !owasp || f.owasp === owasp)
        .filter((f) => !member || f.testerId === member)
        .filter((f) => !source || f.source === source)
        .filter((f) => !status || f.status === status)
        .sort(SORTS[sort] ?? byRisk),
    [data, params],
  )

  const active = sevFilter.size > 0 || owasp || member || source || status
  const sevCount = (s: Severity) => data.findings.filter((f) => f.severity === s).length

  if (data.findings.length === 0) {
    return (
      <>
        <PageHeader title="Findings" />
        <EmptyState
          title="No findings yet"
          action={<GuideLink anchor="#4-bulgu-ekleme-ve-pull-request">How to add a finding</GuideLink>}
        >
          A finding appears here once its Markdown file (copied from <code>findings/_TEMPLATE.md</code>) is merged into{' '}
          <code>main</code>. Findings are sorted by CVSS score, highest risk first.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Findings"
        lead={
          <>
            {plural(filtered.length, 'finding')}
            {active ? ` of ${data.findings.length}` : ''}, sorted by{' '}
            {sort === 'risk' ? 'CVSS score' : sort === 'id' ? 'ID' : 'date'}.
          </>
        }
      />

      <div className="filters" role="group" aria-label="Filter findings">
        <div className="chip-group" role="group" aria-label="Severity">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip sev-${s}`}
              aria-pressed={sevFilter.has(s)}
              onClick={() => toggleSeverity(s)}
              disabled={sevCount(s) === 0 && !sevFilter.has(s)}
            >
              <SeverityGlyph severity={s} />
              {SEVERITY_LABEL[s]}
              <span className="chip__count num">{sevCount(s)}</span>
            </button>
          ))}
        </div>

        <div className="select-row">
          <Select label="Category" value={owasp} onChange={(v) => update('owasp', v)}
            options={data.owasp.map((o) => [o.code, `${o.code} ${o.name}`])} />
          <Select label="Tester" value={member} onChange={(v) => update('member', v)}
            options={data.team.map((m) => [m.id, m.name])} />
          <Select label="Source" value={source} onChange={(v) => update('source', v)}
            options={[['juice-shop', 'Juice Shop'], ['portswigger', 'PortSwigger']]} />
          <Select label="Status" value={status} onChange={(v) => update('status', v)}
            options={STATUSES.map((s) => [s, STATUS_LABEL[s]])} />
          <Select label="Sort" value={sort === 'risk' ? '' : sort} onChange={(v) => update('sort', v)} allLabel="CVSS score"
            options={[['date', 'Date'], ['id', 'ID']]} />
          {active && (
            <button type="button" className="button-quiet" onClick={() => setParams(sort !== 'risk' ? { sort } : {}, { replace: true })}>
              <X size={14} aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No findings match these filters" action={
          <button type="button" className="button-quiet" onClick={() => setParams({}, { replace: true })}>Clear filters</button>
        } />
      ) : (
        <div className="table-wrap">
          <table className="table findings-table">
            <caption className="visually-hidden">Findings</caption>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Title</th>
                <th scope="col">OWASP</th>
                <th scope="col" aria-sort={sort === 'risk' ? 'descending' : 'none'}>Severity</th>
                <th scope="col">Tester</th>
                <th scope="col">Status</th>
                <th scope="col" className="align-end" aria-sort={sort === 'date' ? 'descending' : 'none'}>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="is-clickable" onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a, button')) return
                  navigate(`/findings/${f.id}`)
                }}>
                  <td className="mono nowrap">
                    <Link to={`/findings/${f.id}`} className="row-link">{f.id}</Link>
                  </td>
                  <td className="findings-table__title">
                    {f.title}
                    <span className="findings-table__source">{f.source === 'portswigger' ? 'PortSwigger' : 'Juice Shop'}</span>
                  </td>
                  <td><OwaspTag code={f.owasp} /></td>
                  <td className="nowrap"><SeverityBadge severity={f.severity} score={f.cvssScore} /></td>
                  <td className="nowrap">{memberName(data, f.testerId) === 'Unknown' ? f.tester : memberName(data, f.testerId)}</td>
                  <td><StatusPill status={f.status} /></td>
                  <td className="align-end nowrap num muted">{f.date ? formatDate(f.date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Select({ label, value, onChange, options, allLabel = 'All' }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  allLabel?: string
}) {
  return (
    <label className={`select${value ? ' is-set' : ''}`}>
      <span className="select__label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  )
}
