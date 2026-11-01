import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, Link2, Play, Search } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { companyApi, loadRecent, saveRecent, subscribeCompany } from '../../lib/companyApi'
import { DEMO_REPORT } from '../../lib/companySample'
import type { CompanyDimension, CompanyEvidence, CompanyProgress, CompanyRecent, CompanyReport } from '../../lib/companyTypes'
import { hostOf } from '../../lib/format'
import { ErrorBox, PageHead, Section } from '../../components/app/ui'
import { useToast } from '../../components/Toast'
import { useTitle } from '../../lib/useTitle'

const PLATFORM_LABEL: Record<string, string> = { reddit: 'Reddit', ambitionbox: 'AmbitionBox', glassdoor: 'Glassdoor', blind: 'Blind', x: 'X', linkedin: 'LinkedIn', news: 'News', official: 'Official' }
const PLATFORMS = Object.keys(PLATFORM_LABEL)
const PLATFORM_RX: Record<string, RegExp> = {
  reddit: /reddit/i, ambitionbox: /ambition\s?box/i, glassdoor: /glassdoor/i, blind: /\bblind\b|teamblind/i,
  x: /\bx\.com\b|twitter|\bX\b/, linkedin: /linkedin/i, news: /\bnews\b|press coverage/i, official: /\bofficial\b|careers page|company site/i,
}
const DIMENSIONS = ['Culture', 'Work-life balance', 'Compensation', 'Management', 'Stability and layoffs', 'Treatment of freshers', 'Growth', 'Hiring process']
const LIVE_SAMPLE = 'Zomato'
const NOT_AVAILABLE = 'Company research is not available on this server yet. Try a sample to see what a report looks like.'

type Phase = 'idle' | 'loading' | 'running' | 'done' | 'failed'
type Tone = 'green' | 'amber' | 'red' | 'none'
const TONE_BG: Record<Tone, string> = { green: 'bg-green', amber: 'bg-amber', red: 'bg-red', none: 'bg-border-strong' }
const SENT_BORDER: Record<string, string> = { positive: 'border-l-green', negative: 'border-l-red', mixed: 'border-l-amber' }
const SENT_TEXT: Record<string, string> = { positive: 'text-green', negative: 'text-red', mixed: 'text-amber' }

const tone = (s: number | null | undefined): Tone => (s == null ? 'none' : s >= 70 ? 'green' : s >= 40 ? 'amber' : 'red')
const fmtDate = (s?: string | null) => (!s ? '' : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s)
const fmtTime = (at: string) => {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleTimeString('en-GB', { hour12: false })
}
const fmtConf = (c: string | number | null | undefined) =>
  c == null || c === '' ? 'n/a' : typeof c === 'number' ? `${Math.round(c <= 1 ? c * 100 : c)}%` : c
const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null)
const platformsIn = (text: string) => PLATFORMS.filter((p) => PLATFORM_RX[p].test(text))
const nowIso = () => new Date().toISOString()

function parseInput(raw: string): { company: string; website?: string } {
  const v = raw.trim()
  const hasScheme = /^https?:\/\//i.test(v)
  if (!hasScheme && (/\s/.test(v) || !/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v))) return { company: v }
  const url = hasScheme ? v : `https://${v}`
  const name = hostOf(url).split('.')[0] || v
  return { company: name.charAt(0).toUpperCase() + name.slice(1), website: url }
}

/* ---------- small pieces ---------- */

function PlatformBadge({ p }: { p: string }) {
  return <span className="inline-flex shrink-0 items-center border border-border-strong px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted">{(PLATFORM_LABEL[p] ?? p).toUpperCase()}</span>
}
function SourceLink({ url, label = 'source', className = '' }: { url?: string | null; label?: string; className?: string }) {
  const href = safeUrl(url)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-[28px] items-center gap-1 font-mono text-[11px] text-muted underline decoration-border-strong underline-offset-4 hover:text-text hover:decoration-text ${className}`}>
      {label}<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden /><span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
function ScoreBar({ score }: { score: number | null }) {
  const t = tone(score)
  return (
    <div className="mt-3">
      <div className="relative h-1 w-full bg-surface-2" role="meter" aria-label="Overall score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score ?? undefined}>
        {score != null && <div className={`absolute inset-y-0 left-0 ${TONE_BG[t]}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />}
        {[25, 50, 75].map((x) => <span key={x} className="absolute -top-0.5 h-2 w-px bg-border-strong" style={{ left: `${x}%` }} aria-hidden />)}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-faint tnum" aria-hidden><span>0</span><span>50</span><span>100</span></div>
    </div>
  )
}
function StepBar({ score }: { score: number | null }) {
  const filled = score == null ? 0 : Math.round((Math.max(0, Math.min(100, score)) / 100) * 6)
  const bg = TONE_BG[tone(score)]
  return (
    <div className="mt-2 grid w-28 grid-cols-6 gap-0.5" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => <span key={i} className={`h-1.5 ${i < filled ? bg : 'bg-surface-2'}`} />)}
    </div>
  )
}

/* ---------- progress log ---------- */

function ProgressLog({ lines, running, company }: { lines: CompanyProgress[]; running: boolean; company: string }) {
  const ref = useRef<HTMLOListElement>(null)
  const stick = useRef(true) // follow new lines unless the viewer has scrolled up to read
  useEffect(() => {
    const el = ref.current
    if (!el || !stick.current) return
    el.scrollTop = el.scrollHeight
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    return () => cancelAnimationFrame(raf)
  }, [lines.length])
  const seen = useMemo(() => new Set(lines.flatMap((l) => platformsIn(l.text))), [lines])
  const current = useMemo(() => { for (let i = lines.length - 1; i >= 0; i--) { const p = platformsIn(lines[i].text); if (p.length) return p[0] } return null }, [lines])
  return (
    <section className="border border-border bg-surface" aria-label="Progress log">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="label">Progress log{company ? ` · ${company}` : ''}</p>
        <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted tnum">
          {running && <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-text" aria-hidden />}
          {running ? 'running' : 'finished'} · {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2" aria-label="Platforms searched so far">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.06em] text-faint">searched</span>
        {PLATFORMS.map((p) => {
          const on = seen.has(p), now = running && current === p
          return <span key={p} className={`border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em] ${now ? 'border-text bg-text text-bg' : on ? 'border-text text-text' : 'border-border text-faint'}`}>{(PLATFORM_LABEL[p]).toUpperCase()}<span className="sr-only">{on ? ' searched' : ' not yet'}</span></span>
        })}
      </div>
      <ol ref={ref} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.clientHeight - el.scrollTop < 24 }} aria-live="polite" aria-relevant="additions" className="max-h-72 overflow-y-auto font-mono text-[12px] leading-relaxed">
        {!lines.length ? <li className="px-3 py-2 text-faint">{running ? 'Waiting for the first update…' : 'No progress recorded.'}</li> : lines.map((l, i) => {
          const p = platformsIn(l.text)[0]
          return (
            <li key={`${l.at}-${i}`} className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-border px-3 py-1.5 last:border-b-0">
              <span className="text-faint tnum">{fmtTime(l.at)}</span>
              <span className="min-w-0 break-words text-text">{p && <span className="mr-2 align-[1px]"><PlatformBadge p={p} /></span>}{l.text}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ReportSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <div className="border border-border bg-surface p-5">
        <span className="skeleton block h-3 w-20" /><span className="skeleton mt-2 block h-7 w-56" />
        <span className="skeleton mt-5 block h-1 w-full" /><span className="skeleton mt-4 block h-4 w-3/4" />
      </div>
      <div className="flex flex-wrap gap-2">{Array.from({ length: 8 }).map((_, i) => <span key={i} className="skeleton block h-7 w-28" />)}</div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border bg-surface p-4">
            <span className="skeleton block h-4 w-32" /><span className="skeleton mt-3 block h-1.5 w-28" />
            <span className="skeleton mt-4 block h-3 w-full" /><span className="skeleton mt-2 block h-3 w-5/6" />
            <span className="skeleton mt-4 block h-14 w-full" /><span className="skeleton mt-2 block h-14 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- report ---------- */

function EvidenceRow({ e }: { e: CompanyEvidence }) {
  return (
    <li className={`border border-l-2 border-border ${SENT_BORDER[e.sentiment] ?? 'border-l-border-strong'} bg-bg px-3 py-2`}>
      <p className="text-sm leading-relaxed text-text">“{e.quote}”</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <PlatformBadge p={String(e.platform)} />
        <span className={`font-mono text-[10px] uppercase tracking-[0.06em] ${SENT_TEXT[e.sentiment] ?? 'text-faint'}`}>{e.sentiment}</span>
        {e.date && <span className="font-mono text-[11px] text-faint tnum">{fmtDate(e.date)}</span>}
        <SourceLink url={e.source_url} className="ml-auto" />
      </div>
    </li>
  )
}
function DimensionCard({ d }: { d: CompanyDimension }) {
  const [all, setAll] = useState(false)
  const ev = d.evidence ?? []
  const shown = all ? ev : ev.slice(0, 3)
  return (
    <article className="flex flex-col border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0"><p className="label">{String(d.key).replace(/_/g, ' ')}</p><h3 className="mt-1 text-base font-semibold">{d.label}</h3></div>
        <div className="text-right">
          <p className="font-mono leading-none tnum">{d.score_0_100 == null ? <span className="text-base text-faint">n/a</span> : <><span className="text-2xl font-semibold">{Math.round(d.score_0_100)}</span><span className="text-xs text-faint">/100</span></>}</p>
          <StepBar score={d.score_0_100} />
        </div>
      </header>
      <div className="flex-1 p-4">
        <p className="text-sm leading-relaxed text-muted">{d.summary}</p>
        {ev.length > 0 ? (
          <ul className="mt-3 space-y-2">{shown.map((e, i) => <EvidenceRow key={i} e={e} />)}</ul>
        ) : <p className="mt-3 font-mono text-[11px] text-faint">No quotes found for this dimension.</p>}
        {ev.length > 3 && (
          <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-2 min-h-[36px] font-mono text-[11px] uppercase tracking-[0.06em] text-muted underline decoration-border-strong underline-offset-4 hover:text-text">
            {all ? 'Show fewer' : `Show all (${ev.length})`}
          </button>
        )}
      </div>
    </article>
  )
}
function FlagList({ kind, items }: { kind: 'red' | 'green'; items: { text: string; source_url?: string | null }[] }) {
  return (
    <Section label={kind === 'red' ? 'Concerns' : 'Positives'} title={kind === 'red' ? 'Red flags' : 'Green flags'} right={<span className="font-mono text-[11px] text-faint tnum">{items.length}</span>}>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((f, i) => (
            <li key={i} className={`border border-l-2 border-border ${kind === 'red' ? 'border-l-red' : 'border-l-green'} bg-surface px-3 py-2`}>
              <p className="text-sm leading-relaxed">{f.text}</p>
              <SourceLink url={f.source_url} />
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-muted">None reported in public sources.</p>}
    </Section>
  )
}

function Report({ r, onShare }: { r: CompanyReport; onShare: () => void }) {
  const score = r.overall?.score_0_100 ?? null
  const site = safeUrl(r.website)
  const timeline = [...(r.layoffs_timeline ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const platforms = r.platforms_covered ?? []
  return (
    <div className="space-y-8">
      <section className="border border-border bg-surface" aria-label="Overall">
        <div className="grid gap-5 p-4 sm:grid-cols-[1fr_240px] sm:p-5">
          <div className="min-w-0">
            <p className="label">Company</p>
            <h2 className="mt-1 break-words text-2xl font-semibold">{r.company}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-muted">
              {site && <a href={site} target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-4 hover:text-text">{hostOf(site)}</a>}
              <span className="tnum">as of {fmtDate(r.as_of)}</span>
            </div>
          </div>
          <div>
            <p className="label">Overall score</p>
            <p className="mt-1 font-mono leading-none tnum">{score == null ? <span className="text-3xl text-faint">n/a</span> : <><span className="text-[44px] font-semibold">{Math.round(score)}</span><span className="text-sm text-faint"> / 100</span></>}</p>
            <ScoreBar score={score} />
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-faint">confidence <span className="text-text">{fmtConf(r.overall?.confidence)}</span></p>
          </div>
        </div>
        {r.overall?.verdict_text && <p className="border-t border-border px-4 py-3 text-sm leading-relaxed sm:px-5">{r.overall.verdict_text}</p>}
      </section>

      <Section label="Coverage" title="Platforms covered" right={
        <span className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-[0.06em] text-faint sm:inline-flex">
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden />reachable</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-border-strong" aria-hidden />login-walled</span>
        </span>}>
        {platforms.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {platforms.map((p) => {
              const status = p.reachable ? 'reachable' : 'login-walled or unreachable'
              return (
                <li key={String(p.platform)} title={`${PLATFORM_LABEL[p.platform] ?? p.platform}: ${p.items} items, ${status}${p.note ? `. ${p.note}` : ''}`} className="inline-flex items-center gap-2 border border-border bg-surface px-2.5 py-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${p.reachable ? 'bg-green' : 'bg-border-strong'}`} aria-hidden />
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em]">{(PLATFORM_LABEL[p.platform] ?? String(p.platform)).toUpperCase()}</span>
                  <span className="font-mono text-[11px] text-muted tnum">{p.items}</span>
                  <span className="sr-only">items, {status}{p.note ? `. ${p.note}` : ''}</span>
                </li>
              )
            })}
          </ul>
        ) : <p className="mt-3 text-sm text-muted">No platform coverage reported.</p>}
      </Section>

      <Section label="Dimensions" title="What employees report" right={<span className="font-mono text-[11px] text-faint tnum">{(r.dimensions ?? []).length}</span>}>
        <div className="mt-3 grid gap-4 md:grid-cols-2">{(r.dimensions ?? []).map((d) => <DimensionCard key={String(d.key)} d={d} />)}</div>
      </Section>

      <Section label="Stability" title="Layoffs and firing" right={<span className="font-mono text-[11px] text-faint tnum">{timeline.length}</span>}>
        {timeline.length ? (
          <ol className="ml-1 mt-4 border-l border-border-strong">
            {timeline.map((t, i) => (
              <li key={i} className="relative pb-4 pl-5 last:pb-0">
                <span className="absolute -left-[4px] top-[7px] h-[7px] w-[7px] border border-border-strong bg-surface" aria-hidden />
                <p className="font-mono text-[12px] text-text tnum">{fmtDate(t.date)}</p>
                <p className="mt-0.5 text-sm leading-relaxed">{t.what}</p>
                <SourceLink url={t.source_url} />
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 border border-dashed border-border-strong p-4 text-sm text-muted">No layoff or firing events found in public sources.</p>}
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <FlagList kind="red" items={r.red_flags ?? []} />
        <FlagList kind="green" items={r.green_flags ?? []} />
      </div>

      <Section label="Evidence" title="Sources" right={<span className="font-mono text-[11px] text-faint tnum">{(r.sources ?? []).length}</span>}>
        {(r.sources ?? []).length ? (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead><tr><th scope="col" className="pl-0">Title</th><th scope="col">Platform</th><th scope="col" className="hidden sm:table-cell">Host</th><th scope="col" className="pr-0 text-right">Link</th></tr></thead>
              <tbody>
                {r.sources.map((s, i) => (
                  <tr key={i}>
                    <td className="pl-0">{s.title || hostOf(s.url)}</td>
                    <td><PlatformBadge p={String(s.platform)} /></td>
                    <td className="hidden font-mono text-[11px] text-muted sm:table-cell">{hostOf(s.url)}</td>
                    <td className="pr-0 text-right"><SourceLink url={s.url} label="open" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-muted">No sources listed.</p>}
      </Section>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Not a guarantee; based on public reports as of <span className="font-mono tnum">{fmtDate(r.as_of)}</span>.</p>
        <button type="button" onClick={onShare} className="btn-secondary"><Link2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />Share</button>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export default function CompanyResearch() {
  useTitle('Company research')
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const id = sp.get('id')
  const sampleParam = sp.get('sample') === '1'
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [company, setCompany] = useState('')
  const [progress, setProgress] = useState<CompanyProgress[]>([])
  const [report, setReport] = useState<CompanyReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [inputErr, setInputErr] = useState<string | null>(null)
  const [kind, setKind] = useState<'job' | 'sample' | null>(null)
  const [recent, setRecent] = useState<CompanyRecent[]>(() => loadRecent())
  const run = useRef(0)
  const stop = useRef<() => void>(() => {})

  const halt = () => { stop.current(); stop.current = () => {} }
  const reset = (p: Phase, k: 'job' | 'sample' | null, name = '') => { setPhase(p); setKind(k); setError(null); setInputErr(null); setNotice(null); setReport(null); setProgress([]); setCompany(name) }
  const addLine = (d: CompanyProgress) => setProgress((p) => (p.some((x) => x.text === d.text && x.at === d.at) ? p : [...p, d]))
  const fail = (msg: string) => { setPhase('failed'); setError(msg) }
  const finish = (jobId: string, r: CompanyReport, token: number) => {
    if (token !== run.current) return
    setReport(r); setCompany(r.company); setPhase('done')
    setRecent(saveRecent({ id: jobId, company: r.company, at: nowIso() }))
  }

  const watch = (jobId: string, token: number) => {
    let poll: number | undefined
    const startPoll = () => {
      if (poll || token !== run.current) return
      let n = 0
      poll = window.setInterval(async () => {
        if (token !== run.current) { window.clearInterval(poll); return }
        if (++n > 200) { window.clearInterval(poll); fail('Still running after 10 minutes. Open this page again later to check.'); return }
        try {
          const j = await companyApi.get(jobId)
          if (token !== run.current) return
          if (j.progress?.length) setProgress((p) => (j.progress.length >= p.length ? j.progress : p))
          if (j.status === 'done' && j.report) { window.clearInterval(poll); finish(jobId, j.report, token) }
          else if (j.status === 'failed') { window.clearInterval(poll); fail(j.error || 'This research run failed. Try again in a minute.') }
        } catch { /* keep polling */ }
      }, 3000)
    }
    const unsub = subscribeCompany(jobId, {
      progress: (d) => { if (token === run.current) addLine(d) },
      done: (r) => { if (r) finish(jobId, r, token); else startPoll() },
      error: (m) => { if (token === run.current) fail(m) },
      onConnectionError: startPoll,
    })
    stop.current = () => { unsub(); if (poll) window.clearInterval(poll) }
  }

  const loadJob = async (jobId: string) => {
    const token = ++run.current; halt(); reset('loading', 'job')
    try {
      const j = await companyApi.get(jobId)
      if (token !== run.current) return
      setCompany(j.company || ''); setProgress(j.progress ?? [])
      if (j.status === 'done' && j.report) return finish(jobId, j.report, token)
      if (j.status === 'failed') return fail(j.error || 'This research run failed. Try again in a minute.')
      setPhase('running'); watch(jobId, token)
    } catch (e) {
      if (token !== run.current) return
      fail(e instanceof ApiError && e.status === 404 ? 'This research run was not found. It may have expired, or company research is not available on this server yet.' : e instanceof Error ? e.message : 'Could not load this research run.')
    }
  }

  const loadSample = async () => {
    const token = ++run.current; halt(); reset('loading', 'sample')
    let r: CompanyReport = DEMO_REPORT, demo = true
    try { const s = await companyApi.sample(); if (s && Array.isArray(s.dimensions)) { r = s; demo = false } } catch { /* fall back to built-in demo */ }
    if (token !== run.current) return
    if (demo) setNotice('The sample endpoint is not reachable, so this is built-in demo data for a fictional company. Quotes and links are illustrative.')
    finish('sample', r, token)
  }
  const goSample = () => { if (sampleParam && !id) loadSample(); else setSp({ sample: '1' }) }

  const start = async (name: string, website?: string, live = false) => {
    const token = ++run.current; halt(); reset('loading', 'job', name)
    try {
      const r = await companyApi.start(name, website)
      if (token !== run.current) return
      if (!r?.id) throw new ApiError('The server did not return a research id.', 500)
      setRecent(saveRecent({ id: r.id, company: name, at: nowIso() }))
      setSp({ id: r.id })
    } catch (e) {
      if (token !== run.current) return
      if (live) { toast.show('Live run unavailable. Showing the instant sample instead.', 'info'); goSample(); return }
      fail(e instanceof ApiError && (e.status === 404 || e.status === 405) ? NOT_AVAILABLE : e instanceof Error ? e.message : 'Could not start research.')
    }
  }

  useEffect(() => {
    if (id) loadJob(id)
    else if (sampleParam) loadSample()
    else { run.current++; halt(); reset('idle', null) }
    return () => { run.current++; halt() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sampleParam])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const v = input.trim()
    if (!v) { setInputErr('Enter a company name or website.'); return }
    const { company: name, website } = parseInput(v)
    start(name, website)
  }

  const share = async () => {
    const url = `${window.location.origin}/app/company?${id ? `id=${encodeURIComponent(id)}` : 'sample=1'}`
    try { await navigator.clipboard.writeText(url); toast.show('Link copied', 'success') } catch { window.prompt('Copy this link', url) }
  }

  const busy = phase === 'loading' || phase === 'running'
  const showLog = kind === 'job' && (busy || (phase === 'failed' && progress.length > 0))

  return (
    <div>
      <PageHead label="Employee reports" title="Company research"
        sub="What employees say about working there, organised and sourced. Nothing here is a verdict on the company; it is what public pages report."
        actions={report ? <button type="button" onClick={share} className="btn-secondary"><Link2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />Share</button> : undefined} />

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="company-q" className="sr-only">Company name or website</label>
        <input id="company-q" value={input} onChange={(e) => { setInput(e.target.value); setInputErr(null) }} placeholder="Company name or website" autoComplete="off" aria-invalid={!!inputErr} aria-describedby={inputErr ? 'company-q-err' : undefined} className="input h-11 sm:max-w-md" />
        <button type="submit" disabled={busy} className="btn-primary"><Search className="h-4 w-4" strokeWidth={2} aria-hidden />Research</button>
        <button type="button" onClick={goSample} disabled={phase === 'loading'} className="btn-secondary">Try a sample</button>
        <button type="button" onClick={() => start(LIVE_SAMPLE, undefined, true)} disabled={busy} title={`Starts a live research run for ${LIVE_SAMPLE} and streams each step`} className="btn-secondary">
          <Play className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />Run live sample
        </button>
      </form>
      {inputErr && <p id="company-q-err" role="alert" className="mt-2 text-sm text-red">{inputErr}</p>}

      {recent.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="label">Recent</span>
          {recent.map((r) => (
            <Link key={r.id} to={r.id === 'sample' ? '/app/company?sample=1' : `/app/company?id=${encodeURIComponent(r.id)}`} className="inline-flex min-h-[28px] items-center gap-2 text-sm text-muted underline decoration-border-strong underline-offset-4 hover:text-text">
              {r.company}<span className="font-mono text-[11px] text-faint tnum">{fmtDate(r.at)}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {error && <ErrorBox msg={error} onRetry={id ? () => loadJob(id) : undefined} />}
        {phase === 'failed' && !report && (
          <p className="text-sm text-muted">You can still <button type="button" onClick={goSample} className="underline underline-offset-4 hover:text-text">open the sample report</button> to see the layout.</p>
        )}
        {notice && <p className="border-l-2 border-amber py-1 pl-3 text-sm text-muted">{notice}</p>}
        {showLog && <ProgressLog lines={progress} running={busy} company={company} />}
        {busy && <ReportSkeleton />}
        {phase === 'done' && report && (
          <>
            {progress.length > 0 && (
              <details className="border border-border bg-surface">
                <summary className="flex min-h-[40px] cursor-pointer items-center px-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Progress log · {progress.length} lines</summary>
                <ProgressLog lines={progress} running={false} company={company} />
              </details>
            )}
            <Report r={report} onShare={share} />
          </>
        )}
        {phase === 'idle' && (
          <div className="border border-dashed border-border-strong p-6">
            <p className="text-sm font-medium">Enter a company to see what employees report about working there.</p>
            <p className="mt-1 text-sm text-muted">Each report scores eight dimensions from public posts and reviews, quotes the evidence, and links every source.</p>
            <ul className="mt-4 flex flex-wrap gap-1.5">{DIMENSIONS.map((d) => <li key={d} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">{d}</li>)}</ul>
            <ul className="mt-2 flex flex-wrap gap-1.5">{PLATFORMS.map((p) => <li key={p}><PlatformBadge p={p} /></li>)}</ul>
          </div>
        )}
      </div>
    </div>
  )
}
