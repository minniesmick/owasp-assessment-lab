// Shape of public/data.json, produced by scripts/build_dashboard_data.py.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type FindingStatus = 'draft' | 'confirmed' | 'reviewed'
export type OwaspCode = 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07' | 'A08' | 'A09' | 'A10'
export type Source = 'juice-shop' | 'portswigger'

export interface Member {
  id: string
  name: string
  github: string | null
  role: string
  owasp: OwaspCode[]
}

export interface Challenge {
  key: string
  name: string
  category: string
  owasp: OwaspCode | '-'
  difficulty: number
}

export interface Finding {
  id: string
  title: string
  source: Source
  target: string
  owasp: OwaspCode
  cwe: string
  severity: Severity
  cvssVector: string
  cvssScore: number | null
  cvss: { base: number; impact: number; exploitability: number } | null
  tester: string
  testerId: string | null
  tools: string[]
  date: string
  status: FindingStatus
  evidence: string[]
  file: string
  url: string
  body: string
}

interface EventBase {
  date: string
  member: string | null
}

export interface ChallengesEvent extends EventBase {
  type: 'challenges'
  sha: string
  author: string
  count: number
  byOwasp: Record<string, number>
  challenges: string[]
}

export interface FindingAddedEvent extends EventBase {
  type: 'finding_added'
  sha: string
  author: string
  findingId: string
  title: string
  severity: Severity
  owasp: OwaspCode
  status: FindingStatus
}

export interface FindingStatusEvent extends EventBase {
  type: 'finding_status'
  sha: string
  author: string
  findingId: string
  title: string
  severity: Severity
  owasp: OwaspCode
  from: FindingStatus
  to: FindingStatus
}

export interface ReviewEvent extends EventBase {
  type: 'review'
  state: 'approved' | 'changes_requested'
  prAuthor: string | null
  pr: number
  prTitle: string
  url: string
}

export type ActivityEvent = ChallengesEvent | FindingAddedEvent | FindingStatusEvent | ReviewEvent

export interface DashboardData {
  generatedAt: string
  repo: string
  commit: { sha: string; short: string; date: string; url: string }
  juiceShopVersion: string
  owasp: { code: OwaspCode; name: string }[]
  team: Member[]
  challenges: Challenge[]
  progress: Record<string, { savedAt: string | null; solved: string[] }>
  findings: Finding[]
  activity: ActivityEvent[]
  reviewsAvailable: boolean
}
