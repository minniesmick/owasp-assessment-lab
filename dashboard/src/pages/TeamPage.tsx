import { Link } from 'react-router-dom'
import { useData } from '../lib/data'
import { coverage, memberStats, solvedKeys, STATUS_LABEL, STATUSES } from '../lib/derive'
import { plural, relativeTime } from '../lib/format'
import type { Member } from '../lib/types'
import { EmptyState, GuideLink, Meter, Monogram, OwaspTag, PageHeader, Section } from '../components/ui'
import { ActivityItem } from '../components/ActivityItem'

export function TeamPage() {
  const data = useData()
  const cov = coverage(data)
  const withFindings = cov.filter((c) => c.findings.length > 0).length
  const solved = solvedKeys(data).size

  return (
    <>
      <PageHeader
        title="Team"
        lead={
          <>
            <span className="num">{plural(data.findings.length, 'finding')}</span> across{' '}
            <span className="num">{withFindings} of 10</span> OWASP categories ·{' '}
            <span className="num">
              {solved} of {data.challenges.length}
            </span>{' '}
            Juice Shop challenges solved
          </>
        }
      />

      <div className="members" role="list">
        {data.team.map((m) => (
          <MemberPanel key={m.id} member={m} />
        ))}
      </div>

      <Section
        title="Recent activity"
        id="recent-activity"
        meta={
          data.activity.length > 0 && (
            <Link to="/activity" className="text-link">
              All activity
            </Link>
          )
        }
      >
        {data.activity.length === 0 ? (
          <EmptyState title="Nothing has happened yet">
            Solved challenges, new findings and reviews appear here after they are pushed. Start with{' '}
            <GuideLink>the beginner guide</GuideLink>.
          </EmptyState>
        ) : (
          <ul className="activity">
            {data.activity.slice(0, 8).map((e, i) => (
              <ActivityItem key={i} event={e} relative={relativeTime(e.date)} />
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

function MemberPanel({ member }: { member: Member }) {
  const data = useData()
  const s = memberStats(data, member.id)
  const ownsCategories = member.owasp.length > 0
  const findingTotal = s.findings.length

  return (
    <article className="member" role="listitem" aria-labelledby={`member-${member.id}`}>
      <header className="member__head">
        <Monogram name={member.name} />
        <div className="member__id">
          <h2 id={`member-${member.id}`}>{member.name}</h2>
          <p className="member__role">{member.role}</p>
        </div>
      </header>

      <div className="member__owns">
        {ownsCategories ? (
          member.owasp.map((c) => <OwaspTag key={c} code={c} />)
        ) : (
          <span className="member__owns-note">PortSwigger write-ups across all categories</span>
        )}
      </div>

      <dl className="member__stats">
        <div className="stat">
          <dt>{ownsCategories ? 'Challenges in own categories' : 'Challenges solved'}</dt>
          <dd>
            {ownsCategories ? (
              <>
                <span className="stat__value num">
                  {s.ownedSolved}
                  <span className="stat__of"> / {s.ownedTotal}</span>
                </span>
                <Meter value={s.ownedSolved} total={s.ownedTotal} label="Challenges solved in own categories" />
              </>
            ) : (
              <span className="stat__value num">{s.solvedAll}</span>
            )}
          </dd>
        </div>

        <div className="stat">
          <dt>{ownsCategories ? 'Findings' : 'Write-ups'}</dt>
          <dd>
            <span className="stat__value num">{ownsCategories ? findingTotal : s.writeups}</span>
            {findingTotal > 0 ? (
              <span className="status-split" aria-label="By status">
                {STATUSES.map((st) => (
                  <span key={st} className={`status-split__item status-${st}`}>
                    <span className="num">{s.byStatus[st]}</span> {STATUS_LABEL[st].toLowerCase()}
                  </span>
                ))}
              </span>
            ) : (
              <span className="stat__hint">none yet</span>
            )}
          </dd>
        </div>

        <div className="stat">
          <dt>Reviews given</dt>
          <dd>
            {s.reviewsGiven == null ? (
              <span className="stat__value muted" title="Review data is loaded on the published site (GitHub Actions)">
                —
              </span>
            ) : (
              <span className="stat__value num">{s.reviewsGiven}</span>
            )}
          </dd>
        </div>

        <div className="stat">
          <dt>Last activity</dt>
          <dd>
            {s.lastActive ? (
              <time className="stat__text" dateTime={s.lastActive}>
                {relativeTime(s.lastActive)}
              </time>
            ) : (
              <span className="stat__text muted">No pushes yet</span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  )
}
