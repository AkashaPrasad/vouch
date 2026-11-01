import type { Signal } from '../lib/types'

const FILL: Record<Signal['status'], string> = { pass: 'bg-green', fail: 'bg-red', unknown: 'bg-border-strong', pending: 'bg-transparent border border-dashed border-border-strong' }

/** 12 squares, one per signal; fills as results land; each is a scroll anchor to its ledger row. */
export function SignalStrip({ signals }: { signals: Signal[] }) {
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-2" aria-label="Signal status overview">
      {signals.map((s) => (
        <li key={s.code}>
          <a href={`#sig-${s.code}`} className="flex min-h-[44px] min-w-[32px] flex-col items-center justify-center gap-1.5" title={`${s.code} ${s.name}: ${s.status}`}>
            <span className={`block h-3.5 w-3.5 ${FILL[s.status]} ${s.status === 'pass' && s.weight_applied === 0 ? 'opacity-60' : ''}`} aria-hidden />
            <span className="font-mono text-[10px] text-faint">{s.code}</span>
            <span className="sr-only">{s.name}: {s.status}</span>
          </a>
        </li>
      ))}
    </ol>
  )
}
