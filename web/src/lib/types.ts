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
}

export interface Receipt { signal: string; finding: string; source_url?: string | null }

export interface Explanation {
  headline: string
  summary: string
  receipts: Receipt[]
  next_steps: string[]
  share_text?: string
}

export interface Extraction {
  company_name?: string | null
  claimed_official_domain?: string | null
  role_title?: string | null
  location?: string | null
  salary_text?: string | null
  [k: string]: unknown
}

export interface CheckDetail {
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
