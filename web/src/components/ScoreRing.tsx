import { motion, useReducedMotion } from 'framer-motion'
import type { Band } from '../lib/types'
import { BAND } from './VerdictBadge'

export function ScoreRing({ score, band, size = 112 }: { score: number | null; band: Band | null; size?: number }) {
  const reduce = useReducedMotion()
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const color = band ? BAND[band].hex : '#3F3F46'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={score == null ? 'Risk score pending' : `Risk score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#27272A" strokeWidth="8" fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-3xl font-semibold tabular-nums leading-none" style={{ color: score == null ? '#71717A' : color }}>{score ?? '--'}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-faint">risk / 100</div>
        </div>
      </div>
    </div>
  )
}
