import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { AlertTriangle, ArrowLeft, ExternalLink, Info, Loader2, Phone, RotateCcw, Share2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { subscribeCheck } from '../lib/sse'
import { AGENT_CODES, mergeSignals, pendingSignals } from '../lib/signals'
import type { Explanation, Extraction, Signal, Verdict } from '../lib/types'
import { hostOf } from '../lib/format'
import { useTitle } from '../lib/useTitle'
import { SignalCard } from '../components/SignalCard'
import { ScoreRing } from '../components/ScoreRing'
import { Timer } from '../components/Timer'
import { VerdictBadge, BAND } from '../components/VerdictBadge'
import { ShareCard } from '../components/ShareCard'
import { useToast } from '../components/Toast'

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

export default function Check() {
  const { id = '' } = useParams()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState<{ msg: string; notFound?: boolean } | null>(null)
  const [streamErr, setStreamErr] = useState<string | null>(null)
  const [signals, setSignals] = useState<Signal[]>(pendingSignals)
  const [agentText, setAgentText] = useState<Record<string, string>>({})
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [streamed, setStreamed] = useState('')
  const [extraction, setExtraction] = useState<Extraction | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [status, setStatus] = useState<'running' | 'done' | null>(null)
  const [feedback, setFeedback] = useState<boolean | null>(null)
  const [sharing, setSharing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const shareRef = useRef<HTMLDivElement>(null)

  const company = extraction?.company_name || null
  useTitle(verdict?.is_final ? `${verdict.label}${company ? ` · ${company}` : ''}` : 'Checking offer…')

  useEffect(() => {
    let unsub: (() => void) | null = null
    let alive = true
    setLoading(true); setFatal(null); setStreamErr(null)
    api.getCheck(id).then((d) => {
      if (!alive) return
      setSignals(mergeSignals(pendingSignals(), d.signals ?? []))
      setVerdict(d.verdict); setExplanation(d.explanation); setExtraction(d.extraction ?? null)
      setStatus(d.status); setStartedAt(pickStart(d.created_at))
      setLoading(false)
      if (d.status === 'running') {
        unsub = subscribeCheck(id, {
          'extraction.done': (x) => setExtraction(x),
          'signal.update': (s: Signal) => setSignals((prev) => mergeSignals(prev, [s])),
          'agent.progress': (p: { signal: string; text: string }) => setAgentText((m) => ({ ...m, [p.signal]: p.text })),
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
  const summary = explanation?.summary || streamed
  const resolved = useMemo(() => signals.filter((s) => s.status !== 'pending').length, [signals])
  const steps = explanation?.next_steps?.length ? explanation.next_steps : null

  const onShare = useCallback(async () => {
    if (!shareRef.current || !verdict) return
    setSharing(true)
    try {
      const dataUrl = await toPng(shareRef.current, { pixelRatio: 2, cacheBust: true, skipFonts: true, backgroundColor: '#09090B' })
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
        <div className="card mx-auto max-w-lg p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber" strokeWidth={1.5} aria-hidden />
          <h1 className="mt-4 text-xl font-semibold">{fatal.notFound ? 'Check not found' : 'Couldn’t load this check'}</h1>
          <p className="mt-2 text-sm text-muted" role="alert">{fatal.msg}</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {!fatal.notFound && <button onClick={() => setAttempt((a) => a + 1)} className="btn-primary"><RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />Try again</button>}
            <Link to="/" className="btn-secondary">Start a new check</Link>
          </div>
        </div>
      </div>
    )
  }

  const band = verdict?.band ?? null
  const b = band ? BAND[band] : null

  return (
    <div className="container-x pb-8 pt-6 sm:pt-8">
      <Link to="/" className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-sm text-muted hover:text-text"><ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />New check</Link>

      {/* Verdict banner */}
      <section aria-live="polite" aria-busy={!isFinal} className={`card relative overflow-hidden p-5 sm:p-7 ${b && isFinal ? b.border : ''}`}>
        {b && isFinal && <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `radial-gradient(60% 80% at 0% 0%, ${b.hex}14, transparent 70%)` }} />}
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          {loading || !verdict ? <div className="skeleton h-28 w-28 shrink-0 rounded-full" aria-hidden /> : <ScoreRing score={verdict.score} band={verdict.band} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {verdict ? <VerdictBadge band={verdict.band} label={verdict.label} size="lg" /> : <span className="skeleton h-10 w-44 rounded-full" aria-hidden />}
              {verdict && !isFinal && <span className="animate-pulse-soft rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-muted">Preliminary</span>}
              {!verdict && !loading && <span className="inline-flex items-center gap-1.5 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Gathering evidence…</span>}
            </div>
            <h1 className="mt-3 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              {explanation?.headline || (company ? <>Checking the offer from <span className="text-text">{company}</span></> : loading ? <span className="skeleton block h-7 w-3/4" /> : 'Checking this offer')}
            </h1>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5"><dt className="text-faint">Time</dt><dd><Timer startedAt={startedAt} stoppedMs={isFinal ? verdict!.elapsed_ms : status === 'done' ? (verdict?.elapsed_ms ?? 0) : null} className="text-text" /></dd></div>
              <div className="flex items-center gap-1.5"><dt className="text-faint">Checks</dt><dd className="font-mono tabular-nums">{verdict?.resolved ?? resolved}/12</dd></div>
              {verdict && <div className="flex items-center gap-1.5"><dt className="text-faint">Confidence</dt><dd className="capitalize">{verdict.confidence}</dd></div>}
              {extraction?.claimed_official_domain && <div className="flex items-center gap-1.5"><dt className="text-faint">Domain</dt><dd className="font-mono">{extraction.claimed_official_domain}</dd></div>}
            </dl>
          </div>
        </div>
        <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={12} aria-valuenow={resolved} aria-label="Checks completed">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(resolved / 12) * 100}%`, background: b?.hex ?? 'var(--accent)' }} />
        </div>

        {verdict?.limited && (
          <p className="relative mt-4 flex items-start gap-2 rounded-[8px] border border-amber/30 bg-[var(--amber-soft)] p-3 text-sm text-amber">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
            Limited check: live web sources were unavailable, so some signals could not be verified. Treat this result with extra care.
          </p>
        )}

        {(summary || (verdict && !isFinal)) && (
          <p className="relative mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">
            {summary}{!isFinal && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse-soft bg-accent" aria-hidden />}
          </p>
        )}

        {streamErr && (
          <div role="alert" className="relative mt-4 flex flex-col gap-3 rounded-[8px] border border-red/30 bg-[var(--red-soft)] p-3 text-sm text-red sm:flex-row sm:items-center">
            <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />{streamErr} Results so far are shown below.</span>
            <button onClick={() => { setStreamErr(null); setAttempt((a) => a + 1) }} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-2 font-medium text-text underline underline-offset-4 sm:ml-auto">
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />Try again
            </button>
          </div>
        )}

        <div className="relative mt-5 flex flex-wrap gap-2">
          <button onClick={onShare} disabled={!isFinal || sharing} className="btn-primary flex-1 sm:flex-none" title={isFinal ? undefined : 'Available when the check finishes'}>
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />}Share result
          </button>
          <button onClick={copyLink} className="btn-secondary flex-1 sm:flex-none">Copy link</button>
          <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer" className="btn-secondary w-full sm:w-auto">
            Report at cybercrime.gov.in<ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden /><span className="sr-only">(opens in new tab)</span>
          </a>
        </div>
      </section>

      {/* What to do next */}
      <section aria-labelledby="next-h" className="mt-6">
        <h2 id="next-h" className="text-lg font-semibold tracking-tight">What to do next</h2>
        <ol className="mt-3 grid gap-2 md:grid-cols-3">
          {(steps ?? DEFAULT_STEPS).map((s, i) => (
            <li key={i} className={`card flex gap-3 p-4 ${!steps && !isFinal ? 'opacity-70' : ''}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] font-mono text-xs font-semibold text-accent">{i + 1}</span>
              <p className="text-sm leading-relaxed text-text">{s}</p>
            </li>
          ))}
        </ol>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-faint"><Phone className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />Lost money? Call <a href="tel:1930" className="font-mono text-muted underline underline-offset-2">1930</a> right away.</p>
      </section>

      {/* Signals */}
      <section aria-labelledby="sig-h" className="mt-8">
        <div className="flex items-end justify-between">
          <h2 id="sig-h" className="text-lg font-semibold tracking-tight">12 checks</h2>
          <span className="font-mono text-xs text-faint">{resolved}/12 resolved</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((s) => <SignalCard key={s.code} signal={s} isAgent={AGENT_CODES.has(s.code)} agentText={agentText[s.code]} />)}
        </div>
      </section>

      {/* Receipts */}
      <section aria-labelledby="rec-h" className="mt-8">
        <h2 id="rec-h" className="text-lg font-semibold tracking-tight">Receipts</h2>
        {explanation?.receipts?.length ? (
          <ul className="card mt-3 divide-y divide-border">
            {explanation.receipts.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
                <span className="font-mono text-xs text-accent">{r.signal}</span>
                <span className="flex-1 text-sm text-text">{r.finding}</span>
                {r.source_url && (
                  <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1 font-mono text-xs text-muted hover:text-text">
                    {hostOf(r.source_url)}<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden /><span className="sr-only">(opens in new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="card mt-3 space-y-3 p-4" aria-hidden={!isFinal}>
            {isFinal ? <p className="text-sm text-muted">No receipts for this check.</p> : [0, 1, 2].map((i) => <div key={i} className="skeleton h-5" style={{ width: `${85 - i * 15}%` }} />)}
          </div>
        )}
      </section>

      {/* Feedback */}
      <section aria-labelledby="fb-h" className="card mt-8 flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
        <h2 id="fb-h" className="text-sm font-medium">Was this verdict right?</h2>
        <div className="flex gap-2 sm:ml-auto">
          <button onClick={() => sendFeedback(true)} disabled={feedback !== null || !isFinal} aria-pressed={feedback === true} className={`btn-secondary ${feedback === true ? 'border-green/50 text-green' : ''}`}>
            <ThumbsUp className="h-4 w-4" strokeWidth={1.5} aria-hidden />Yes
          </button>
          <button onClick={() => sendFeedback(false)} disabled={feedback !== null || !isFinal} aria-pressed={feedback === false} className={`btn-secondary ${feedback === false ? 'border-red/50 text-red' : ''}`}>
            <ThumbsDown className="h-4 w-4" strokeWidth={1.5} aria-hidden />No
          </button>
        </div>
      </section>
      <p className="mt-4 text-xs leading-relaxed text-faint">A clean result is not a guarantee. Vouch reports risk signals from public sources and never accuses any company.</p>

      {verdict && isFinal && (
        <div aria-hidden className="pointer-events-none fixed -left-[10000px] top-0">
          <ShareCard ref={shareRef} band={verdict.band} label={verdict.label} score={verdict.score} company={company} receipts={explanation?.receipts ?? []} headline={explanation?.headline} />
        </div>
      )}
    </div>
  )
}
