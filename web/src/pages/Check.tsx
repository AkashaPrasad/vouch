import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, RotateCcw, Share2, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { subscribeCheck } from '../lib/sse'
import { mergeSignals, pendingSignals } from '../lib/signals'
import { computeLedger } from '../lib/ledger'
import type { Explanation, Extraction, Signal, Verdict } from '../lib/types'
import { hostOf } from '../lib/format'
import { useTitle } from '../lib/useTitle'
import { Timer } from '../components/Timer'
import { VerdictBadge, BAND } from '../components/VerdictBadge'
import { ShareCard } from '../components/ShareCard'
import { ScoreLedger } from '../components/ScoreLedger'
import { SignalStrip } from '../components/SignalStrip'
import { SignalTimeline } from '../components/SignalTimeline'
import { SignalLedger } from '../components/SignalLedger'
import { HostsStrip } from '../components/HostsStrip'
import { JudgePanel } from '../components/JudgePanel'
import { ResearchPanel } from '../components/ResearchPanel'
import { PreviewPanel, type AgentProgress } from '../components/PreviewPanel'
import type { Screenshot } from '../lib/types'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/auth'

const DEFAULT_STEPS = [
  'Do not pay any fee, deposit or “refundable” amount to get a job.',
  'Contact HR only through the email domain on the company’s official website.',
  'If you already paid or shared documents, report at cybercrime.gov.in or call 1930.',
]

function pickStart(createdAt?: string): number {
  const t = createdAt ? Date.parse(createdAt) : NaN
  const now = Date.now()
  if (Number.isNaN(t) || t > now + 2000 || now - t > 10 * 60_000) return now
  return t
}

function Stat({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><dt className="label">{k}</dt><dd className="font-mono text-sm tnum text-text">{children}</dd></div>
}

export default function Check() {
  const { id = '' } = useParams()
  const inApp = useLocation().pathname.startsWith('/app')
  const toast = useToast()
  const { user } = useAuth()
  const navTo = useNavigate()
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState<{ msg: string; notFound?: boolean } | null>(null)
  const [streamErr, setStreamErr] = useState<string | null>(null)
  const [signals, setSignals] = useState<Signal[]>(pendingSignals)
  const [agentText, setAgentText] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<Record<string, AgentProgress>>({})
  const [shots, setShots] = useState<Screenshot[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [streamed, setStreamed] = useState('')
  const [extraction, setExtraction] = useState<Extraction | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [status, setStatus] = useState<'running' | 'done' | null>(null)
  const [feedback, setFeedback] = useState<boolean | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const shareRef = useRef<HTMLDivElement>(null)

  const company = extraction?.company_name || null
  useTitle(verdict?.is_final ? `${verdict.label}${company ? ` · ${company}` : ''}` : 'Checking offer…')

  useEffect(() => {
    let unsub: (() => void) | null = null
    let alive = true
    setLoading(true); setFatal(null); setStreamErr(null)
    api.getCheck(id).then((d) => {
      setUnavailable(Boolean(d.listing_unavailable))
      if (!alive) return
      setSignals(mergeSignals(pendingSignals(), d.signals ?? []))
      setVerdict(d.verdict); setExplanation(d.explanation); setExtraction(d.extraction ?? null)
      setStatus(d.status); setStartedAt(pickStart(d.created_at))
      setLoading(false)
      if (d.status === 'running') {
        unsub = subscribeCheck(id, {
          'extraction.done': (x) => setExtraction(x),
          'signal.update': (s: Signal) => setSignals((prev) => mergeSignals(prev, [s])),
          'agent.progress': (p: { signal: string; text: string; preview_url?: string | null }) => {
            setAgentText((m) => ({ ...m, [p.signal]: p.text }))
            setProgress((m) => { const cur = m[p.signal] ?? { text: '', log: [] }; return { ...m, [p.signal]: { text: p.text, preview_url: p.preview_url ?? cur.preview_url ?? null, log: [...cur.log, p.text].slice(-80) } } })
          },
          'verdict.preliminary': (v: Verdict) => setVerdict((cur) => (cur?.is_final ? cur : v)),
          'explanation.token': (t: { text: string }) => setStreamed((s) => s + (t?.text ?? '')),
          'verdict.final': (f: { verdict: Verdict; explanation: Explanation }) => { setVerdict({ ...f.verdict, is_final: true }); setExplanation(f.explanation); setStatus('done') },
          error: (e: { message?: string }) => setStreamErr(e?.message || 'The check hit a problem and stopped.'),
          done: () => setStatus('done'),
          onConnectionError: () => setStreamErr('Lost connection to the live check.'),
        })
      }
    }).catch((e) => {
      if (!alive) return
      setLoading(false)
      if (e instanceof ApiError && e.status === 404) setFatal({ msg: 'We couldn’t find this check. The link may be wrong or expired.', notFound: true })
      else setFatal({ msg: e instanceof Error ? e.message : 'Could not load this check.' })
    })
    return () => { alive = false; unsub?.() }
  }, [id, attempt])

  const isFinal = !!verdict?.is_final
  const running = status === 'running' && !isFinal
  useEffect(() => {
    let alive = true
    const load = () => api.screenshots(id).then((r) => alive && setShots(r.items ?? [])).catch(() => { /* optional endpoint */ })
    load()
    if (!running) return () => { alive = false }
    const t = window.setInterval(load, 10000)
    return () => { alive = false; window.clearInterval(t) }
  }, [id, running])
  const shotFor = (code: string) => [...shots].reverse().find((x) => x.signal === code)
  const previewFor = (code: string): 'live' | 'shot' | 'log' | undefined => {
    if (progress[code]?.preview_url) return 'live'
    if (shotFor(code)) return 'shot'
    if (progress[code]?.log.length) return 'log'
    return undefined
  }
  useEffect(() => { if (!running) return; const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t) }, [running])

  const summary = explanation?.summary || streamed
  const resolved = useMemo(() => signals.filter((s) => s.status !== 'pending').length, [signals])
  const ledger = useMemo(() => computeLedger(signals, verdict), [signals, verdict])
  const steps = explanation?.next_steps?.length ? explanation.next_steps : null
  const elapsedNow = isFinal ? verdict!.elapsed_ms : status === 'done' ? (verdict?.elapsed_ms ?? 0) : startedAt ? Math.max(0, now - startedAt) : 0

  const onShare = useCallback(async () => {
    if (!shareRef.current || !verdict) return
    setSharing(true)
    try {
      const dataUrl = await toPng(shareRef.current, { pixelRatio: 2, cacheBust: true, skipFonts: true, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#FFFFFF' })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `vouch-${id}.png`, { type: 'image/png' })
      const text = explanation?.share_text || `Vouch verdict: ${verdict.label} (risk ${verdict.score}/100)`
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], text, url: window.location.href }); return } catch (err) { if ((err as Error)?.name === 'AbortError') return }
      }
      const a = document.createElement('a'); a.href = dataUrl; a.download = file.name; a.click()
      toast.show('Share card downloaded', 'success')
    } catch {
      toast.show('Couldn’t create the image. Try copying the link instead.', 'error')
    } finally { setSharing(false) }
  }, [verdict, explanation, id, toast])

  const sendFeedback = async (correct: boolean) => {
    setFeedback(correct)
    try { await api.feedback(id, correct); toast.show('Thanks, that helps Vouch get better.', 'success') }
    catch { setFeedback(null); toast.show('Couldn’t send feedback. Please try again.', 'error') }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.show('Link copied', 'success') } catch { toast.show('Couldn’t copy the link', 'error') }
  }

  if (fatal) {
    return (
      <div className="container-x py-16">
        <div className="mx-auto max-w-lg border border-border p-8">
          <p className="label">Error</p>
          <h1 className="mt-2 text-xl font-semibold">{fatal.notFound ? 'Check not found' : 'Couldn’t load this check'}</h1>
          <p className="mt-2 text-sm text-muted" role="alert">{fatal.msg}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {!fatal.notFound && <button onClick={() => setAttempt((a) => a + 1)} className="btn-primary"><RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />Try again</button>}
            <Link to="/app/new" className="btn-secondary">Start a new check</Link>
          </div>
        </div>
      </div>
    )
  }

  const b = verdict ? BAND[verdict.band] : null

  return (
    <div className={inApp ? 'pb-8' : 'container-x pb-8 pt-5'}>
      <Link to={inApp ? '/app/new' : '/app'} className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-xs uppercase tracking-[0.08em] text-faint hover:text-text"><ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />{inApp ? 'New check' : 'Open dashboard'}</Link>

      {/* Verdict block */}
      <section aria-live="polite" aria-busy={!isFinal} className={`mt-3 border border-border bg-surface ${b && isFinal ? 'border-t-2 ' + b.border : ''}`}>
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr]">
          <div className="md:border-r md:border-border md:pr-8">
            <p className="label">Risk score</p>
            {loading || !verdict ? <span className="skeleton mt-2 block h-16 w-28" aria-hidden /> : (
              <div className={`mt-1 font-mono text-[64px] font-bold leading-none tnum ${b?.text}`}>{verdict.score}<span className="text-lg font-medium text-faint">/100</span></div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {verdict ? <VerdictBadge band={verdict.band} label={verdict.label} size="lg" /> : <span className="skeleton h-8 w-36" aria-hidden />}
              {verdict && !isFinal && <span className="animate-pulse-soft font-mono text-[11px] uppercase tracking-[0.08em] text-muted">preliminary</span>}
              {!verdict && !loading && <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />gathering evidence</span>}
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-snug sm:text-xl">
              {explanation?.headline || (company ? <>Checking the offer from {company}</> : loading ? <span className="skeleton block h-6 w-3/4" /> : 'Checking this offer')}
            </h1>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat k="Elapsed"><Timer startedAt={startedAt} stoppedMs={isFinal ? verdict!.elapsed_ms : status === 'done' ? (verdict?.elapsed_ms ?? 0) : null} /></Stat>
              <Stat k="Resolved">{verdict?.resolved ?? resolved}<span className="text-faint">/12</span></Stat>
              <Stat k="Confidence">{verdict?.confidence ?? '—'}</Stat>
              <Stat k="Company">{company ?? '—'}</Stat>
            </dl>
            {(summary || (verdict && !isFinal)) && (
              <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">{summary}{!isFinal && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse-soft bg-accent" aria-hidden />}</p>
            )}
            {verdict?.limited && <p className="mt-3 border-l-2 border-amber pl-3 text-sm text-amber">Limited check: live web sources were unavailable, so some signals could not be verified.</p>}
            {unavailable && <p className="mt-3 border-l-2 border-amber pl-3 text-sm text-amber">This link did not open a single job posting (expired, removed, search results or a login wall). Paste the job text instead for a full check.</p>}
            {streamErr && (
              <div role="alert" className="mt-3 flex flex-col gap-2 border-l-2 border-red pl-3 text-sm text-red sm:flex-row sm:items-center">
                <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />{streamErr} Results so far are shown below.</span>
                <button onClick={() => { setStreamErr(null); setAttempt((a) => a + 1) }} className="inline-flex min-h-[40px] items-center gap-1.5 font-medium text-text underline underline-offset-4 sm:ml-auto"><RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />Try again</button>
              </div>
            )}
            <HostsStrip extraction={extraction} />
          </div>
        </div>
        <div className="flex flex-col gap-4 border-t border-border p-5 sm:flex-row sm:items-center sm:p-6">
          <SignalStrip signals={signals} />
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button onClick={onShare} disabled={!isFinal || sharing} className="btn-primary" title={isFinal ? undefined : 'Available when the check finishes'}>
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />}Share
            </button>
            <button onClick={copyLink} className="btn-secondary">Copy link</button>
            {user && (
              <button onClick={async () => { if (!id || !window.confirm('Delete this check? This cannot be undone.')) return; try { await api.deleteCheck(id); navTo('/app/checks') } catch (e) { toast.show(e instanceof Error ? e.message : 'Could not delete', 'error') } }} className="btn-ghost text-red" aria-label="Delete this check"><Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />Delete</button>
            )}
            <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer" className="btn-secondary">Report<ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden /><span className="sr-only">at cybercrime.gov.in (opens in new tab)</span></a>
          </div>
        </div>
      </section>

      {/* Ledger */}
      <section aria-labelledby="ledger-h" className="mt-8">
        <div className="flex items-end justify-between border-b border-border pb-2">
          <div><p className="label">How the score was built</p><h2 id="ledger-h" className="mt-1 text-base font-semibold">Score ledger</h2></div>
          <p className="font-mono text-[11px] text-faint">start 50 · red adds · green subtracts</p>
        </div>
        <div className="mt-3"><ScoreLedger ledger={ledger} isFinal={isFinal} /></div>
        {ledger.floorNote && <p className="mt-1 border-l-2 border-amber pl-3 text-sm text-muted">{ledger.floorNote}</p>}
      </section>

      <JudgePanel verdict={verdict} />

      {/* Next steps */}
      <section aria-labelledby="next-h" className="mt-8">
        <div className="border-b border-border pb-2"><p className="label">Do this now</p><h2 id="next-h" className="mt-1 text-base font-semibold">What to do next</h2></div>
        <ol className="mt-1 divide-y divide-border">
          {(steps ?? DEFAULT_STEPS).map((s, i) => (
            <li key={i} className={`flex gap-4 py-3 ${!steps && !isFinal ? 'opacity-60' : ''}`}>
              <span className="font-mono text-xs tnum text-faint">0{i + 1}</span>
              <p className="text-sm leading-relaxed text-text">{s}</p>
            </li>
          ))}
        </ol>
        <p className="mt-2 font-mono text-[11px] text-faint">Lost money? Call <a href="tel:1930" className="text-muted underline underline-offset-2">1930</a> right away.</p>
      </section>

      {/* Signals table */}
      <section aria-labelledby="sig-h" className="mt-8">
        <div className="flex items-end justify-between border-b border-border pb-2">
          <div><p className="label">Evidence</p><h2 id="sig-h" className="mt-1 text-base font-semibold">12 signals</h2></div>
          <span className="font-mono text-[11px] tnum text-faint">{resolved}/12 resolved</span>
        </div>
        <SignalLedger signals={signals} extraction={extraction} agentText={agentText} previewFor={previewFor} onPreview={setPreview} />
      </section>

      {/* Timeline */}
      <section aria-labelledby="tl-h" className="mt-8">
        <div className="flex items-end justify-between border-b border-border pb-2">
          <div><p className="label">Fan-out</p><h2 id="tl-h" className="mt-1 text-base font-semibold">When each signal landed</h2></div>
          <span className="font-mono text-[11px] text-faint">0 → 180 s cap</span>
        </div>
        <div className="mt-3"><SignalTimeline signals={signals} nowMs={elapsedNow} /></div>
      </section>

      {/* Receipts */}
      <section aria-labelledby="rec-h" className="mt-8">
        <div className="border-b border-border pb-2"><p className="label">Sources</p><h2 id="rec-h" className="mt-1 text-base font-semibold">Receipts</h2></div>
        {explanation?.receipts?.length ? (
          <table className="ledger-table">
            <tbody>
              {explanation.receipts.map((r, i) => (
                <tr key={i}>
                  <td className="w-0 whitespace-nowrap pl-0 font-mono text-xs text-muted">{r.signal}</td>
                  <td className="text-text">{r.finding}</td>
                  <td className="w-0 whitespace-nowrap pr-0 text-right">
                    {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1 font-mono text-[11px] text-muted underline decoration-border-strong underline-offset-4 hover:text-text">{hostOf(r.source_url)}<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden /><span className="sr-only">(opens in new tab)</span></a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="space-y-3 py-4" aria-hidden={!isFinal}>
            {isFinal ? <p className="text-sm text-muted">No receipts for this check.</p> : [0, 1, 2].map((i) => <div key={i} className="skeleton h-4" style={{ width: `${85 - i * 15}%` }} />)}
          </div>
        )}
      </section>

      <ResearchPanel id={id} isFinal={isFinal} />

      {/* Feedback */}
      <section aria-labelledby="fb-h" className="mt-10 flex flex-col items-start gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
        <h2 id="fb-h" className="text-sm font-medium">Was this verdict right?</h2>
        <div className="flex gap-2 sm:ml-auto">
          <button onClick={() => sendFeedback(true)} disabled={feedback !== null || !isFinal} aria-pressed={feedback === true} className={`btn-secondary ${feedback === true ? 'border-green text-green' : ''}`}><ThumbsUp className="h-4 w-4" strokeWidth={1.5} aria-hidden />Yes</button>
          <button onClick={() => sendFeedback(false)} disabled={feedback !== null || !isFinal} aria-pressed={feedback === false} className={`btn-secondary ${feedback === false ? 'border-red text-red' : ''}`}><ThumbsDown className="h-4 w-4" strokeWidth={1.5} aria-hidden />No</button>
        </div>
      </section>
      <p className="mt-4 text-xs leading-relaxed text-faint">A clean result is not a guarantee. Vouch reports risk signals from public sources and never accuses any company.</p>

      {preview && <PreviewPanel code={preview} name={signals.find((x) => x.code === preview)?.name ?? preview} progress={progress[preview]} shot={shotFor(preview)} onClose={() => setPreview(null)} />}

      {verdict && isFinal && (
        <div aria-hidden className="pointer-events-none fixed -left-[10000px] top-0">
          <ShareCard ref={shareRef} band={verdict.band} label={verdict.label} score={verdict.score} company={company} receipts={explanation?.receipts ?? []} headline={explanation?.headline} />
        </div>
      )}
    </div>
  )
}
