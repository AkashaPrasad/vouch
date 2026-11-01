import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Eye, FileSearch, Loader2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ResearchReport, ResearchState, Screenshot } from '../lib/types'
import { hostOf } from '../lib/format'
import { useToast } from './Toast'

/** TinyFish Research (deep dossier), Browser screenshots and Monitor watch. Every part hides itself when the backend lacks the endpoint. */
export function ResearchPanel({ id, isFinal }: { id: string; isFinal: boolean }) {
  const toast = useToast()
  const { token } = useAuth()
  const [avail, setAvail] = useState<boolean | null>(null)
  const [state, setState] = useState<ResearchState | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [report, setReport] = useState<ResearchReport | null>(null)
  const [shots, setShots] = useState<Screenshot[] | null>(null)
  const [watching, setWatching] = useState(false)
  const [watchMsg, setWatchMsg] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let alive = true
    api.researchGet(id).then((r) => { if (!alive) return; setAvail(true); setState(r); setLog((r.progress ?? []).map((p) => p.text)); if (r.report) setReport(r.report); if (r.status === 'running') subscribe() })
      .catch((e) => { if (alive) setAvail(!(e instanceof ApiError && (e.status === 404 || e.status === 0))) })
    api.screenshots(id).then((r) => alive && setShots(r.items ?? [])).catch(() => alive && setShots([]))
    return () => { alive = false; esRef.current?.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function subscribe() {
    esRef.current?.close()
    const es = new EventSource(api.researchStreamUrl(id))
    esRef.current = es
    es.addEventListener('research.progress', (ev) => { try { const d = JSON.parse((ev as MessageEvent).data); setLog((l) => [...l, d.text]) } catch { /* ignore */ } })
    es.addEventListener('research.done', (ev) => { try { const d = JSON.parse((ev as MessageEvent).data); setReport(d.report); setState((s) => ({ ...(s ?? { status: 'done' }), status: 'done' })) } catch { /* ignore */ } es.close() })
    es.addEventListener('research.error', (ev) => { try { const d = JSON.parse((ev as MessageEvent).data); setLog((l) => [...l, `error: ${d.message}`]) } catch { /* ignore */ } setState((s) => ({ ...(s ?? { status: 'failed' }), status: 'failed' })); es.close() })
    es.addEventListener('done', () => es.close())
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) es.close() }
  }

  async function start() {
    try {
      const r = await api.research(id)
      setState((s) => ({ ...(s ?? { status: 'running' }), status: r.status as ResearchState['status'] }))
      if (r.status === 'running') subscribe()
      else if (r.status === 'done') api.researchGet(id).then((x) => x.report && setReport(x.report)).catch(() => { /* ignore */ })
    } catch (e) { toast.show(e instanceof Error ? e.message : 'Could not start research', 'error') }
  }

  async function watch() {
    if (!token) { toast.show('Sign in with Google to watch this role.', 'info'); return }
    setWatching(true)
    try { const r = await api.watch(id); setWatchMsg(r.message) ; toast.show(r.message, r.ok ? 'success' : 'info') }
    catch (e) { setWatchMsg(e instanceof Error ? e.message : 'Watch unavailable') }
    finally { setWatching(false) }
  }

  if (avail === false || avail === null) return null
  const running = state?.status === 'running'
  return (
    <section aria-labelledby="deep-h" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <p className="label">Deep checks · on demand</p>
          <h2 id="deep-h" className="mt-1 text-base font-semibold">Research dossier</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={start} disabled={!isFinal || running || state?.status === 'done'} className="btn-secondary">
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSearch className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            {state?.status === 'done' ? 'Research complete' : running ? 'Researching…' : 'Run deep research'}
          </button>
          <button onClick={watch} disabled={watching} className="btn-secondary"><Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden />Watch this role</button>
        </div>
      </div>
      {watchMsg && <p className="mt-2 font-mono text-xs text-muted">{watchMsg}</p>}
      {(log.length > 0 || running) && (
        <ol className="mt-3 max-h-48 overflow-auto border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-muted" aria-live="polite" aria-label="Research progress">
          {log.map((l, i) => <li key={i} className="flex gap-3"><span className="tnum text-faint">{String(i + 1).padStart(2, '0')}</span><span>{l}</span></li>)}
          {running && <li className="flex gap-3 text-faint"><span>··</span><span>working, this takes a few minutes</span></li>}
        </ol>
      )}
      {report && (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-text">{report.summary}</p>
          <table className="ledger-table mt-3">
            <thead><tr><th scope="col" className="pl-0">Finding</th><th scope="col" className="pr-0 text-right">Sources</th></tr></thead>
            <tbody>
              {report.findings?.map((f, i) => (
                <tr key={i}>
                  <td className="pl-0"><span className="font-medium text-text">{f.title}</span><p className="mt-1 text-sm text-muted">{f.detail}</p></td>
                  <td className="pr-0 text-right">
                    {(f.sources ?? []).slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block font-mono text-[11px] text-muted underline decoration-border-strong underline-offset-4 hover:text-text">{hostOf(u)}</a>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shots && shots.length > 0 && (
        <div className="mt-6">
          <p className="label">Visual receipts</p>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {shots.map((s, i) => (
              <li key={i} className="border border-border">
                <img src={api.imageUrl(s.image_url)} alt={`Screenshot for ${s.signal}: ${s.url}`} loading="lazy" className="block w-full" />
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 font-mono text-[11px] text-muted">
                  <span>{s.signal} · {hostOf(s.url)}</span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-text">open<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden /></a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
