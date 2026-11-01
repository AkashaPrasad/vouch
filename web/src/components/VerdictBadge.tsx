import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Band } from '../lib/types'

export const BAND = {
  green: { label: 'LIKELY GENUINE', Icon: ShieldCheck, text: 'text-green', bg: 'bg-[var(--green-soft)]', border: 'border-green/40', hex: '#4ADE80' },
  amber: { label: 'BE CAREFUL', Icon: AlertTriangle, text: 'text-amber', bg: 'bg-[var(--amber-soft)]', border: 'border-amber/40', hex: '#FBBF24' },
  red: { label: 'HIGH RISK', Icon: ShieldAlert, text: 'text-red', bg: 'bg-[var(--red-soft)]', border: 'border-red/40', hex: '#F87171' },
} as const

export function VerdictBadge({ band, label, size = 'md' }: { band: Band; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const b = BAND[band] ?? BAND.amber
  const sz = size === 'lg' ? 'px-4 py-2 text-base gap-2' : size === 'sm' ? 'px-2.5 py-0.5 text-[11px] gap-1' : 'px-3 py-1 text-sm gap-1.5'
  const icon = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold tracking-wide ${b.text} ${b.bg} ${b.border} ${sz}`}
      style={size === 'lg' ? { boxShadow: `0 0 32px ${b.hex}22` } : undefined}>
      <b.Icon className={icon} strokeWidth={1.5} aria-hidden />
      {label ?? b.label}
    </span>
  )
}
