import type { Signal } from './types'

export interface SignalMeta { code: string; name: string; what: string; range: string; min: number; max: number; tool: string; group: SourceGroup; agent?: boolean }
export type SourceGroup = 'message' | 'records' | 'web' | 'agent'

export const GROUP_LABEL: Record<SourceGroup, string> = { message: 'Message analysis', records: 'Domain records', web: 'TinyFish Search / Fetch', agent: 'TinyFish Agent' }

export const SIGNALS: SignalMeta[] = [
  { code: 'S1', name: 'Money asked', what: 'Any fee, deposit, kit, "refundable" amount, UPI or payment link before joining.', range: '0 / +40', min: 0, max: 40, tool: 'Haiku + regex', group: 'message' },
  { code: 'S2', name: 'Sender domain', what: 'Sender on the real company domain, a lookalike, free mail, or only a platform.', range: '−30 / +30', min: -30, max: 30, tool: 'TinyFish Search', group: 'web' },
  { code: 'S3', name: 'Domain age', what: 'Company domain registered weeks ago is a classic pattern. Platforms never count.', range: '−10 / +30', min: -10, max: 30, tool: 'RDAP', group: 'records' },
  { code: 'S4', name: 'Mail & web records', what: 'Does the company domain have mail (MX) and web (A) records?', range: '0 / +15', min: 0, max: 15, tool: 'DNS over HTTPS', group: 'records' },
  { code: 'S5', name: 'Scam reports', what: 'Public reports naming this company, number or recruiter.', range: '0 / +25', min: 0, max: 25, tool: 'TinyFish Search', group: 'web' },
  { code: 'S6', name: 'Cybercrime suspect registry', what: 'Phone, email or UPI id checked on cybercrime.gov.in.', range: '−5 / +40', min: -5, max: 40, tool: 'TinyFish Agent', group: 'agent', agent: true },
  { code: 'S7', name: 'Company registry (MCA)', what: 'Registered with MCA, and active, struck off or missing?', range: '−10 / +30', min: -10, max: 30, tool: 'Search → Fetch → Agent', group: 'agent', agent: true },
  { code: 'S8', name: 'Role on careers page', what: 'Is this role on the official careers site?', range: '−20 / +10', min: -20, max: 10, tool: 'Fetch → Agent', group: 'agent', agent: true },
  { code: 'S9', name: 'Contact channel', what: 'Only WhatsApp, Telegram or a form, with no company email.', range: '0 / +10', min: 0, max: 10, tool: 'Haiku + regex', group: 'message' },
  { code: 'S10', name: 'Pressure & too-good-to-be-true', what: 'Deadlines, no interview, pay far above market, task schemes.', range: '0 / +10', min: 0, max: 10, tool: 'Haiku + regex', group: 'message' },
  { code: 'S11', name: 'Site consistency', what: 'Linked site loads and matches the official site.', range: '0 / +15', min: 0, max: 15, tool: 'TinyFish Fetch', group: 'web' },
  { code: 'S12', name: 'URL reputation', what: 'Links on abuse lists; shorteners that hide the destination.', range: '0 / +30', min: 0, max: 30, tool: 'URLhaus', group: 'records' },
]

export const META = new Map(SIGNALS.map((s) => [s.code, s]))
export const AGENT_CODES = new Set(['S6', 'S7', 'S8'])

export function groupOf(s: Signal): SourceGroup {
  const src = s.source || ''
  if (src.includes('agent')) return 'agent'
  if (src.includes('tinyfish')) return 'web'
  if (src === 'rdap' || src === 'dns' || src === 'urlhaus') return 'records'
  if (src === 'haiku' || src === 'regex') return 'message'
  return META.get(s.code)?.group ?? 'message'
}

export function pendingSignals(): Signal[] {
  return SIGNALS.map((s) => ({ code: s.code, name: s.name, status: 'pending', weight_applied: 0, summary: '', evidence: [] }))
}

export function mergeSignals(base: Signal[], incoming: Signal[]): Signal[] {
  const map = new Map(base.map((s) => [s.code, s]))
  for (const s of incoming) map.set(s.code, { ...map.get(s.code), ...s })
  return SIGNALS.map((m) => map.get(m.code) ?? { code: m.code, name: m.name, status: 'pending', weight_applied: 0, summary: '', evidence: [] })
}

export const TAG_LABEL: Record<string, string> = {
  lookalike: 'lookalike', impersonation: 'impersonation', free_mail: 'free mail', mismatch: 'mismatch', exact: 'exact match',
  platform_only: 'platform only', free_host: 'free host', shortener: 'shortener', struck_off: 'struck off', known_brand: 'known brand', task_scam: 'task scam', money_mule: 'money mule',
}
