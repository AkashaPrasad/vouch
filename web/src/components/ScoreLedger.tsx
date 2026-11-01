import { motion, useReducedMotion } from 'framer-motion'
import type { Ledger } from '../lib/ledger'
import { SIGNAL_ICON } from './SignalGraphic'

const W = 1000, GUT_L = 112, GUT_R = 44, ROW = 18, RULER_H = 44
const C = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', faint: 'var(--text-faint)', border: 'var(--border)', strong: 'var(--border-strong)', text: 'var(--text)', accent: 'var(--accent)', muted: 'var(--text-muted)', surface: 'var(--surface)' }
const x = (v: number) => GUT_L + (v / 100) * (W - GUT_L - GUT_R)

/** Flat waterfall ledger: 0–100 ruler with band zones, one row per signal, bar from running total to next, final marker. Pure SVG. */
export function ScoreLedger({ ledger, isFinal, compact = false, title = 'Score ledger' }: { ledger: Ledger; isFinal: boolean; compact?: boolean; title?: string }) {
  const reduce = useReducedMotion()
  const rows = ledger.rows
  const H = RULER_H + rows.length * ROW + 30
  const finalX = x(ledger.final)
  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${ledger.final} of 100`} className="block w-full min-w-[640px]" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
      {/* band zones */}
      <rect x={x(0)} y={14} width={x(29.99) - x(0)} height={18} fill="var(--green-soft)" />
      <rect x={x(30)} y={14} width={x(59.99) - x(30)} height={18} fill="var(--amber-soft)" />
      <rect x={x(60)} y={14} width={x(100) - x(60)} height={18} fill="var(--red-soft)" />
      {[0, 30, 50, 60, 100].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={10} y2={36} stroke={t === 50 ? C.strong : C.border} strokeWidth={1} />
          <text x={x(t)} y={8} fontSize={10} fill={C.faint} textAnchor={t === 0 ? 'start' : t === 100 ? 'end' : 'middle'}>{t}</text>
        </g>
      ))}
      <text x={x(15)} y={27} fontSize={9} fill={C.green} textAnchor="middle" letterSpacing={1}>GENUINE</text>
      <text x={x(45)} y={27} fontSize={9} fill={C.amber} textAnchor="middle" letterSpacing={1}>CAREFUL</text>
      <text x={x(80)} y={27} fontSize={9} fill={C.red} textAnchor="middle" letterSpacing={1}>HIGH RISK</text>
      {/* baseline 50 */}
      <line x1={x(50)} x2={x(50)} y1={RULER_H} y2={H - 26} stroke={C.strong} strokeWidth={1} strokeDasharray="2 3" />
      <text x={GUT_L - 8} y={RULER_H - 6} fontSize={9} fill={C.faint} textAnchor="end" letterSpacing={1}>SIGNAL</text>
      <text x={x(50)} y={RULER_H - 6} fontSize={9} fill={C.faint} textAnchor="middle" letterSpacing={1}>START 50</text>
      {/* rows */}
      {rows.map((r, i) => {
        const y = RULER_H + i * ROW
        const resolved = r.status === 'pass' || r.status === 'fail'
        const col = r.weight > 0 ? C.red : r.weight < 0 ? C.green : C.faint
        const bx = Math.min(x(r.from), x(r.to)), bw = Math.abs(x(r.to) - x(r.from))
        const label = resolved ? (r.weight > 0 ? `+${r.weight}` : r.weight < 0 ? `−${Math.abs(r.weight)}` : '0') : r.status === 'unknown' ? '?' : '…'
        return (
          <g key={r.code}>
            {(() => { const I = SIGNAL_ICON[r.code]; return I ? <I x={8} y={y + 2} width={12} height={12} stroke={resolved ? col : C.faint} strokeWidth={1.75} /> : null })()}
            <text x={26} y={y + 12} fontSize={10} fill={resolved ? C.text : C.faint}>{r.code}</text>
            <text x={GUT_L - 8} y={y + 12} fontSize={10} fill={resolved ? col : C.faint} textAnchor="end">{label}</text>
            {i > 0 && resolved && r.weight !== 0 && <line x1={x(r.from)} x2={x(r.from)} y1={y - 4} y2={y + 14} stroke={C.strong} strokeWidth={1} />}
            {resolved && r.weight !== 0 ? (
              <motion.rect x={bx} y={y + 3} height={ROW - 8} fill={col} style={{ transformOrigin: `${r.weight > 0 ? bx : bx + bw}px ${y}px` }}
                initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(i * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }} width={bw} />
            ) : resolved ? (
              <rect x={x(r.from) - 2} y={y + 3} width={4} height={ROW - 8} fill={C.strong} />
            ) : (
              <rect x={x(r.from) - 3} y={y + 4} width={6} height={ROW - 10} fill="none" stroke={r.status === 'unknown' ? C.strong : C.border} strokeWidth={1} strokeDasharray={r.status === 'pending' ? '2 2' : undefined} />
            )}
          </g>
        )
      })}
      {/* floor marker */}
      {ledger.floor != null && (
        <g>
          <line x1={x(ledger.floor)} x2={x(ledger.floor)} y1={RULER_H - 2} y2={H - 26} stroke={C.amber} strokeWidth={1} strokeDasharray="4 3" />
          <text x={x(ledger.floor) + 5} y={H - 30} fontSize={9} fill={C.amber} letterSpacing={1}>FLOOR {ledger.floor}</text>
        </g>
      )}
      {/* final marker */}
      <motion.g initial={false} animate={{ x: 0 }}>
        <line x1={finalX} x2={finalX} y1={RULER_H - 2} y2={H - 18} stroke={isFinal ? C.accent : C.text} strokeWidth={2} />
        <rect x={finalX - 22} y={H - 18} width={44} height={16} fill={isFinal ? C.accent : C.strong} />
        <text x={finalX} y={H - 6} fontSize={11} fontWeight={700} fill={isFinal ? 'var(--accent-ink)' : C.text} textAnchor="middle">{ledger.final}</text>
      </motion.g>
      {!compact && <text x={10} y={H - 6} fontSize={9} fill={C.faint} letterSpacing={1}>{isFinal ? 'FINAL' : 'RUNNING'} {ledger.final}</text>}
    </svg></div>
  )
}
