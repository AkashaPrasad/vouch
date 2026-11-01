import type { Signal } from './types'

export interface SignalMeta { code: string; name: string; what: string; weight: string; tool: string; agent?: boolean }

export const SIGNALS: SignalMeta[] = [
  { code: 'S1', name: 'Money asked', what: 'Any fee, deposit, training kit or "refundable" payment requested before joining.', weight: 'up to +40', tool: 'Message analysis' },
  { code: 'S2', name: 'Sender domain', what: 'Is the sender on the company’s real domain, or a free mail or lookalike address?', weight: 'up to +25', tool: 'TinyFish Search' },
  { code: 'S3', name: 'Domain age', what: 'Websites registered in the last few weeks are a classic scam pattern.', weight: 'up to +20', tool: 'RDAP' },
  { code: 'S4', name: 'Mail & web records', what: 'Does the domain have real mail (MX/SPF) and web records?', weight: 'up to +10', tool: 'DNS' },
  { code: 'S5', name: 'Scam reports', what: 'Public reports of this company, number or recruiter being a scam.', weight: 'up to +30', tool: 'TinyFish Search' },
  { code: 'S6', name: 'Cybercrime suspect registry', what: 'Checks contacts against the national cybercrime suspect lookup.', weight: 'up to +35', tool: 'TinyFish Agent', agent: true },
  { code: 'S7', name: 'Company registry (MCA)', what: 'Is the company actually registered, and is it active?', weight: '−15 to +20', tool: 'TinyFish Agent', agent: true },
  { code: 'S8', name: 'Role on careers page', what: 'Is this exact role listed on the company’s official careers page?', weight: '−20 to +10', tool: 'TinyFish Agent', agent: true },
  { code: 'S9', name: 'Contact channel', what: 'Hiring only over WhatsApp or Telegram, with no official email, is a risk signal.', weight: 'up to +15', tool: 'Message analysis' },
  { code: 'S10', name: 'Pressure & too-good-to-be-true', what: 'Urgency, no interview, salary far above market for the role.', weight: 'up to +20', tool: 'Message analysis' },
  { code: 'S11', name: 'Site consistency', what: 'Does the company website match what the message claims?', weight: '−10 to +15', tool: 'TinyFish Fetch' },
  { code: 'S12', name: 'URL reputation', what: 'Links in the message checked against known malware and phishing lists.', weight: 'up to +30', tool: 'URLhaus' },
]

export const AGENT_CODES = new Set(['S6', 'S7', 'S8'])

export function pendingSignals(): Signal[] {
  return SIGNALS.map((s) => ({ code: s.code, name: s.name, status: 'pending', weight_applied: 0, summary: '', evidence: [] }))
}

export function mergeSignals(base: Signal[], incoming: Signal[]): Signal[] {
  const map = new Map(base.map((s) => [s.code, s]))
  for (const s of incoming) map.set(s.code, { ...map.get(s.code), ...s })
  return SIGNALS.map((m) => map.get(m.code) ?? { code: m.code, name: m.name, status: 'pending', weight_applied: 0, summary: '', evidence: [] })
}
