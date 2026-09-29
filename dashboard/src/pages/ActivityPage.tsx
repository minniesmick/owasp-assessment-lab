import { useSearchParams } from 'react-router-dom'
import { useData } from '../lib/data'
import { dayKey, formatDay, plural } from '../lib/format'
import type { ActivityEvent } from '../lib/types'
import { EmptyState, GuideLink, PageHeader } from '../components/ui'
import { ActivityItem } from '../components/ActivityItem'

export function ActivityPage() {
  const data = useData()
  const [params, setParams] = useSearchParams()
  const member = params.get('member') ?? ''

  const events = data.activity.filter(
    (e) => !member || e.member === member || ('author' in e && e.author === member) || (e.type === 'review' && e.prAuthor === member),
  )
  const days: [string, ActivityEvent[]][] = []
  for (const e of events) {
    const key = dayKey(e.date)
    const last = days[days.length - 1]
    if (last && last[0] === key) last[1].push(e)
    else days.push([key, [e]])
  }

  return (
    <>
      <PageHeader
        title="Activity"
        lead={
          <>
            Built from the git history of <code>progress/</code> and <code>findings/</code>
            {data.reviewsAvailable ? ' and pull-request reviews' : ''}. {plural(events.length, 'event')}
            {member ? ` involving ${data.team.find((m) => m.id === member)?.name}` : ''}.
          </>
        }
      />

      <div className="segmented" role="group" aria-label="Filter by member">
        {[{ id: '', name: 'Everyone' }, ...data.team].map((m) => (
          <button
            key={m.id || 'all'}
            type="button"
            aria-pressed={member === m.id}
            onClick={() => setParams(m.id ? { member: m.id } : {}, { replace: true })}
          >
            {m.name}
          </button>
        ))}
      </div>

      {!data.reviewsAvailable && (
        <p className="notice">Pull-request reviews are included on the published site; this local build has no GitHub token.</p>
      )}

      {days.length === 0 ? (
        <EmptyState title={member ? 'No activity for this member yet' : 'Nothing has happened yet'}>
          Saving challenge progress (<code>python scripts/progress.py save &lt;name&gt;</code>), merging findings and reviewing pull
          requests all show up here. See <GuideLink>the beginner guide</GuideLink>.
        </EmptyState>
      ) : (
        <div className="timeline">
          {days.map(([key, list]) => (
            <section key={key} className="timeline__day" aria-label={formatDay(list[0].date)}>
              <h2 className="timeline__date">
                <time dateTime={key}>{formatDay(list[0].date)}</time>
              </h2>
              <ul className="activity">
                {list.map((e, i) => (
                  <ActivityItem key={i} event={e} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
