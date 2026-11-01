import { Brain } from 'lucide-react'
import type { Verdict } from '../lib/types'
import { BandPill } from './BandPill'

/** Claude's reasoned read of the evidence: shown next to the rule-engine score, with any signals it argues were misread. */
export function JudgePanel({ verdict }: { verdict: Verdict | null }) {
  const j = verdict?.judge
  if (!j) return null
  const delta = j.applied_delta ?? 0
  return (
    <section aria-labelledby="judge-h" className="mt-8">
      <div className="flex items-end justify-between border-b border-border pb-2">
        <div><p className="label">Second opinion</p><h2 id="judge-h" className="mt-1 text-base font-semibold">Reasoned read of the evidence</h2></div>
        <p className="font-mono text-[11px] text-faint">Claude Haiku · bounded ±25 · hard rules kept</p>
      </div>
      <div className="mt-3 grid gap-4 border border-border bg-surface p-4 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-3 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4">
          <div className="flex items-center gap-2 text-muted"><Brain className="h-4 w-4" strokeWidth={1.5} aria-hidden /><span className="label">Its verdict</span></div>
          {j.band && <BandPill band={j.band} />}
          <dl className="grid grid-cols-2 gap-y-1 font-mono text-xs">
            <dt className="text-faint">rule score</dt><dd className="text-text">{verdict?.rule_score ?? '—'}</dd>
            <dt className="text-faint">its score</dt><dd className="text-text">{j.score}</dd>
            <dt className="text-faint">applied</dt><dd className={delta < 0 ? 'text-green' : delta > 0 ? 'text-red' : 'text-text'}>{delta > 0 ? `+${delta}` : delta}</dd>
            <dt className="text-faint">confidence</dt><dd className="text-text">{j.confidence ?? '—'}</dd>
          </dl>
        </div>
        <div>
          <p className="text-[15px] leading-relaxed text-text">{j.reasoning}</p>
          {j.misreads && j.misreads.length > 0 && (
            <div className="mt-3">
              <p className="label">Signals it believes misfired</p>
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {j.misreads.map((m) => <li key={m.signal} className="flex gap-3 py-2 text-sm"><span className="w-8 shrink-0 font-mono text-xs text-muted">{m.signal}</span><span className="text-muted">{m.reason}</span></li>)}
              </ul>
            </div>
          )}
          {j.verified_facts && j.verified_facts.length > 0 && (
            <div className="mt-3">
              <p className="label">Check these yourself</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">{j.verified_facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
