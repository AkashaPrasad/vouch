/** Company profile research: what employees say about working at a company, organised and sourced. */
export type CompanyPlatform = 'reddit' | 'ambitionbox' | 'glassdoor' | 'blind' | 'x' | 'linkedin' | 'news' | 'official'
export type CompanySentiment = 'positive' | 'negative' | 'mixed'
export type CompanyDimensionKey =
  | 'culture' | 'work_life_balance' | 'compensation' | 'management'
  | 'stability_layoffs' | 'freshers_treatment' | 'growth' | 'hiring_process'
export type CompanyJobStatus = 'running' | 'done' | 'failed'

export interface CompanyEvidence {
  quote: string
  source_url: string
  platform: CompanyPlatform | string
  sentiment: CompanySentiment
  date?: string | null
}
export interface CompanyDimension {
  key: CompanyDimensionKey | string
  label: string
  score_0_100: number | null
  summary: string
  evidence: CompanyEvidence[]
}
export interface CompanyReport {
  company: string
  website?: string | null
  as_of: string
  overall: { verdict_text: string; score_0_100: number | null; confidence: string | number | null }
  dimensions: CompanyDimension[]
  layoffs_timeline: { date: string; what: string; source_url?: string | null }[]
  red_flags: { text: string; source_url?: string | null }[]
  green_flags: { text: string; source_url?: string | null }[]
  platforms_covered: { platform: CompanyPlatform | string; items: number; reachable: boolean; note?: string | null }[]
  sources: { title: string; url: string; platform: CompanyPlatform | string }[]
}
export interface CompanyProgress { text: string; at: string }
export interface CompanyJob {
  id: string
  company: string
  status: CompanyJobStatus
  progress: CompanyProgress[]
  report: CompanyReport | null
  error?: string | null
}
/** One entry in the page's local "Recent" list. id === 'sample' links to ?sample=1. */
export interface CompanyRecent { id: string; company: string; at: string }
