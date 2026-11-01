import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { SignalTable } from '../components/SignalTable'
import { ExampleLedger } from '../components/ExampleLedger'
import { useTitle } from '../lib/useTitle'

const STEPS = [
  ['01', 'Extract', 'Claude Haiku reads the message or page and pulls out the company, sender, money asked, contact channels and pressure tactics. A regex pass runs alongside as a safety net.'],
  ['02', 'Verify across the web', 'Twelve checks fan out in parallel. TinyFish Search finds the official site and scam reports, Fetch reads registries and careers pages, Agent browses portals that have no API.'],
  ['03', 'Verdict with receipts', 'A deterministic rule engine scores from 50. Every finding links to the page it came from. Share the card, run a research dossier, watch the role.'],
]
const FAQ = [
  ['Is Vouch free?', 'Yes. Open the dashboard and run a check. Signing in with Google is optional and only saves your history.'],
  ['Do you store what I paste?', 'The check is kept so the result link works. Phone numbers and UPI ids are hashed and never stored in plain text.'],
  ['If the result is green, is the offer safe?', 'No result is a guarantee. Green means no risk signals were found in public sources. Still confirm through the company’s official website or HR email.'],
  ['A job on LinkedIn or Naukri: does the platform count as the company?', 'No. Platforms, forms, messaging apps and link shorteners are classified as hosts, not as the company. Only a real company domain can earn green credit.'],
  ['What should I do if I already paid?', 'Report it at cybercrime.gov.in or call 1930 as soon as possible. Fast reporting improves the chance of freezing the money.'],
]
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border">
      <h3><button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[52px] w-full items-center justify-between gap-4 py-3 text-left text-[15px] font-medium"><span>{q}</span><span className="font-mono text-faint" aria-hidden>{open ? '−' : '+'}</span></button></h3>
      {open && <p className="pb-4 text-sm leading-relaxed text-muted">{a}</p>}
    </div>
  )
}

export default function Landing() {
  useTitle('')
  return (
    <div className="container-x">
      <section className="grid gap-10 pt-12 md:grid-cols-[1.1fr_1fr] md:items-end md:pt-20">
        <div>
          <p className="label">Job offer verification</p>
          <h1 className="mt-3 text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[52px]">Is that job offer real?</h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted">Paste a message, offer letter or link. Vouch runs twelve checks against live web evidence and shows every receipt, in about 30 seconds.</p>
          <div className="mt-6 flex flex-wrap gap-2"><Link to="/app" className="btn-primary h-12 px-6">Open dashboard<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link><Link to="/how" className="btn-secondary h-12 px-6">How it scores</Link></div>
        </div>
        <dl className="grid grid-cols-3 gap-4 border-t border-border pt-4 md:border-t-0 md:border-l md:pl-8 md:pt-0">
          <div><dt className="label">Checks</dt><dd className="mt-1 font-mono text-2xl tnum">12</dd></div>
          <div><dt className="label">First verdict</dt><dd className="mt-1 font-mono text-2xl tnum">≤ 30 s</dd></div>
          <div><dt className="label">Sourced</dt><dd className="mt-1 font-mono text-2xl tnum">100%</dd></div>
        </dl>
      </section>

      <section aria-labelledby="score-h" className="mt-20">
        <div className="flex items-end justify-between border-b border-border pb-2"><div><p className="label">How it scores</p><h2 id="score-h" className="mt-1 text-base font-semibold">Start at 50. Risk adds, reassurance subtracts.</h2></div><Link to="/how" className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint hover:text-text">Full method →</Link></div>
        <div className="mt-3"><ExampleLedger /></div>
        <p className="mt-2 max-w-2xl text-sm text-muted">Example: a money request (+40), a free-mail sender (+15) and a weeks-old domain (+20) land at 100 before the hard rule. 0–29 is likely genuine, 30–59 be careful, 60–100 high risk.</p>
      </section>

      <section aria-labelledby="sig-h" className="mt-20"><div className="border-b border-border pb-2"><p className="label">Method</p><h2 id="sig-h" className="mt-1 text-base font-semibold">The 12 signals</h2></div><SignalTable withWhat={false} /></section>

      <section aria-labelledby="steps-h" className="mt-20">
        <div className="border-b border-border pb-2"><p className="label">Pipeline</p><h2 id="steps-h" className="mt-1 text-base font-semibold">Three steps, every fact from a real page</h2></div>
        <ol className="grid gap-px border-b border-border md:grid-cols-3">{STEPS.map(([n, t, b]) => <li key={n} className="py-5 md:border-r md:border-border md:pr-6 md:last:border-r-0"><span className="font-mono text-xs text-faint">{n}</span><h3 className="mt-2 font-semibold">{t}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{b}</p></li>)}</ol>
      </section>

      <section aria-labelledby="faq-h" className="mt-20 grid gap-6 md:grid-cols-[1fr_1.6fr]">
        <div><p className="label">FAQ</p><h2 id="faq-h" className="mt-1 text-base font-semibold">Questions students ask</h2></div>
        <div className="border-t border-border">{FAQ.map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}</div>
      </section>

      <section className="mt-20 flex flex-col items-start justify-between gap-4 border border-border bg-surface p-6 sm:flex-row sm:items-center">
        <div><p className="label">Ready</p><p className="mt-1 text-lg font-semibold">Check an offer before you pay, reply or share documents.</p></div>
        <Link to="/app/new" className="btn-primary h-12 px-6">New check<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link>
      </section>
    </div>
  )
}
