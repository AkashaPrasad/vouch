import type { Signal, Verdict } from './types'

export interface LedgerRow { code: string; status: Signal['status']; weight: number; from: number; to: number }
export interface Ledger { rows: LedgerRow[]; arithmetic: number; final: number; floor: number | null; floorNote: string | null }

const clamp = (v: number) => Math.max(0, Math.min(100, v))

/** Start at 50; apply each resolved signal in S1..S12 order; clamp; compare with the backend score for hard-rule floors. */
export function computeLedger(signals: Signal[], verdict: Verdict | null): Ledger {
  let running = 50
  const rows: LedgerRow[] = signals.map((s) => {
    const resolved = s.status === 'pass' || s.status === 'fail'
    const w = resolved ? Number(s.weight_applied || 0) : 0
    const from = running
    const to = clamp(running + w)
    running = to
    return { code: s.code, status: s.status, weight: w, from, to }
  })
  const arithmetic = running
  const final = verdict ? verdict.score : arithmetic
  let floor: number | null = null
  let floorNote: string | null = null
  if (verdict && verdict.score > arithmetic) {
    floor = verdict.score
    floorNote = verdict.score >= 60
      ? 'Hard rule: money asked plus a lookalike / impersonated domain, scam report, registry hit or task-scam pattern forces HIGH RISK.'
      : 'Hard rule: a money request or task-scam pattern forces at least BE CAREFUL.'
  }
  return { rows, arithmetic, final, floor, floorNote }
}
