import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Watch } from '../../lib/types'
import { relTime } from '../../lib/format'
import { Empty, ErrorBox, PageHead, Rows } from '../../components/app/ui'
import { useTitle } from '../../lib/useTitle'

export default function Watches() {
  useTitle('Watches')
  const { user } = useAuth()
  const [items, setItems] = useState<Watch[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true; setLoading(true); setError(null)
    if (!user) { setItems([]); setLoading(false); return }
    api.watches().then((r) => alive && setItems(r.items ?? [])).catch((e) => { if (!alive) return; if (e instanceof ApiError && e.status === 404) setItems([]); else setError(e instanceof Error ? e.message : 'Could not load') }).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [user, tick])
  return (
    <div>
      <PageHead label="Monitor" title="Watches" sub="TinyFish Monitor watches an official careers page and tells you when the role appears or disappears." />
      <div className="mt-2">
        {loading ? <Rows n={3} cols={4} /> : error ? <ErrorBox msg={error} onRetry={() => setTick((t) => t + 1)} /> : !items?.length ? <Empty title={user ? 'No watches yet' : 'Sign in to create watches'} body={user ? 'On a finished check, press “Watch this role”.' : 'Watches are saved to your account.'} cta={user ? 'Go to checks' : undefined} to="/app/checks" /> : (
          <table className="ledger-table">
            <thead><tr><th scope="col" className="pl-0">Role</th><th scope="col">Page</th><th scope="col">Status</th><th scope="col" className="pr-0 text-right">Last event</th></tr></thead>
            <tbody>{items.map((w) => <tr key={w.id}><td className="pl-0">{w.check_id ? <Link to={`/app/c/${w.check_id}`} className="underline decoration-border-strong underline-offset-4">{w.role_title || w.company_name || 'Role'}</Link> : (w.role_title || w.company_name || 'Role')}</td><td className="font-mono text-[11px] text-muted">{w.url}</td><td className="font-mono text-xs uppercase text-muted">{w.status}</td><td className="pr-0 text-right font-mono text-[11px] text-faint">{w.last_event_at ? relTime(w.last_event_at) : relTime(w.created_at)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
