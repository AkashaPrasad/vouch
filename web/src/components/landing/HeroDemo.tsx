import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useIsSmall } from './motion'

type Band = 'red' | 'green'
interface Scenario { tab: string; kind: string; text: string; weights: number[]; claude: number; note: string; band: Band; label: string }

const NAMES = ['Fee asked', 'Employer', 'Domain age', 'Mail DNS', 'Scam flags', 'Cybercrime', 'MCA', 'Careers', 'Contact', 'Pressure', 'Site match', 'URL check']

// Weights are real ledger moves from a start of 50; the totals below are exact.
// A: 50 + 30 = 80 rule score, Claude +16 (bounded ±25) = 96.  B: 50 − 30 = 20, Claude agrees.
const SCENARIOS: Scenario[] = [
  {
    tab: 'WhatsApp message', kind: 'Pasted message',
    text: 'Congratulations! You are shortlisted for Data Entry Executive at Lumen Retail. Salary ₹38,000/month, work from home. Pay ₹2,999 refundable kit fee today to confirm. HR: lumen.hr.desk@gmail.com, WhatsApp only.',
    weights: [40, 15, -10, 0, 0, -5, -10, -20, 10, 10, 0, 0], claude: 16,
    note: 'Real company, real opening, but a Gmail recruiter asking a fee on WhatsApp: impersonation.', band: 'red', label: 'HIGH RISK',
  },
  {
    tab: 'LinkedIn listing', kind: 'Job link',
    text: 'linkedin.com/jobs/view/4091877312 · Software Engineer I · Northwind Labs · Bengaluru. Apply on northwindlabs.in/careers by Friday. Recruiter replies on LinkedIn.',
    weights: [0, -30, 0, 0, 0, 0, 0, -20, 10, 10, 0, 0], claude: 0,
    note: 'Listing matches the official careers page and domain. The deadline is ordinary hiring language.', band: 'green', label: 'LIKELY GENUINE',
  },
]

const T = { typeStart: 300, typeDur: 2000, chipsStart: 2600, stagger: 120, claudeAt: 4500, verdictAt: 5100, end: 9000 }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface Frame { idx: number; typed: number; resolved: number; claude: boolean; verdict: boolean; fading: boolean }
function frameAt(idx: number, t: number): Frame {
  const len = SCENARIOS[idx].text.length
  return {
    idx,
    typed: clamp(Math.floor(((t - T.typeStart) / T.typeDur) * len), 0, len),
    resolved: clamp(Math.floor((t - T.chipsStart) / T.stagger) + 1, 0, 12),
    claude: t >= T.claudeAt, verdict: t >= T.verdictAt, fading: t >= T.end - 350,
  }
}
const finalFrame = (idx: number): Frame => ({ idx, typed: SCENARIOS[idx].text.length, resolved: 12, claude: true, verdict: true, fading: false })
const same = (a: Frame, b: Frame) => a.idx === b.idx && a.typed === b.typed && a.resolved === b.resolved && a.claude === b.claude && a.verdict === b.verdict && a.fading === b.fading

const BAND = { red: 'var(--red)', green: 'var(--green)' }
const tone = (w: number) => (w > 0 ? 'red' : 'green') as Band

/** Looping, deterministic demo of a check: typing, twelve parallel signals, ledger, second opinion, verdict. */
export function HeroDemo() {
  const reduce = useReducedMotion()
  const small = useIsSmall()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.3 })
  const [f, setF] = useState<Frame>(() => (reduce ? finalFrame(0) : frameAt(0, 0)))
  const idxRef = useRef(0)
  const tRef = useRef(0)
  const [restart, setRestart] = useState(0)

  useEffect(() => {
    if (reduce) { setF(finalFrame(idxRef.current)); return }
    if (!inView) return
    let raf = 0
    let start = performance.now() - tRef.current
    let last = frameAt(idxRef.current, tRef.current)
    const tick = (now: number) => {
      let t = now - start
      if (t >= T.end) { idxRef.current = (idxRef.current + 1) % SCENARIOS.length; start = now; t = 0 }
      tRef.current = t
      const next = frameAt(idxRef.current, t)
      if (!same(next, last)) { last = next; setF(next) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, inView, restart])

  const pick = (i: number) => {
    idxRef.current = i; tRef.current = 0
    if (reduce) setF(finalFrame(i)); else { setF(frameAt(i, 0)); setRestart((r) => r + 1) }
  }

  const sc = SCENARIOS[f.idx]
  const rule = clamp(50 + sc.weights.slice(0, f.resolved).reduce((a, b) => a + b, 0), 0, 100)
  const score = clamp(rule + (f.claude ? sc.claude : 0), 0, 100)
  const finalScore = clamp(50 + sc.weights.reduce((a, b) => a + b, 0) + sc.claude, 0, 100)
  const fillCol = score >= 60 ? 'var(--red)' : score >= 30 ? 'var(--amber)' : 'var(--green)'

  return (
    <div ref={ref} className="border border-border-strong bg-surface" role="group" aria-label="Animated example of a Vouch check">
      <p className="sr-only">Example: a WhatsApp job message asking for a ₹2,999 fee resolves to HIGH RISK 96; a LinkedIn listing that matches the official careers page resolves to LIKELY GENUINE 20.</p>

      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
        <span className="font-mono text-sm text-muted">New check</span>
        <div className="flex gap-1" role="tablist" aria-label="Example scenario">
          {SCENARIOS.map((s, i) => (
            <button key={s.tab} role="tab" aria-selected={f.idx === i} onClick={() => pick(i)}
              className={`min-h-[36px] px-2 font-mono text-sm transition-colors sm:px-2.5 ${f.idx === i ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`}>
              {small ? (i === 0 ? 'Message' : 'Listing') : s.tab}
            </button>
          ))}
        </div>
      </div>

      <motion.div aria-hidden animate={{ opacity: f.fading ? 0 : 1 }} transition={{ duration: 0.3 }} className="p-3 sm:p-4">
        {/* input */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">{sc.kind}</span>
          <span className="font-mono text-sm text-muted">{f.typed < sc.text.length ? 'pasting…' : `${sc.text.length} chars`}</span>
        </div>
        <div className="mt-2 grid rounded-[4px] border border-border bg-bg px-3 py-2.5 text-sm leading-[1.6] text-text">
          {SCENARIOS.map((s) => <span key={s.tab} className="invisible [grid-area:1/1]">{s.text}</span>)}
          <span className="[grid-area:1/1] break-words">{sc.text.slice(0, f.typed)}{f.resolved === 0 && <span className="vl-caret" />}</span>
        </div>

        {/* signals */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium text-text">Twelve checks in parallel</span>
          <span className="font-mono text-sm text-muted tnum">{f.resolved}/12</span>
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {NAMES.map((name, i) => {
            const done = i < f.resolved
            const w = sc.weights[i]
            const col = done ? BAND[tone(w)] : undefined
            return (
              <li key={i} className="[perspective:600px]">
                <motion.div key={`${f.idx}-${done}`} initial={done && !reduce ? (small ? { opacity: 0.4 } : { rotateX: -90, opacity: 0.4 }) : false}
                  animate={{ rotateX: 0, opacity: 1 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="flex h-9 items-center gap-1 rounded-[4px] border px-1.5 text-sm sm:px-2"
                  style={{ borderColor: col ?? 'var(--border)', background: done ? (w > 0 ? 'var(--red-soft)' : 'var(--green-soft)') : 'var(--surface-2)', color: col ?? 'var(--text-muted)' }}>
                  <span className="w-[29px] shrink-0 font-mono">S{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: done ? 'var(--text)' : undefined }}>{name}</span>
                  <span className="shrink-0 font-mono tnum">{done ? (w > 0 ? `+${w}` : w < 0 ? `−${-w}` : '0') : '··'}</span>
                </motion.div>
              </li>
            )
          })}
        </ul>

        {/* ledger bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text">Score ledger</span>
            <span className="font-mono text-muted tnum"><span className="hidden sm:inline">start 50 · </span>rule {rule}{f.claude && sc.claude !== 0 ? ` · Claude +${sc.claude}` : ''}</span>
          </div>
          <div className="relative mt-2 h-3">
            <div className="absolute inset-y-0 left-0 w-[30%] bg-[var(--green-soft)]" />
            <div className="absolute inset-y-0 left-[30%] w-[30%] bg-[var(--amber-soft)]" />
            <div className="absolute inset-y-0 left-[60%] w-[40%] bg-[var(--red-soft)]" />
            <div className="absolute -inset-y-1 left-1/2 w-px bg-border-strong" />
            <motion.div className="absolute inset-y-0" initial={false}
              animate={{ left: `${Math.min(50, score)}%`, width: `${Math.abs(score - 50)}%`, backgroundColor: fillCol }}
              transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }} />
            <motion.div className="absolute -inset-y-1.5 w-0.5 bg-text" initial={false} animate={{ left: `calc(${score}% - 1px)` }} transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-sm text-muted"><span>0</span><span>50</span><span>100</span></div>
        </div>

        {/* second opinion + verdict */}
        <div className="mt-3 grid min-h-[76px] gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <motion.p initial={false} animate={{ opacity: f.claude ? 1 : 0.35 }} className="text-sm leading-snug text-muted">
            <span className="font-medium text-text">Claude second opinion</span>{' '}
            <span className="font-mono">{f.claude ? (sc.claude ? `+${sc.claude}` : 'agrees') : '…'}</span>
            <span className="mt-0.5 block">{f.claude ? sc.note : 'Waiting for evidence.'}</span>
          </motion.p>
          <div className="flex items-center gap-2 sm:justify-end">
            {f.verdict ? (
              <motion.span key={`v-${f.idx}`} initial={reduce ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex h-10 items-center gap-2.5 rounded-[4px] px-3 font-mono text-sm font-semibold tracking-[0.04em] text-white" style={{ background: BAND[sc.band] }}>
                {sc.label}<span className="text-lg tnum">{finalScore}</span>
              </motion.span>
            ) : (
              <span className="inline-flex h-10 items-center gap-2 rounded-[4px] border border-border-strong px-3 font-mono text-sm text-muted">
                <span className="h-2 w-2 animate-pulse-soft rounded-full bg-[var(--text-muted)]" />checking<span className="tnum">{score}</span>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
