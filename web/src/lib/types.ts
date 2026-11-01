export type Band = 'green' | 'amber' | 'red'
export type SignalStatus = 'pass' | 'fail' | 'unknown' | 'pending'

export interface Evidence { title: string; url: string; snippet?: string; fetched_at?: string }

export interface Signal {
  code: string
  name: string
  status: SignalStatus
  weight_applied: number
  summary: string
  evidence: Evidence[]
  source?: string
  tags?: string[]
  started_at?: string | null
  finished_at?: string | null
  elapsed_ms?: number | null
}

export interface Verdict {
  score: number
  band: Band
  label: 'LIKELY GENUINE' | 'BE CAREFUL' | 'HIGH RISK'
  confidence: 'low' | 'medium' | 'high'
  resolved: number
  total: number
  is_final: boolean
  elapsed_ms: number
  limited: boolean
  rule_score?: number
  judge?: {
    band?: Band
    score: number
    confidence?: 'low' | 'medium' | 'high'
    reasoning: string
    misreads?: { signal: string; reason: string }[]
    verified_facts?: string[]
    applied_delta?: number
  } | null
}

export interface Receipt { signal: string; finding: string; source_url?: string | null }

export interface Explanation {
  headline: string
  summary: string
  receipts: Receipt[]
  next_steps: string[]
  share_text?: string
}

export type HostCategory = 'company' | 'job_board' | 'social' | 'messaging' | 'form_or_doc' | 'shortener' | 'free_host' | 'payment' | 'reference' | 'free_mail'
export interface HostInfo { host: string; category: HostCategory | string }
export interface KnownBrand { name: string; official_domains: string[] }

export interface Extraction {
  company_name?: string | null
  claimed_official_domain?: string | null
  role_title?: string | null
  location?: string | null
  salary_text?: string | null
  hosts?: HostInfo[] | null
  known_brand?: KnownBrand | null
  [k: string]: unknown
}

export interface CheckDetail {
  listing_unavailable?: boolean
  check_id: string
  status: 'running' | 'done'
  created_at: string
  duration_ms?: number | null
  extraction?: Extraction | null
  signals: Signal[]
  verdict: Verdict | null
  explanation: Explanation | null
}

export interface RecentItem {
  check_id: string
  company_name: string
  band: Band
  score: number
  created_at: string
  status?: string
}

export interface User { id: string; email: string; name: string; picture?: string }

export interface ResearchFinding { title: string; detail: string; sources?: string[] }
export interface ResearchReport { summary: string; findings: ResearchFinding[]; sources?: { title: string; url: string }[] }
export interface ResearchState {
  status: 'idle' | 'running' | 'done' | 'failed'
  started_at?: string | null
  finished_at?: string | null
  progress?: { at?: string; text: string }[]
  report?: ResearchReport | null
}
export interface Screenshot { signal: string; url: string; image_url: string; taken_at?: string }

export interface Stats {
  checks_total?: number; checks_today?: number; checks_month?: number; high_risk?: number; avg_first_verdict_ms?: number | null
  deep_checks?: number; agent_runs?: number; research_runs?: number; per_day?: { date: string; count: number }[]
}
export interface Watch { id: string; check_id?: string; company_name?: string; role_title?: string; url: string; status: string; created_at: string; last_event_at?: string | null }
export interface Settings {
  preferences?: { country?: string; language?: string; deep_agent?: boolean; auto_research?: boolean; theme?: 'dark' | 'light' }
  notifications?: { final_verdict?: boolean; watch_trigger?: boolean; weekly_digest?: boolean }
}
export interface ApiKey { id: string; name: string; prefix?: string; created_at: string; last_used_at?: string | null }
