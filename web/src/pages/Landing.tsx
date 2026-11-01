import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { AppWindow, ArrowRight, Bot, BookOpen, Check, FileText, Radar, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { ExampleLedger } from '../components/ExampleLedger'
import { HeroDemo } from '../components/landing/HeroDemo'
import { SourcesMarquee } from '../components/landing/SourcesMarquee'
import { FeatureCheck } from '../components/landing/FeatureCheck'
import { FeatureWatch } from '../components/landing/FeatureWatch'
import { FeatureCompany } from '../components/landing/FeatureCompany'
import { Stats } from '../components/landing/Stats'
import { Faq } from '../components/landing/Faq'
import { Eyebrow, Reveal, SectionHead, useIsSmall } from '../components/landing/motion'
import { useTitle } from '../lib/useTitle'

const FEATURES: { id: string; n: string; eyebrow: string; title: string; body: string; bullets: string[]; art: ReactNode }[] = [
  {
    id: 'check', n: '01', eyebrow: 'Check an offer', title: 'Paste a message or a job link. Get a verdict with receipts.',
    body: 'Twelve evidence checks run in parallel, from money asked and domain age to the cybercrime registry and the official careers page.',
    bullets: [
      'A score ledger from 50 lands on one of four outcomes: likely genuine, be careful, high risk or could not verify.',
      'Claude adds a bounded second opinion. It can argue a misread, never override a hard rule.',
      'Every claim links to its source, with a live view of the agents browsing, screenshots and an optional deep dossier.',
    ],
    art: <FeatureCheck />,
  },
  {
    id: 'watch', n: '02', eyebrow: 'Watch companies', title: 'Hear about the right opening the day it goes up.',
    body: 'Watch careers pages, ATS boards like Greenhouse and Lever, or LinkedIn company pages.',
    bullets: [
      'Tell Vouch the field and roles you want with presets or plain language, or add your resume.',
      'New postings are scored against what you asked for, so alerts stay few and relevant.',
      'Each alert links straight to the official posting, already checked.',
    ],
    art: <FeatureWatch />,
  },
  {
    id: 'research', n: '03', eyebrow: 'Company research', title: 'Know what it is like inside before you join.',
    body: 'An organised dossier on culture, work-life balance, pay, management, layoffs and firing practice, and how freshers are treated.',
    bullets: [
      'Quotes from Reddit, AmbitionBox, Glassdoor, Blind, X, LinkedIn posts and news.',
      'Every quote and number links to the page it came from.',
      'Grouped by dimension, so you can compare two offers in minutes.',
    ],
    art: <FeatureCompany />,
  },
]

const STEPS = [
  ['01', 'Extract', 'Claude reads the message or page and pulls out the company, sender, money asked, links and pressure tactics. A regex pass runs alongside.'],
  ['02', 'Verify in parallel', 'Twelve checks fan out at once across TinyFish and free public registries. Each one returns evidence with a link.'],
  ['03', 'Score with rules', 'A deterministic ledger starts at 50. Risk adds, reassurance subtracts. A money request always forces at least be careful.'],
  ['04', 'Claude second opinion', 'A reasoned read of all the evidence, bounded to ±25 points. Hard rules always stand.'],
]

const OUTCOMES: [string, string, string][] = [
  ['LIKELY GENUINE', '0–29', 'var(--green)'], ['BE CAREFUL', '30–59', 'var(--amber)'], ['HIGH RISK', '60–100', 'var(--red)'], ['COULD NOT VERIFY', 'too few checks', 'var(--text-muted)'],
]

const TINYFISH: { icon: typeof Search; name: string; line: string }[] = [
  { icon: Search, name: 'Search', line: 'Finds the official site, scam reports and news for a company, number or email.' },
  { icon: FileText, name: 'Fetch', line: 'Reads registries, careers pages and linked sites as clean text.' },
  { icon: Bot, name: 'Agent', line: 'Browses portals with no API, like cybercrime.gov.in and MCA.' },
  { icon: BookOpen, name: 'Research', line: 'Builds the multi-source company dossier, every line cited.' },
  { icon: AppWindow, name: 'Browser', line: 'Live preview of agents at work, plus screenshots as receipts.' },
  { icon: Radar, name: 'Monitor', line: 'Watches careers pages and ATS boards for new postings.' },
]

const FAQ: [string, string][] = [
  ['Is Vouch free?', 'Yes. Open the dashboard and run a check. Signing in with Google is optional and only saves your history, watches and dossiers.'],
  ['Do you store what I paste?', 'The check is kept so the result link works. Phone numbers and UPI ids are hashed and never stored in plain text.'],
  ['If the result is green, is the offer safe?', 'No result is a guarantee. Likely genuine means no risk signals were found in public sources. Still confirm through the company’s official website or HR email.'],
  ['Where does the evidence come from?', 'Every web fact comes from TinyFish Search, Fetch, Agent, Research, Browser and Monitor, plus free registries such as RDAP, DNS and URLhaus. Each finding links to the page it was read from.'],
  ['What should I do if I already paid?', 'Report it at cybercrime.gov.in or call 1930 as soon as possible. Fast reporting improves the chance of freezing the money.'],
]

function Hero() {
  const reduce = useReducedMotion()
  const small = useIsSmall()
  const rise = (d: number) => ({ initial: reduce ? false : { opacity: 0, y: small ? 8 : 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d, ease: [0.22, 1, 0.36, 1] as const } })
  return (
    <section className="container-x grid gap-10 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1fr_minmax(0,560px)] lg:items-center lg:gap-14 lg:pb-24 lg:pt-20">
      <div className="min-w-0">
        <motion.div {...rise(0)}><Eyebrow>For Indian students and freshers</Eyebrow></motion.div>
        <motion.h1 {...rise(0.06)} className="mt-4 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px] lg:text-[64px]">
          Know before<br />you say yes.
        </motion.h1>
        <motion.p {...rise(0.12)} className="mt-5 max-w-[30rem] text-[17px] leading-relaxed text-muted">
          Vouch checks a job offer against live public evidence, watches the companies you want, and researches them before you join, with a source behind every claim.
        </motion.p>
        <motion.div {...rise(0.18)} className="mt-7 flex flex-wrap gap-2">
          <Link to="/app" className="btn-primary h-12 px-6 text-[15px]">Open dashboard<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link>
          <a href="#how" className="btn-secondary h-12 px-6 text-[15px]">See how it scores</a>
        </motion.div>
        <motion.ul {...rise(0.24)} className="mt-8 grid gap-2 text-sm text-muted sm:grid-cols-2">
          {['Twelve checks, first verdict in about 20 s', 'Every claim linked to its source', 'Free to use, sign-in optional', 'Never accuses a company'].map((t) => (
            <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />{t}</li>
          ))}
        </motion.ul>
      </div>
      <motion.div className="min-w-0" initial={reduce ? false : { opacity: 0, y: small ? 10 : 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
        <HeroDemo />
      </motion.div>
    </section>
  )
}

export default function Landing() {
  useTitle('')
  return (
    <div className="overflow-x-clip">
      <Hero />
      <SourcesMarquee />

      <section aria-labelledby="features-h" className="container-x pt-20 sm:pt-28">
        <SectionHead id="features-h" eyebrow="What Vouch does" title="Three tools for the moment an offer arrives.">
          Check it, keep an eye on the companies you actually want, and learn what working there is like.
        </SectionHead>
        <div className="mt-14 flex flex-col gap-20 sm:gap-28">
          {FEATURES.map((f, i) => (
            <article key={f.id} id={f.id} aria-labelledby={`${f.id}-h`} className="grid scroll-mt-20 items-center gap-8 lg:grid-cols-2 lg:gap-16">
              <Reveal className={`min-w-0 ${i % 2 ? 'lg:order-2' : ''}`}>
                <p className="font-mono text-sm text-muted"><span className="text-accent">{f.n}</span> · {f.eyebrow}</p>
                <h3 id={`${f.id}-h`} className="mt-3 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[28px]">{f.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted">{f.body}</p>
                <ul className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
                  {f.bullets.map((b) => (
                    <li key={b} className="grid grid-cols-[20px_1fr] gap-2 text-[15px] leading-relaxed text-text">
                      <span className="mt-[9px] h-1.5 w-1.5 bg-accent" aria-hidden />{b}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.1} className={`min-w-0 ${i % 2 ? 'lg:order-1' : ''}`}>{f.art}</Reveal>
            </article>
          ))}
        </div>
      </section>

      <section id="how" aria-labelledby="how-h" className="container-x scroll-mt-20 pt-24 sm:pt-32">
        <SectionHead id="how-h" eyebrow="How it scores" title="Start at 50. Risk adds, reassurance subtracts.">
          The rule engine sets the band. The language model extracts and explains, and its second opinion is capped.
        </SectionHead>
        <Reveal className="mt-8 border border-border bg-surface p-3 sm:p-5">
          <ExampleLedger />
          <p className="mt-2 font-mono text-sm text-muted sm:hidden">Swipe sideways to see the full ledger.</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">Example: a money request (+40), a free-mail sender (+15) and a weeks-old domain (+20) push the score past 60 on their own.</p>
        </Reveal>
        <Reveal className="mt-4">
          <ul className="flex flex-wrap gap-2" aria-label="Outcomes">
            {OUTCOMES.map(([l, r, c]) => (
              <li key={l} className="inline-flex h-9 items-center gap-2 rounded-[4px] border bg-surface px-3 font-mono text-sm" style={{ borderColor: c, color: c }}>
                <span className="font-semibold">{l}</span><span className="text-muted">{r}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <ol className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, t, b], i) => (
            <li key={n} className="bg-bg">
              <Reveal delay={i * 0.08} className="h-full p-5">
                <span className="font-mono text-sm text-accent">{n}</span>
                <h3 className="mt-3 text-base font-semibold">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <Reveal className="mt-4"><Link to="/how" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent hover:underline">Read the full method<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link></Reveal>
      </section>

      <section aria-labelledby="tf-h" className="container-x pt-20 sm:pt-28">
        <SectionHead id="tf-h" eyebrow="Built on TinyFish" title="Every web fact comes from a real page.">
          Six TinyFish products do the reading, browsing and watching. Vouch never invents a source.
        </SectionHead>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TINYFISH.map(({ icon: I, name, line }, i) => (
            <li key={name}>
              <Reveal delay={(i % 3) * 0.06} className="h-full border border-border bg-surface p-5 transition-colors hover:border-border-strong">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-[4px] bg-[var(--accent-soft)] text-accent"><I className="h-4 w-4" strokeWidth={1.75} aria-hidden /></span>
                  <h3 className="text-base font-semibold"><span className="font-mono text-sm font-normal text-muted">TinyFish </span>{name}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{line}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Vouch in numbers" className="container-x pt-20 sm:pt-28"><Stats /></section>

      <section aria-labelledby="faq-h" className="container-x grid gap-6 pt-20 sm:pt-28 lg:grid-cols-[1fr_1.6fr] lg:gap-12">
        <SectionHead id="faq-h" eyebrow="FAQ" title="Questions students ask." />
        <Reveal><Faq items={FAQ} /></Reveal>
      </section>

      <section className="container-x pt-20 sm:pt-28">
        <Reveal className="flex flex-col items-start justify-between gap-6 border border-border-strong bg-surface p-6 sm:p-10 md:flex-row md:items-center">
          <div className="max-w-xl">
            <Eyebrow>Before you pay, reply or share documents</Eyebrow>
            <p className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">Check the offer. It takes about twenty seconds.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app" className="btn-primary h-12 px-6 text-[15px]">Open dashboard<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link>
            <Link to="/how" className="btn-secondary h-12 px-6 text-[15px]">Read the method</Link>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
