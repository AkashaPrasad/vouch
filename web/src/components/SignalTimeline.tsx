import { GROUP_LABEL, groupOf, type SourceGroup } from '../lib/signals'
import type { Signal } from '../lib/types'

const W = 1000, GUT_L = 160, GUT_R = 36, ROW = 34, TOP = 26
const GROUPS: SourceGroup[] = ['message', 'records', 'web', 'agent']
const C = { faint: 'var(--text-faint)', muted: 'var(--text-muted)', border: 'var(--border)', strong: 'var(--border-strong)', text: 'var(--text)', green: 'var(--green)', red: 'var(--red)', accent: 'var(--accent)' }

/** Picks an axis span and tick steps that fit the slowest signal (or the running clock). */
function axisFor(maxMs: number): { span: number; ticks: number[] } {
  const s = Math.ceil(maxMs / 1000)
  if (s <= 30) return { span: 30, ticks: [0, 5, 10, 15, 20, 25, 30] }
  if (s <= 60) return { span: 60, ticks: [0, 10, 20, 30, 40, 50, 60] }
  if (s <= 90) return { span: 90, ticks: [0, 15, 30, 45, 60, 75, 90] }
  if (s <= 120) return { span: 120, ticks: [0, 20, 40, 60, 80, 100, 120] }
  return { span: 180, ticks: [0, 30, 60, 90, 120, 150, 180] }
}

type Mark = { code: string; ms: number; resolved: boolean; status: Signal['status'] }

/** Spreads labels that would overlap: same lane, closer than `minGap` px, get pushed right in order. */
function layout(marks: Mark[], xOf: (ms: number) => number, minGap: number): (Mark & { x: number; lx: number })[] {
  const sorted = [...marks].sort((a, b) => a.ms - b.ms)
  let lastLabel = -Infinity
  return sorted.map((m) => {
    const x = xOf(m.ms)
    const lx = Math.max(x, lastLabel + minGap)
    lastLabel = lx
    return { ...m, x, lx }
  })
}

/** Horizontal fan-out timeline: one lane per source group, a tick per signal at the moment it resolved. */
export function SignalTimeline({ signals, nowMs }: { signals: Signal[]; nowMs: number }) {
  const slowest = Math.max(nowMs, ...signals.map((s) => s.elapsed_ms || 0))
  const { span, ticks } = axisFor(slowest)
  const MAX = span * 1000
  const x = (ms: number) => GUT_L + (Math.min(ms, MAX) / MAX) * (W - GUT_L - GUT_R)
  const H = TOP + GROUPS.length * ROW + 8
  const running = signals.some((s) => s.status === 'pending')
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`When each signal resolved, 0 to ${span} seconds`} className="block w-full min-w-[640px]" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
        {ticks.map((s) => (
          <g key={s}>
            <line x1={x(s * 1000)} x2={x(s * 1000)} y1={TOP - 6} y2={H - 6} stroke={C.border} strokeWidth={1} />
            <text x={x(s * 1000)} y={11} fontSize={10} fill={C.faint} textAnchor="middle">{s}s</text>
          </g>
        ))}
        {running && nowMs < MAX && (
          <g>
            <line x1={x(nowMs)} x2={x(nowMs)} y1={TOP - 6} y2={H - 6} stroke={C.accent} strokeWidth={1.25} />
            <text x={x(nowMs) + 4} y={H - 10} fontSize={9} fill={C.accent}>now {(nowMs / 1000).toFixed(0)}s</text>
          </g>
        )}
        {GROUPS.map((g, gi) => {
          const y = TOP + gi * ROW
          const marks: Mark[] = signals.filter((s) => groupOf(s) === g).map((s) => {
            const resolved = s.status === 'pass' || s.status === 'fail' || s.status === 'unknown'
            return { code: s.code, ms: resolved && s.elapsed_ms != null ? s.elapsed_ms : nowMs, resolved, status: s.status }
          })
          const placed = layout(marks, x, 26)
          return (
            <g key={g}>
              <text x={12} y={y + 20} fontSize={10.5} fill={C.muted}>{GROUP_LABEL[g]}</text>
              <line x1={GUT_L} x2={W - GUT_R} y1={y + 17} y2={y + 17} stroke={C.border} strokeWidth={1} />
              {placed.map((m) => {
                const col = m.status === 'fail' ? C.red : m.status === 'pass' ? C.green : C.strong
                return (
                  <g key={m.code}>
                    {m.lx !== m.x && <line x1={m.x} x2={m.lx} y1={y + 17} y2={y + 6} stroke={C.strong} strokeWidth={0.75} />}
                    {m.resolved
                      ? <rect x={m.x - 3} y={y + 11} width={6} height={12} fill={col} />
                      : <rect x={m.x - 3} y={y + 11} width={6} height={12} fill="none" stroke={C.strong} strokeDasharray="2 2" />}
                    <text x={m.lx} y={y + 5} fontSize={9} fill={m.resolved ? C.text : C.faint} textAnchor="middle">{m.code}</text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      <p className="mt-1 font-mono text-[11px] text-faint">0 → {span} s · a tick is the moment a signal resolved; a dashed tick is still running</p>
    </div>
  )
}
