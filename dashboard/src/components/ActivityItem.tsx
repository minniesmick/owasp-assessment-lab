import { Link } from 'react-router-dom'
import { CheckCheck, FilePlus2, GitPullRequestArrow, Flag, ArrowRight } from 'lucide-react'
import type { ActivityEvent, Severity } from '../lib/types'
import { useData } from '../lib/data'
import { memberName, STATUS_LABEL } from '../lib/derive'
import { formatTime, plural } from '../lib/format'
import { SeverityGlyph } from './Severity'

const ICONS = {
  challenges: Flag,
  finding_added: FilePlus2,
  finding_status: CheckCheck,
  review: GitPullRequestArrow,
}

export function ActivityItem({ event, showTime = true, relative }: { event: ActivityEvent; showTime?: boolean; relative?: string }) {
  const data = useData()
  const Icon = ICONS[event.type]
  const who = <strong className="activity__who">{memberName(data, event.member)}</strong>

  let text
  switch (event.type) {
    case 'challenges': {
      const cats = Object.entries(event.byOwasp)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, n]) => `${code === '-' ? 'unmapped' : code}${n > 1 ? ` ×${n}` : ''}`)
        .join(', ')
      text = (
        <>
          {who} solved {plural(event.count, 'challenge')}
          <span className="activity__detail"> · {cats}</span>
          <span className="activity__names">{event.challenges.join(', ')}</span>
        </>
      )
      break
    }
    case 'finding_added':
      text = (
        <>
          {who} added <FindingRef id={event.findingId} severity={event.severity} />
          <span className="activity__title">{event.title}</span>
        </>
      )
      break
    case 'finding_status':
      text = (
        <>
          <FindingRef id={event.findingId} severity={event.severity} /> {STATUS_LABEL[event.from]}
          <ArrowRight className="activity__arrow" size={12} aria-label="to" />
          {STATUS_LABEL[event.to]}
          <span className="activity__title">{event.title}</span>
        </>
      )
      break
    case 'review':
      text = (
        <>
          {who} {event.state === 'approved' ? 'approved' : 'requested changes on'}{' '}
          <a href={event.url} target="_blank" rel="noreferrer" className="mono">
            #{event.pr}
          </a>{' '}
          by {memberName(data, event.prAuthor)}
          <span className="activity__title">{event.prTitle}</span>
        </>
      )
      break
  }

  return (
    <li className={`activity__item activity--${event.type}`}>
      <span className="activity__icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="activity__text">{text}</span>
      <span className="activity__meta">
        {'sha' in event && (
          <a className="mono activity__sha" href={`https://github.com/${data.repo}/commit/${event.sha}`} target="_blank" rel="noreferrer">
            {event.sha}
          </a>
        )}
        {showTime && <time dateTime={event.date}>{relative ?? formatTime(event.date)}</time>}
      </span>
    </li>
  )
}

function FindingRef({ id, severity }: { id: string; severity: Severity }) {
  return (
    <Link to={`/findings/${id}`} className="finding-ref mono">
      <SeverityGlyph severity={severity} />
      {id}
    </Link>
  )
}
