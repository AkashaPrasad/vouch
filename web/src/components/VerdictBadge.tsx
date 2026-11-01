import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Band } from '../lib/types'

export const BAND = {
  green: { label: 'LIKELY GENUINE', Icon: ShieldCheck, text: 'text-green', bg: 'bg-[var(--green-soft)]', border: 'border-green', hex: '#4ADE80' },
  amber: { label: 'BE CAREFUL', Icon: AlertTriangle, text: 'text-amber', bg: 'bg-[var(--amber-soft)]', border: 'border-amber', hex: '#FBBF24' },
  red: { label: 'HIGH RISK', Icon: ShieldAlert, text: 'text-red', bg: 'bg-[var(--red-soft)]', border: 'border-red', hex: '#F87171' },
} as const

/** Flat verdict label: solid colour text on a square-cornered tinted block. */
export function VerdictBadge({ band, label, size = 'md' }: { band: Band; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const b = BAND[band] ?? BAND.amber
  const sz = size === 'lg' ? 'px-3 py-1.5 text-sm gap-2' : size === 'sm' ? 'px-1.5 py-0.5 text-[11px] gap-1' : 'px-2 py-1 text-xs gap-1.5'
  const icon = size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  return (
    <span className={`inline-flex items-center rounded-[2px] border font-mono font-semibold uppercase tracking-[0.06em] ${b.text} ${b.bg} ${b.border} ${sz}`}>
      <b.Icon className={icon} strokeWidth={1.75} aria-hidden />
      {label ?? b.label}
    </span>
  )
}
