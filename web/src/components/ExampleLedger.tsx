import { ScoreLedger } from './ScoreLedger'
import { computeLedger } from '../lib/ledger'
import { pendingSignals } from '../lib/signals'
import type { Signal } from '../lib/types'

/** Illustrative ledger for the landing and /how pages: four resolved signals, the rest unknown. */
export function ExampleLedger() {
  const ex: Record<string, Partial<Signal>> = {
    S1: { status: 'fail', weight_applied: 40 }, S2: { status: 'fail', weight_applied: 15 }, S3: { status: 'fail', weight_applied: 20 },
    S5: { status: 'pass', weight_applied: 0 }, S7: { status: 'pass', weight_applied: -10 }, S9: { status: 'fail', weight_applied: 10 }, S10: { status: 'pass', weight_applied: 0 },
  }
  const signals = pendingSignals().map((s) => ({ ...s, status: 'unknown' as const, ...(ex[s.code] ?? {}) }))
  const ledger = computeLedger(signals, { score: 100, band: 'red', label: 'HIGH RISK', confidence: 'medium', resolved: 7, total: 12, is_final: true, elapsed_ms: 9000, limited: false })
  return <ScoreLedger ledger={ledger} isFinal title="Example score ledger" />
}
