import { useState } from 'react'
import { motion } from 'framer-motion'
import { useCountUp } from './motion'

const STATS: { n: number; pre?: string; suf?: string; label: string }[] = [
  { n: 12, label: 'evidence checks per offer' },
  { n: 20, pre: '≤ ', suf: ' s', label: 'to the first verdict' },
  { n: 6, label: 'TinyFish products underneath' },
  { n: 4, label: 'clear outcomes, never a guess' },
]

function Stat({ n, pre, suf, label, run }: (typeof STATS)[number] & { run: boolean }) {
  const v = useCountUp(n, run, 1000)
  return (
    <li className="bg-bg px-4 py-6 sm:px-6">
      <p className="font-mono text-[32px] font-semibold sm:text-[40px] leading-none tracking-[-0.02em] text-text tnum">{pre}{v}{suf}</p>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </li>
  )
}

/** Four headline numbers that count up once on view. */
export function Stats() {
  const [run, setRun] = useState(false)
  return (
    <motion.ul onViewportEnter={() => setRun(true)} viewport={{ once: true, amount: 0.5 }} className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
      {STATS.map((s) => <Stat key={s.label} {...s} run={run} />)}
    </motion.ul>
  )
}
