import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const id = useId()
  return (
    <div className="border-b border-border">
      <h3>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
          className="flex min-h-[56px] w-full items-center justify-between gap-4 py-3 text-left text-base font-medium text-text">
          <span>{q}</span>
          <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: reduce ? 0 : 0.2 }} className="shrink-0 text-muted" aria-hidden>
            <Plus className="h-5 w-5" strokeWidth={1.5} />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} key="a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <p className="max-w-2xl pb-5 text-[15px] leading-relaxed text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Faq({ items }: { items: [string, string][] }) {
  return <div className="border-t border-border">{items.map(([q, a]) => <Item key={q} q={q} a={a} />)}</div>
}
