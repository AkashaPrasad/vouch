import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Bell, Briefcase, Building2, Globe } from 'lucide-react'
import { useCountUp, useIsSmall } from './motion'

const WATCHED = [
  { icon: Globe, host: 'northwindlabs.in/careers', kind: 'Careers page' },
  { icon: Briefcase, host: 'greenhouse.io/kestrel', kind: 'ATS board' },
  { icon: Building2, host: 'linkedin.com/company/orbit', kind: 'LinkedIn' },
]

/** A watched careers page emits a new posting that slides into the alerts column with a counting match score. */
export function FeatureWatch() {
  const reduce = useReducedMotion()
  const small = useIsSmall()
  const [go, setGo] = useState(!!reduce)
  const [count, setCount] = useState(!!reduce)
  useEffect(() => {
    if (!go || reduce) return
    const t = setTimeout(() => setCount(true), small ? 900 : 1500)
    return () => clearTimeout(t)
  }, [go, reduce, small])
  const match = useCountUp(86, count, 1100)
  const show = (delay: number) => ({ initial: reduce ? false : undefined, animate: go ? 'on' : 'off', transition: { duration: 0.45, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] as const } })

  return (
    <motion.div onViewportEnter={() => setGo(true)} viewport={{ once: true, amount: 0.4 }} className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Illustrative company watch">
      <div className="border border-border-strong bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium">Watching</span>
          <span className="font-mono text-sm text-muted">3 sources</span>
        </div>
        <ul>
          {WATCHED.map(({ icon: I, host, kind }, i) => (
            <li key={host} className="border-b border-border px-4 py-2.5 last:border-b-0">
              <div className="flex items-center gap-2">
                <I className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} aria-hidden />
                <span className="min-w-0 truncate text-sm text-text">{host}</span>
              </div>
              <p className="mt-0.5 pl-6 text-sm text-muted">{kind}</p>
              {i === 0 && (
                <motion.div {...show(0.3)} variants={{ off: { opacity: 0, height: 0 }, on: { opacity: 1, height: 'auto' } }} className="overflow-hidden pl-6">
                  <p className="mt-2 inline-flex items-center gap-2 rounded-[4px] border border-accent px-2 py-1 text-sm text-accent">
                    <span className="h-1.5 w-1.5 bg-accent" aria-hidden />1 new posting
                  </p>
                </motion.div>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2.5 text-sm text-muted">
          Wants: <span className="text-text">backend, freshers, Bengaluru</span> · resume added
        </div>
      </div>

      <div className="border border-border-strong bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-medium"><Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />Alerts</span>
          <span className="font-mono text-sm text-muted">today</span>
        </div>
        <div className="p-3">
          <motion.div {...show(small ? 0.6 : 1.0)} variants={{ off: { opacity: 0, x: small ? 0 : -32, y: small ? -12 : 0 }, on: { opacity: 1, x: 0, y: 0 } }}
            className="border border-accent bg-[var(--accent-soft)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">Backend Engineer I</p>
                <p className="text-sm text-muted">Northwind Labs · Bengaluru</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[24px] font-semibold leading-none text-accent tnum">{match}</p>
                <p className="mt-1 font-mono text-sm text-muted">match</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">Go, PostgreSQL, 0–1 yrs. Matches your resume and the role you asked for.</p>
          </motion.div>
          <div className="mt-2 border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm text-text">Data Analyst Intern</p><p className="text-sm text-muted">Orbit AI · Remote</p></div>
              <p className="font-mono text-sm text-muted tnum">41</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
