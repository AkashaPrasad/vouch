import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Loader2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Alert } from '../../lib/types'
import { postedLabel, relTime } from '../../lib/format'
import { Empty, ErrorBox, MatchPill, PageHead, Rows } from '../../components/app/ui'
import { GoogleSignInButton } from '../../components/GoogleSignInButton'
import { useToast } from '../../components/Toast'
import { useTitle } from '../../lib/useTitle'
import { bumpUnread, refreshUnread } from '../../lib/alerts'
import { runSample, setPendingSample, takePendingSample } from '../../lib/sample'

export default function Alerts() {
  useTitle('Alerts')
  const { user, prompt } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<Alert[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [sampling, setSampling] = useState(false)
  const [sampleNote, setSampleNote] = useState<string | null>(null)

  async function trySample() {
    if (!user) { setPendingSample(true); prompt(); return }
    if (sampling) return
    setSampling(true); setSampleNote(null)
    try {
      const { watch, result, checkError } = await runSample()
      toast.show('Sample watch created', 'success')
      const name = watch.company_name || 'the sample company'
      setSampleNote(result
        ? `Watching ${name}: ${result.postings_count ?? 0} open postings, ${result.alerts_created ?? 0} cleared your match threshold.`
        : `Watching ${name}. The first check did not finish: ${checkError ?? 'unknown error'}`)
      void refreshUnread()
      setTick((t) => t + 1)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not run the sample', 'error')
    } finally { setSampling(false) }
  }
  // A guest pressed "Try a sample" before signing in: run it now.
  useEffect(() => { if (user && takePendingSample()) void trySample() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    let alive = true
    setError(null)
    api.alerts()
      .then((r) => { if (alive) { setItems(r.items ?? []); setUnavailable(false); void refreshUnread() } })
      .catch((e) => {
        if (!alive) return
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) { setUnavailable(true); setItems([]) }
        else setError(e instanceof Error ? e.message : 'Could not load alerts')
      })
    return () => { alive = false }
  }, [user, tick])

  async function markRead(a: Alert) {
    if (a.read_at) return
    const now = new Date().toISOString()
    setItems((xs) => (xs ?? []).map((x) => (x.id === a.id ? { ...x, read_at: now } : x)))
    bumpUnread(-1)
    try { await api.readAlert(a.id) }
    catch (e) {
      setItems((xs) => (xs ?? []).map((x) => (x.id === a.id ? { ...x, read_at: null } : x)))
      bumpUnread(1)
      toast.show(e instanceof Error ? e.message : 'Could not mark as read', 'error')
    }
  }

  const unread = (items ?? []).filter((a) => !a.read_at).length
  const rows = (items ?? []).filter((a) => !unreadOnly || !a.read_at)

  if (!user) return (
    <div>
      <PageHead label="Monitor" title="Alerts" sub="New postings from your watched companies that match your resume." />
      <div className="mt-4 border border-dashed border-border-strong p-8 text-center">
        <p className="text-sm font-medium">Sign in to see match alerts</p>
        <p className="mt-1 text-sm text-muted">Alerts come from the companies you watch.</p>
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row"><GoogleSignInButton /><button type="button" onClick={trySample} className="btn-secondary h-10 min-h-0 px-4"><FlaskConical className="h-4 w-4" strokeWidth={1.5} aria-hidden />Try a sample</button></div>
        <p className="mt-2 text-xs text-faint">Try a sample asks you to sign in first, then runs right after.</p>
      </div>
    </div>
  )

  return (
    <div>
      <PageHead
        label="Monitor"
        title="Alerts"
        sub="New postings from your watched companies that score at or above your match threshold."
        actions={items?.length ? (
          <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--text)]" />
            Unread only <span className="text-text tnum">({unread})</span>
          </label>
        ) : undefined}
      />
      <div className="mt-2">
        {items == null && !error ? <Rows n={4} cols={5} /> : error ? <ErrorBox msg={error} onRetry={() => setTick((t) => t + 1)} /> : unavailable ? (
          <Empty title="Alerts are not available yet." body="Once company watches are live, matching postings show up here." />
        ) : !items?.length ? (
          <div className="border border-dashed border-border-strong p-8 text-center">
            <p className="text-sm font-medium">No alerts yet</p>
            <p className="mt-1 text-sm text-muted">Watch a company and say what you are looking for. When a new posting clears your threshold, it lands here.</p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={trySample} disabled={sampling} className="btn-secondary h-10 min-h-0 px-4">{sampling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="h-4 w-4" strokeWidth={1.5} aria-hidden />}{sampling ? 'Running sample' : 'Try a sample'}</button>
              <Link to="/app/watches" className="btn-primary h-10 min-h-0 px-4">Set up watches</Link>
            </div>
            {sampling && <p className="mt-3 text-xs text-muted">Saving sample preferences if you have none, watching careers.navi.com and running the first check…</p>}
            {sampleNote && <p className="mt-3 text-xs text-muted">{sampleNote} <Link to="/app/watches" className="underline underline-offset-4 hover:text-text">See postings</Link></p>}
          </div>
        ) : !rows.length ? (
          <Empty title="All caught up" body="Every alert has been read." />
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table min-w-[720px]">
              <thead><tr><th scope="col" className="pl-0">Company</th><th scope="col">Posting</th><th scope="col">Match</th><th scope="col">When</th><th scope="col" className="pr-0 text-right"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const isUnread = !a.read_at
                  return (
                    <tr key={a.id} onClick={() => markRead(a)} className={`cursor-pointer hover:bg-surface ${isUnread ? '' : 'text-muted'}`}>
                      <td className="pl-0">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 ${isUnread ? 'bg-text' : 'bg-transparent'}`} />
                          <span className={isUnread ? 'font-semibold text-text' : ''}>{a.company_name}</span>
                          {isUnread && <span className="sr-only">(unread)</span>}
                        </span>
                      </td>
                      <td>
                        <a href={a.posting?.url} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); void markRead(a) }} className={`underline decoration-border-strong underline-offset-4 hover:decoration-text ${isUnread ? 'font-medium text-text' : ''}`}>{a.posting?.title || 'Untitled role'}</a>
                        <span className="mt-0.5 block text-xs text-faint">{[a.posting?.location, a.posting?.posted ? `posted ${postedLabel(a.posting.posted)}` : null].filter(Boolean).join(' · ') || '—'}</span>
                      </td>
                      <td>
                        <div className="flex items-start gap-2"><MatchPill score={a.match_score} /><span className="max-w-[260px] text-xs text-muted">{a.match_reasons?.[0] ?? ''}</span></div>
                      </td>
                      <td className="whitespace-nowrap font-mono text-[11px] text-faint" title={a.created_at}>{relTime(a.created_at)}</td>
                      <td className="pr-0 text-right">
                        {isUnread
                          ? <button onClick={(e) => { e.stopPropagation(); void markRead(a) }} className="inline-flex min-h-[32px] items-center whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.04em] text-text hover:underline">Mark read</button>
                          : <span className="font-mono text-[11px] uppercase text-faint">read</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {items?.length ? <p className="mt-3 text-xs text-faint">Change the threshold or your resume on <Link to="/app/watches" className="underline underline-offset-4 hover:text-text">Watches</Link>.</p> : null}
      </div>
    </div>
  )
}
