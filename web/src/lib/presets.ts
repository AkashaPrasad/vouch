import { api } from './api'
import type { JobPreferences, ParsedPreferences, PresetField } from './types'

/** Used when GET /api/presets is unavailable. */
export const FALLBACK_PRESETS: PresetField[] = [
  { name: 'Engineering', roles: ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Mobile Developer', 'DevOps Engineer', 'QA Engineer', 'Site Reliability Engineer', 'Embedded Engineer', 'Security Engineer'] },
  { name: 'Data & AI', roles: ['Data Analyst', 'Data Scientist', 'Data Engineer', 'Machine Learning Engineer', 'AI Engineer', 'Business Intelligence Analyst'] },
  { name: 'Product', roles: ['Product Manager', 'Associate Product Manager', 'Product Analyst', 'Technical Program Manager'] },
  { name: 'Design', roles: ['Product Designer', 'UI/UX Designer', 'UX Researcher', 'Graphic Designer'] },
  { name: 'Marketing', roles: ['Digital Marketing Executive', 'Content Writer', 'SEO Specialist', 'Growth Marketer', 'Social Media Manager'] },
  { name: 'Sales', roles: ['Business Development Executive', 'Sales Development Representative', 'Account Executive', 'Inside Sales Associate'] },
  { name: 'Operations', roles: ['Operations Associate', 'Supply Chain Analyst', 'Project Coordinator', 'Business Analyst'] },
  { name: 'Finance', roles: ['Financial Analyst', 'Accountant', 'Audit Associate', 'Investment Analyst'] },
  { name: 'People / HR', roles: ['HR Executive', 'Talent Acquisition Specialist', 'HR Business Partner'] },
  { name: 'Customer Support', roles: ['Customer Support Executive', 'Customer Success Associate', 'Technical Support Engineer'] },
]

type Loose = Record<string, unknown>
const str = (x: unknown): string | null => (typeof x === 'string' ? x : x && typeof x === 'object' ? ((x as Loose).name ?? (x as Loose).label ?? (x as Loose).title ?? (x as Loose).id ?? null) as string | null : null)
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.map(str).filter((v): v is string => !!v) : [])

/** Accepts {fields:[{name,roles}]}, {fields:[...], roles:{field:[...]}} or {fields:[...], roles:[{title, field}]}. */
export function normalizePresets(raw: unknown): PresetField[] {
  if (!raw || typeof raw !== 'object') return []
  const r = raw as Loose
  const fieldsRaw = Array.isArray(r.fields) ? r.fields : Array.isArray(raw) ? (raw as unknown[]) : []
  const out: PresetField[] = fieldsRaw.map((f) => ({ name: str(f) ?? '', roles: f && typeof f === 'object' ? strs((f as Loose).roles) : [] })).filter((f) => f.name)
  const roles = r.roles
  if (roles && typeof roles === 'object' && !Array.isArray(roles)) {
    for (const [k, v] of Object.entries(roles as Loose)) { const f = out.find((x) => x.name === k); if (f) f.roles = [...new Set([...f.roles, ...strs(v)])]; else out.push({ name: k, roles: strs(v) }) }
  } else if (Array.isArray(roles)) {
    for (const item of roles) {
      const title = str(item); if (!title) continue
      const field = item && typeof item === 'object' ? (str((item as Loose).field) ?? 'Other') : 'Other'
      const f = out.find((x) => x.name === field); if (f) { if (!f.roles.includes(title)) f.roles.push(title) } else out.push({ name: field, roles: [title] })
    }
  }
  return out
}

export async function loadPresets(): Promise<PresetField[]> {
  try { const p = normalizePresets(await api.presets()); return p.length ? p : FALLBACK_PRESETS } catch { return FALLBACK_PRESETS }
}

/** The save/get response may carry the parsed result as `parsed` or `summary`. */
export function parsedOf(r?: JobPreferences | null): ParsedPreferences | null {
  if (!r) return null
  const p = r.parsed ?? (r as Loose).summary
  return p && typeof p === 'object' ? (p as ParsedPreferences) : null
}
