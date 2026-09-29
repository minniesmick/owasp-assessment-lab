import type { DashboardData, Finding, FindingStatus, OwaspCode, Severity } from './types'

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
export const STATUSES: FindingStatus[] = ['draft', 'confirmed', 'reviewed']

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
}

export const STATUS_LABEL: Record<FindingStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  reviewed: 'Reviewed',
}

export function severityRank(s: Severity) {
  return SEVERITIES.indexOf(s)
}

export function byRisk(a: Finding, b: Finding) {
  return (b.cvssScore ?? -1) - (a.cvssScore ?? -1) || severityRank(a.severity) - severityRank(b.severity) || a.id.localeCompare(b.id)
}

export function countBy<T, K extends string>(items: T[], key: (item: T) => K): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  for (const item of items) {
    const k = key(item)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

/** Union of solved challenge keys across all members. */
export function solvedKeys(data: DashboardData): Set<string> {
  const keys = new Set<string>()
  for (const p of Object.values(data.progress)) p.solved.forEach((k) => keys.add(k))
  return keys
}

export function challengeTotals(data: DashboardData): Record<string, number> {
  return countBy(data.challenges, (c) => c.owasp) as Record<string, number>
}

export type CoverageState = 'not-started' | 'in-progress' | 'documented' | 'reviewed'

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  'not-started': 'Not started',
  'in-progress': 'Challenges only',
  documented: 'Documented',
  reviewed: 'Reviewed',
}

export interface CategoryCoverage {
  code: OwaspCode
  name: string
  owners: string[]
  solved: number
  total: number
  findings: Finding[]
  writeups: number
  state: CoverageState
}

export function coverage(data: DashboardData): CategoryCoverage[] {
  const solved = solvedKeys(data)
  return data.owasp.map(({ code, name }) => {
    const challenges = data.challenges.filter((c) => c.owasp === code)
    const findings = data.findings.filter((f) => f.owasp === code)
    const jsFindings = findings.filter((f) => f.source === 'juice-shop')
    const solvedCount = challenges.filter((c) => solved.has(c.key)).length
    let state: CoverageState = 'not-started'
    if (findings.some((f) => f.status === 'reviewed')) state = 'reviewed'
    else if (findings.some((f) => f.status === 'confirmed')) state = 'documented'
    else if (solvedCount > 0 || jsFindings.length > 0) state = 'in-progress'
    return {
      code,
      name,
      owners: data.team.filter((m) => m.owasp.includes(code)).map((m) => m.id),
      solved: solvedCount,
      total: challenges.length,
      findings,
      writeups: findings.filter((f) => f.source === 'portswigger').length,
      state,
    }
  })
}

export interface MemberStats {
  ownedSolved: number
  ownedTotal: number
  solvedAll: number
  findings: Finding[]
  byStatus: Record<FindingStatus, number>
  writeups: number
  reviewsGiven: number | null
  lastActive: string | null
}

export function memberStats(data: DashboardData, memberId: string): MemberStats {
  const member = data.team.find((m) => m.id === memberId)!
  const solved = new Set(data.progress[memberId]?.solved ?? [])
  const owned = data.challenges.filter((c) => member.owasp.includes(c.owasp as OwaspCode))
  const findings = data.findings.filter((f) => f.testerId === memberId)
  const byStatus = { draft: 0, confirmed: 0, reviewed: 0 }
  findings.forEach((f) => {
    if (f.status in byStatus) byStatus[f.status] += 1
  })
  const events = data.activity.filter((e) => e.member === memberId || ('author' in e && e.author === memberId))
  return {
    ownedSolved: owned.filter((c) => solved.has(c.key)).length,
    ownedTotal: owned.length,
    solvedAll: solved.size,
    findings,
    byStatus,
    writeups: findings.filter((f) => f.source === 'portswigger').length,
    reviewsGiven: data.reviewsAvailable
      ? data.activity.filter((e) => e.type === 'review' && e.member === memberId).length
      : null,
    lastActive: events.reduce<string | null>((latest, e) => (!latest || e.date > latest ? e.date : latest), null),
  }
}

export function memberName(data: DashboardData, id: string | null | undefined): string {
  if (!id) return 'Unknown'
  return data.team.find((m) => m.id === id)?.name ?? id
}
