import { useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/** True below the sm breakpoint; used to lighten motion on phones. */
export function useIsSmall() {
  const q = '(max-width: 639px)'
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setSmall(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return small
}

/** Eased count from 0 to target once `run` turns true. Jumps straight to target under reduced motion. */
export function useCountUp(target: number, run: boolean, duration = 1200) {
  const reduce = useReducedMotion()
  const [v, setV] = useState(reduce ? target : 0)
  useEffect(() => {
    if (!run) return
    if (reduce) { setV(target); return }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [run, target, duration, reduce])
  return v
}

/** Fade-and-rise on first scroll into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  const small = useIsSmall()
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: small ? 10 : 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }} transition={{ duration: small ? 0.35 : 0.5, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-sm uppercase tracking-[0.08em] text-muted">{children}</p>
}

export function SectionHead({ eyebrow, title, id, children }: { eyebrow: string; title: string; id: string; children?: ReactNode }) {
  return (
    <Reveal className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">{title}</h2>
      {children && <p className="mt-3 text-base leading-relaxed text-muted">{children}</p>}
    </Reveal>
  )
}
