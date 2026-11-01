export type Band = 'green' | 'amber' | 'red' | 'grey'
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
  label: 'LIKELY GENUINE' | 'BE CAREFUL' | 'HIGH RISK' | 'COULD NOT VERIFY'
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
  approval_rate?: number | null
  checks_total?: number; checks_today?: number; checks_month?: number; high_risk?: number; avg_first_verdict_ms?: number | null
  deep_checks?: number; agent_runs?: number; research_runs?: number; per_day?: { date: string; count: number }[]
}
export type WatchSourceKind = 'careers' | 'ats' | 'linkedin_public' | 'linkedin_session' | 'other'
export type WatchCadence = 'daily' | 'twice_daily' | 'hourly'
export type WatchStatus = 'active' | 'paused' | 'error'
export interface Watch {
  id: string
  company_name: string
  source_url: string
  source_kind: WatchSourceKind
  cadence: WatchCadence
  status: WatchStatus
  last_checked_at?: string | null
  postings_count?: number | null
  new_last_run?: number | null
  monitor_id?: string | null
  last_error?: string | null
}
export interface Posting { title: string; url: string; location?: string | null; posted?: string | null; match_score?: number | null; match_reasons?: string[] | null; missing?: string[] | null }
export interface WatchCheckResult { new_postings: Posting[]; alerts_created: number; postings_count: number }
export interface ResumeSummary { skills?: string[]; roles?: string[]; seniority?: string | null; locations?: string[]; years?: number | null }
export interface Resume { text_excerpt?: string; summary: ResumeSummary; updated_at?: string | null }
export interface Alert {
  id: string
  watch_id: string
  company_name: string
  posting: { title: string; url: string; location?: string | null; posted?: string | null }
  match_score: number
  match_reasons?: string[]
  created_at: string
  read_at?: string | null
}
export interface LinkedInState { connected: boolean; profile_id?: string | null }
export interface Settings {
  preferences?: { country?: string; language?: string; deep_agent?: boolean; auto_research?: boolean; theme?: 'dark' | 'light'; match_threshold?: number }
  notifications?: { final_verdict?: boolean; watch_trigger?: boolean; weekly_digest?: boolean }
}
export interface ApiKey { id: string; name: string; prefix?: string; created_at: string; last_used_at?: string | null }
export interface PresetField { name: string; roles: string[] }
export interface ParsedPreferences { titles?: string[]; skills?: string[]; locations?: string[]; seniority?: string | null; remote?: boolean | string | null }
export interface JobPreferences { fields?: string[]; roles?: string[]; free_text?: string; parsed?: ParsedPreferences | null; updated_at?: string | null }
