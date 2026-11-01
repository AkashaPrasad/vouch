import type { Band } from '../lib/types'
import { BAND } from './VerdictBadge'

export function BandPill({ band, score }: { band: Band; score?: number }) {
  const b = BAND[band] ?? BAND.amber
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]">
      <span className="inline-block h-2 w-2" style={{ background: b.hex }} aria-hidden />
      <span className={b.text}>{b.label}</span>
      {score != null && <span className="tnum text-muted">{score}</span>}
    </span>
  )
}
