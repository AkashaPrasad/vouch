import { GROUP_LABEL, groupOf, type SourceGroup } from '../lib/signals'
import type { Signal } from '../lib/types'

const W = 1000, GUT_L = 150, GUT_R = 30, ROW = 22
const GROUPS: SourceGroup[] = ['message', 'records', 'web', 'agent']
const C = { faint: 'var(--text-faint)', border: 'var(--border)', strong: 'var(--border-strong)', text: 'var(--text)', green: 'var(--green)', red: 'var(--red)', accent: 'var(--accent)' }
let MAX = 75000
const x = (ms: number) => GUT_L + (Math.min(ms, MAX) / MAX) * (W - GUT_L - GUT_R)

/** Horizontal fan-out timeline: a tick per signal at its elapsed time, one row per source group. */
export function SignalTimeline({ signals, nowMs }: { signals: Signal[]; nowMs: number }) {
  MAX = Math.max(75000, nowMs, ...signals.map((s) => s.elapsed_ms || 0)) > 75000 ? 180000 : 75000
  const H = 18 + GROUPS.length * ROW + 10
  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="When each signal resolved" className="block w-full min-w-[640px]" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
      {(MAX > 75000 ? [0, 8, 30, 60, 120, 180] : [0, 8, 30, 60, 75]).map((s) => (
        <g key={s}>
          <line x1={x(s * 1000)} x2={x(s * 1000)} y1={14} y2={H - 8} stroke={C.border} strokeWidth={1} />
          <text x={x(s * 1000)} y={9} fontSize={9} fill={C.faint} textAnchor="middle">{s}s</text>
        </g>
      ))}
      {nowMs < MAX && <line x1={x(nowMs)} x2={x(nowMs)} y1={14} y2={H - 8} stroke={C.accent} strokeWidth={1} />}
      {GROUPS.map((g, gi) => {
        const y = 18 + gi * ROW
        const items = signals.filter((s) => groupOf(s) === g)
        return (
          <g key={g}>
            <text x={10} y={y + 14} fontSize={10} fill={C.faint}>{GROUP_LABEL[g]}</text>
            <line x1={GUT_L} x2={W - GUT_R} y1={y + 11} y2={y + 11} stroke={C.border} strokeWidth={1} />
            {items.map((s) => {
              const resolved = s.status === 'pass' || s.status === 'fail' || s.status === 'unknown'
              const ms = resolved && s.elapsed_ms != null ? s.elapsed_ms : nowMs
              const col = s.status === 'fail' ? C.red : s.status === 'pass' ? C.green : C.strong
              return (
                <g key={s.code}>
                  {resolved ? <rect x={x(ms) - 3} y={y + 5} width={6} height={12} fill={col} /> : <rect x={x(ms) - 3} y={y + 5} width={6} height={12} fill="none" stroke={C.strong} strokeDasharray="2 2" />}
                  <text x={x(ms)} y={y + 3} fontSize={8} fill={resolved ? C.text : C.faint} textAnchor="middle">{s.code}</text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg></div>
  )
}
