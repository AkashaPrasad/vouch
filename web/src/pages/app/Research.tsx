import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { RecentItem, ResearchState } from '../../lib/types'
import { relTime } from '../../lib/format'
import { Empty, ErrorBox, PageHead, Rows } from '../../components/app/ui'
import { useTitle } from '../../lib/useTitle'

export default function Research() {
  useTitle('Research')
  const { user } = useAuth()
  const [rows, setRows] = useState<(RecentItem & { research?: ResearchState | null })[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true; setLoading(true); setError(null)
    ;(user ? api.myChecks() : api.recent()).then(async (r) => {
      const items = (r.items ?? []).slice(0, 25)
      const withR = await Promise.all(items.map(async (x) => ({ ...x, research: await api.researchGet(x.check_id).catch(() => null) })))
      if (alive) setRows(withR)
    }).catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load')).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [user, tick])
  const list = (rows ?? []).filter((x) => x.research && x.research.status !== 'idle')
  const tone: Record<string, string> = { done: 'text-green', running: 'text-accent', failed: 'text-red' }
  return (
    <div>
      <PageHead label="Deep checks" title="Research dossiers" sub="TinyFish Research runs on demand from any check and takes a few minutes." />
      <div className="mt-2">
        {loading ? <Rows n={4} cols={3} /> : error ? <ErrorBox msg={error} onRetry={() => setTick((t) => t + 1)} /> : !list.length ? <Empty title="No research dossiers yet" body="Open a finished check and press “Run deep research”." cta="Go to checks" to="/app/checks" /> : (
          <table className="ledger-table">
            <thead><tr><th scope="col" className="pl-0">Company</th><th scope="col">Status</th><th scope="col" className="hidden sm:table-cell">Findings</th><th scope="col" className="pr-0 text-right">Started</th></tr></thead>
            <tbody>{list.map((x) => <tr key={x.check_id}><td className="pl-0"><Link to={`/app/c/${x.check_id}`} className="underline decoration-border-strong underline-offset-4 hover:decoration-text">{x.company_name || 'Unknown company'}</Link></td><td className={`font-mono text-xs uppercase ${tone[x.research!.status] ?? 'text-faint'}`}>{x.research!.status}</td><td className="hidden font-mono text-xs tnum text-muted sm:table-cell">{x.research!.report?.findings?.length ?? '—'}</td><td className="pr-0 text-right font-mono text-[11px] text-faint">{x.research!.started_at ? relTime(x.research!.started_at) : relTime(x.created_at)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
