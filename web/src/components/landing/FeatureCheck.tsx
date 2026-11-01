import { motion, useReducedMotion } from 'framer-motion'
import { useIsSmall } from './motion'

const ROWS: { code: string; name: string; finding: string; src: string; w: number }[] = [
  { code: 'S1', name: 'Money asked', finding: '₹2,999 “refundable” kit fee before joining', src: 'message', w: 40 },
  { code: 'S2', name: 'Employer identity', finding: 'Recruiter writes from gmail.com, not lumenretail.in', src: 'TinyFish Search', w: 15 },
  { code: 'S3', name: 'Domain age', finding: 'lumenretail.in registered in 2011', src: 'rdap.org', w: -10 },
  { code: 'S6', name: 'Cybercrime registry', finding: 'Number not on the suspect list', src: 'cybercrime.gov.in', w: -5 },
  { code: 'S8', name: 'Careers page', finding: 'Role is listed on the official site', src: 'lumenretail.in/careers', w: -20 },
]

/** Mini score ledger whose rows reveal in order as the card scrolls in. */
export function FeatureCheck() {
  const reduce = useReducedMotion()
  const small = useIsSmall()
  return (
    <div className="border border-border-strong bg-surface" aria-label="Illustrative score ledger" role="group">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium">Lumen Retail offer</span>
        <span className="font-mono text-sm text-muted">illustrative</span>
      </div>
      <ul>
        {ROWS.map((r, i) => (
          <motion.li key={r.code} initial={reduce ? false : { opacity: 0, x: small ? 0 : -16, y: small ? 8 : 0 }} whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, amount: 0.6 }} transition={{ duration: 0.4, delay: i * (small ? 0.08 : 0.14), ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-[40px_1fr_auto] items-start gap-x-3 border-b border-border px-4 py-3">
            <span className="font-mono text-sm text-muted">{r.code}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">{r.name}</p>
              <p className="mt-0.5 text-sm leading-snug text-muted">{r.finding}</p>
              <p className="mt-1 font-mono text-sm text-accent underline decoration-[var(--border-strong)] underline-offset-2">{r.src}</p>
            </div>
            <span className="font-mono text-sm font-semibold tnum" style={{ color: r.w > 0 ? 'var(--red)' : 'var(--green)' }}>{r.w > 0 ? `+${r.w}` : `−${-r.w}`}</span>
          </motion.li>
        ))}
      </ul>
      <motion.div initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: small ? 0.5 : 0.85 }}
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="font-mono text-sm text-muted">+7 more · rule 80 · Claude +16</span>
        <span className="inline-flex h-9 items-center gap-2 rounded-[4px] bg-red px-3 font-mono text-sm font-semibold text-white">HIGH RISK <span className="tnum">96</span></span>
      </motion.div>
    </div>
  )
}
