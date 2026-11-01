import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Stats } from '../../lib/types'
import { PageHead, Section } from '../../components/app/ui'
import { useTitle } from '../../lib/useTitle'

const PLANS = [
  ['Free', '₹0', ['50 checks / month', 'Agent deep checks', '3 research dossiers', 'Community support']],
  ['Pro', 'Contact', ['Unlimited checks', 'Priority agent runs', 'Unlimited research', 'Watches on 25 roles', 'API access']],
  ['Team', 'Contact', ['Everything in Pro', 'Shared history', 'Placement-cell dashboard', 'SSO']],
] as const
const LIMITS = { checks: 50, agent: 150, research: 3 }

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const p = Math.min(100, Math.round((used / max) * 100))
  return (
    <div className="border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between"><p className="label">{label}</p><span className="font-mono text-xs tnum text-muted">{used} / {max}</span></div>
      <div className="mt-3 h-2 w-full border border-border-strong"><div className={`h-full ${p >= 90 ? 'bg-red' : 'bg-accent'}`} style={{ width: `${p}%` }} role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={max} aria-label={label} /></div>
    </div>
  )
}

export default function Billing() {
  useTitle('Billing')
  const { user } = useAuth()
  const [st, setSt] = useState<Stats | null>(null)
  useEffect(() => { if (user) api.stats().then(setSt).catch(() => setSt(null)) }, [user])
  return (
    <div>
      <PageHead label="Account" title="Billing" sub="No payments yet. Vouch is free during the pilot." />
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="border border-border bg-surface p-4"><p className="label">Current plan</p><p className="mt-2 text-2xl font-semibold">Free</p><p className="mt-1 text-sm text-muted">Renews monthly · no card on file</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Meter label="Checks this month" used={st?.checks_month ?? 0} max={LIMITS.checks} />
          <Meter label="Agent runs" used={st?.agent_runs ?? 0} max={LIMITS.agent} />
          <Meter label="Research runs" used={st?.research_runs ?? 0} max={LIMITS.research} />
        </div>
      </div>
      <Section label="Plans" title="Compare" className="mt-8">
        <table className="ledger-table">
          <thead><tr><th scope="col" className="pl-0">Plan</th><th scope="col">Price</th><th scope="col">Includes</th><th scope="col" className="pr-0 text-right"></th></tr></thead>
          <tbody>{PLANS.map(([n, p, f]) => <tr key={n}><td className="pl-0 font-medium">{n}</td><td className="font-mono text-xs">{p}</td><td className="text-sm text-muted">{f.join(' · ')}</td><td className="pr-0 text-right">{n === 'Free' ? <span className="font-mono text-[11px] uppercase text-green">current</span> : <a href="mailto:hello@vouch.spacesdrive.cc" className="btn-secondary h-9 min-h-0 px-3">Contact</a>}</td></tr>)}</tbody>
        </table>
      </Section>
    </div>
  )
}
