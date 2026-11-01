import type { Band } from '../lib/types'
import { BAND } from './VerdictBadge'

export function BandPill({ band, score }: { band: Band; score?: number }) {
  const b = BAND[band] ?? BAND.amber
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${b.text} ${b.bg} ${b.border}`}>
      <b.Icon className="h-3 w-3" strokeWidth={1.5} aria-hidden />
      {b.label}
      {score != null && <span className="font-mono font-medium opacity-80">{score}</span>}
    </span>
  )
}
