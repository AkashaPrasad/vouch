import { motion, useReducedMotion } from 'framer-motion'
import { useIsSmall } from './motion'

const DIMS: [string, number, number][] = [
  ['Culture', 3.9, 14], ['Work-life balance', 3.1, 22], ['Pay', 3.6, 18], ['Management', 3.4, 11], ['Layoffs and firing', 2.4, 9], ['Freshers', 4.1, 16],
]
const PLATFORMS = ['Reddit', 'AmbitionBox', 'Glassdoor', 'Blind', 'X', 'LinkedIn', 'News']
const col = (v: number) => (v >= 3.5 ? 'var(--green)' : v >= 2.5 ? 'var(--amber)' : 'var(--red)')

/** Research dossier: dimension bars fill to their scores, then source platforms and a cited quote appear. */
export function FeatureCompany() {
  const reduce = useReducedMotion()
  const small = useIsSmall()
  const step = small ? 0.06 : 0.1
  return (
    <div className="border border-border-strong bg-surface" role="group" aria-label="Illustrative company dossier">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium">Northwind Labs dossier</span>
        <span className="font-mono text-sm text-muted">90 sources</span>
      </div>
      <ul className="px-4 py-2">
        {DIMS.map(([name, v, n], i) => (
          <li key={name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[150px_1fr_auto]">
            <span className="text-sm text-text">{name}</span>
            <span className="order-last col-span-2 h-2 bg-surface-2 sm:order-none sm:col-span-1">
              <motion.span className="block h-full origin-left" style={{ width: `${(v / 5) * 100}%`, background: col(v) }}
                initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 0.7, delay: i * step, ease: [0.22, 1, 0.36, 1] }} />
            </span>
            <span className="font-mono text-sm text-text tnum sm:w-[76px] sm:text-right">{v.toFixed(1)} <span className="text-muted">· {String(n).padStart(2, ' ')}</span></span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-4 py-3">
        <ul className="flex flex-wrap gap-1.5" aria-label="Platforms quoted">
          {PLATFORMS.map((p, i) => (
            <motion.li key={p} initial={reduce ? false : { opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.5 + i * (small ? 0.04 : 0.07) }}
              className="rounded-[4px] border border-border-strong px-2 py-0.5 font-mono text-sm text-text">{p}</motion.li>
          ))}
        </ul>
        <motion.blockquote initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: small ? 0.7 : 1.1 }}
          className="mt-3 border-l-2 border-accent pl-3 text-sm leading-relaxed text-text">
          “Freshers get a named mentor for the first three months. On-call starts around month four.”
          <footer className="mt-1 font-mono text-sm text-accent underline decoration-[var(--border-strong)] underline-offset-2">r/developersIndia · 2026</footer>
        </motion.blockquote>
      </div>
    </div>
  )
}
