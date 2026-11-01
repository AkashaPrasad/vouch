import type { WatchCadence, WatchSourceKind, WatchStatus } from './types'

export interface WatchDetailWatch {
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
  scheduler?: string | null
  last_error?: string | null
  created_at?: string | null
}
export interface WatchScheduler {
  kind: 'tinyfish_monitor' | 'in_process'
  monitor_id?: string | null
  cadence?: WatchCadence | null
  next_check_at?: string | null
  last_error?: string | null
}
export interface WatchPreferences {
  titles?: string[]
  skills?: string[]
  locations?: string[]
  seniority?: string | null
  remote?: boolean | string | null
  exclude?: string[]
}
export interface PostingMatch { score: number; reasons?: string[]; missing?: string[] }
export interface WatchDetailPosting { title: string; url: string; location?: string | null; posted?: string | null; fingerprint?: string | null; match?: PostingMatch | null }
export interface WatchSnapshot { taken_at?: string | null; method?: string | null; items: WatchDetailPosting[] }
export interface WatchRun { taken_at: string; method?: string | null; postings_count?: number | null; new_count?: number | null }
export interface WatchDetailAlert {
  id: string
  posting: { title: string; url: string; location?: string | null; posted?: string | null }
  match_score?: number | null
  match_reasons?: string[]
  match_missing?: string[]
  created_at: string
  read_at?: string | null
}
export interface WatchDetail {
  watch: WatchDetailWatch
  scheduler?: WatchScheduler | null
  preferences?: WatchPreferences | null
  threshold?: number | null
  latest?: WatchSnapshot | null
  runs?: WatchRun[]
  alerts?: WatchDetailAlert[]
}
