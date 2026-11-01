import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUp, Bot, ChevronDown, FileSearch, Globe, ScanText, ShieldCheck } from 'lucide-react'
import { CheckForm } from '../components/CheckForm'
import { RecentWall } from '../components/RecentWall'
import { SIGNALS } from '../lib/signals'
import { useTitle } from '../lib/useTitle'

const SOURCES = ['cybercrime.gov.in', 'MCA company registry', 'Official careers pages', 'RDAP domain records', 'DNS mail records', 'URLhaus', 'Public scam reports', 'Company websites']

function Marquee() {
  const row = [...SOURCES, ...SOURCES]
  return (
    <div className="relative mt-12 overflow-hidden border-y border-border py-4 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]" aria-label="Sources Vouch checks">
      <ul className="flex w-max animate-marquee gap-10 motion-reduce:animate-none">
        {row.map((s, i) => (
          <li key={i} aria-hidden={i >= SOURCES.length} className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-faint">
            <span className="h-1 w-1 rounded-full bg-border-strong" />{s}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [v, setV] = useState(reduce ? to : 0)
  useEffect(() => {
    if (!inView || reduce) { if (reduce) setV(to); return }
    let raf = 0; const t0 = performance.now()
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / 900); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, reduce])
  return <span ref={ref}>{v}{suffix}</span>
}

const STEPS = [
  { n: '01', title: 'Extract', body: 'We read the message and pull out the company, domain, sender, money asked, contact channels and pressure tactics.', Icon: ScanText },
  { n: '02', title: 'Verify across the web', body: 'Twelve checks run in parallel: live searches, page fetches and a browsing agent that visits registries for you.', Icon: Globe },
  { n: '03', title: 'Verdict with receipts', body: 'A transparent rule engine scores the risk. Every finding links to the page it came from.', Icon: ShieldCheck },
]

const FAQ = [
  { q: 'Is Vouch free?', a: 'Yes. Paste a message, get a verdict. Signing in with Google is optional and only saves your history.' },
  { q: 'Do you store what I paste?', a: 'We keep the check so the result link works, but phone numbers and UPI IDs are masked and never stored in plain text.' },
  { q: 'If the result is green, is the offer safe?', a: 'A clean result is not a guarantee. It means we found no risk signals in public sources. Still confirm through the company’s official website or HR email.' },
  { q: 'What should I do if I’ve already paid?', a: 'Report it at cybercrime.gov.in or call 1930 as soon as possible. Fast reporting improves the chance of freezing the money.' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border">
      <h3>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[56px] w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium">
          {q}<ChevronDown className={`h-4 w-4 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden />
        </button>
      </h3>
      <motion.div initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} className="overflow-hidden">
        <p className="pb-5 text-sm leading-relaxed text-muted">{a}</p>
      </motion.div>
    </div>
  )
}

const fade = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }

export default function Landing() {
  useTitle('')
  const reduce = useReducedMotion()
  const toTop = () => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    setTimeout(() => document.querySelector<HTMLTextAreaElement | HTMLInputElement>('form textarea, form input[type=url]')?.focus(), reduce ? 0 : 400)
  }

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(198,241,53,0.10),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:56px_56px] opacity-[0.18] [mask-image:radial-gradient(70%_60%_at_50%_0%,#000,transparent)]" />
        <div className="container-x relative pt-10 sm:pt-16">
          <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />Built for students and freshers
            </span>
            <h1 className="mt-5 text-[34px] font-bold leading-[1.08] tracking-[-0.035em] sm:text-6xl">
              Is that job offer real?<br /><span className="text-muted">Know in 30 seconds.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Paste the WhatsApp message, email or offer letter. Vouch checks it against registries, the company’s own site and public scam reports, and shows you the receipts.
            </p>
          </motion.div>
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="mx-auto mt-8 max-w-2xl">
            <CheckForm />
          </motion.div>
          <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-faint">
            <li className="flex items-center gap-1.5"><span className="font-mono text-text"><CountUp to={12} /></span> independent checks</li>
            <li className="flex items-center gap-1.5"><span className="font-mono text-text">~<CountUp to={30} /> s</span> to a verdict</li>
            <li className="flex items-center gap-1.5"><span className="font-mono text-text">100%</span> sourced findings</li>
          </ul>
        </div>
        <Marquee />
      </section>

      <RecentWall />

      <section id="how" aria-labelledby="how-h" className="container-x mt-24 scroll-mt-20">
        <motion.div {...fade} className="max-w-2xl">
          <p className="eyebrow">How Vouch checks</p>
          <h2 id="how-h" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Three steps. Real pages. No guesswork.</h2>
        </motion.div>
        <ol className="mt-8 grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.li key={s.n} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }} className="card p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-accent">{s.n}</span>
                <s.Icon className="h-5 w-5 text-faint" strokeWidth={1.5} aria-hidden />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sig-h" className="container-x mt-24">
        <motion.div {...fade} className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <p className="eyebrow">12 signals</p>
            <h2 id="sig-h" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Every check, in the open.</h2>
            <p className="mt-3 text-muted">Each signal nudges the risk score up or down by a fixed weight. No black box.</p>
          </div>
          <Link to="/how" className="btn-secondary self-start sm:self-auto">See all weights<ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden /></Link>
        </motion.div>
        <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {SIGNALS.map((s) => (
            <li key={s.code} className="card flex min-h-[72px] items-center gap-3 p-4">
              <span className="font-mono text-xs text-faint">{s.code}</span>
              <span className="text-sm font-medium leading-snug">{s.name}</span>
              {s.agent && <Bot className="ml-auto h-4 w-4 shrink-0 text-accent" strokeWidth={1.5} aria-label="Uses browsing agent" />}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="real-h" className="container-x mt-24">
        <motion.div {...fade} className="card grid gap-8 overflow-hidden p-6 sm:p-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="eyebrow">Receipts, not vibes</p>
            <h2 id="real-h" className="mt-2 text-3xl font-bold tracking-tight">Every fact comes from a real page.</h2>
            <p className="mt-3 leading-relaxed text-muted">Vouch searches, fetches and browses live sources, then links each finding to where it was found. Tap any signal to see the page, the snippet and when we read it.</p>
          </div>
          <div className="space-y-2" aria-hidden>
            {[
              { c: 'S7', t: 'Company registry (MCA)', f: 'No active company found with this exact name', w: '+20', red: true, h: 'mca.gov.in' },
              { c: 'S2', t: 'Sender domain', f: 'Sender uses a free webmail address, not the company domain', w: '+25', red: true, h: 'search results' },
              { c: 'S8', t: 'Role on careers page', f: 'Role not listed on the official careers page', w: '+10', red: true, h: 'careers page' },
            ].map((r) => (
              <div key={r.c} className="rounded-[10px] border border-border bg-bg p-3">
                <div className="flex items-center gap-2 text-sm"><span className="font-mono text-[11px] text-faint">{r.c}</span><span className="font-medium">{r.t}</span>
                  <span className="ml-auto rounded-full bg-[var(--red-soft)] px-2 py-0.5 font-mono text-[11px] font-semibold text-red">{r.w}</span></div>
                <p className="mt-1 text-xs text-muted">{r.f}</p>
                <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-faint"><FileSearch className="h-3 w-3" strokeWidth={1.5} />{r.h}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section aria-labelledby="faq-h" className="container-x mt-24 grid gap-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-h" className="mt-2 text-3xl font-bold tracking-tight">Questions students ask</h2>
        </div>
        <div className="border-t border-border">{FAQ.map((f) => <FaqItem key={f.q} {...f} />)}</div>
      </section>

      <section className="container-x mt-24">
        <div className="card relative overflow-hidden p-8 text-center sm:p-14">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_100%,rgba(198,241,53,0.10),transparent_70%)]" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Got an offer that feels too good?</h2>
          <p className="relative mx-auto mt-3 max-w-md text-muted">Check it before you pay, share documents or reply.</p>
          <button onClick={toTop} className="btn-primary relative mt-6 h-12 px-6">Check an offer now<ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden /></button>
        </div>
      </section>
    </>
  )
}
