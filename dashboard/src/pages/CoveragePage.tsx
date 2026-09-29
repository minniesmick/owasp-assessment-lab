import { Link } from 'react-router-dom'
import { useData } from '../lib/data'
import { countBy, coverage, memberName } from '../lib/derive'
import { CoveragePill, Meter, PageHeader } from '../components/ui'
import { SeverityCounts } from '../components/Severity'

export function CoveragePage() {
  const data = useData()
  const rows = coverage(data)
  const documented = rows.filter((r) => r.state === 'documented' || r.state === 'reviewed').length
  const started = rows.filter((r) => r.state !== 'not-started').length

  return (
    <>
      <PageHeader
        title="OWASP Top 10:2025 coverage"
        lead={
          <>
            <span className="num">{documented} of 10</span> categories documented with at least one confirmed finding ·{' '}
            <span className="num">{started}</span> started. Challenge totals are from Juice Shop v{data.juiceShopVersion}.
          </>
        }
      />

      <div className="table-wrap">
        <table className="table coverage-table">
          <caption className="visually-hidden">Coverage per OWASP Top 10:2025 category</caption>
          <thead>
            <tr>
              <th scope="col" className="col-sticky">Category</th>
              <th scope="col">Owner</th>
              <th scope="col">Juice Shop challenges</th>
              <th scope="col" className="align-end">Write-ups</th>
              <th scope="col">Findings</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className={r.state === 'not-started' ? 'is-empty' : undefined}>
                <th scope="row" className="col-sticky">
                  <Link to={`/findings?owasp=${r.code}`} className="category-cell">
                    <span className="mono category-cell__code">{r.code}</span>
                    <span className="category-cell__name">{r.name}</span>
                  </Link>
                </th>
                <td>{r.owners.length ? r.owners.map((id) => memberName(data, id)).join(', ') : <span className="muted">—</span>}</td>
                <td>
                  <span className="meter-cell">
                    <span className="num meter-cell__value">
                      {r.solved}
                      <span className="muted"> / {r.total}</span>
                    </span>
                    <Meter value={r.solved} total={r.total} label={`${r.code} challenges solved`} />
                  </span>
                </td>
                <td className="align-end num">{r.writeups || <span className="muted">—</span>}</td>
                <td>
                  <SeverityCounts counts={countBy(r.findings, (f) => f.severity)} />
                </td>
                <td>
                  <CoveragePill state={r.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="legend">
        <div><dt><CoveragePill state="not-started" /></dt><dd>No challenge solved and no finding yet</dd></div>
        <div><dt><CoveragePill state="in-progress" /></dt><dd>Challenges solved, no confirmed finding written</dd></div>
        <div><dt><CoveragePill state="documented" /></dt><dd>At least one confirmed finding</dd></div>
        <div><dt><CoveragePill state="reviewed" /></dt><dd>At least one finding reproduced by a teammate</dd></div>
      </dl>
    </>
  )
}
