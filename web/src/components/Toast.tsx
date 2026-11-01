import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, XCircle, X } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
interface T { id: number; msg: string; kind: Kind }
const Ctx = createContext<{ show: (msg: string, kind?: Kind) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), [])
  const show = useCallback((msg: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x.slice(-2), { id, msg, kind }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])
  const value = useMemo(() => ({ show }), [show])
  const Icon = { success: CheckCircle2, error: XCircle, info: Info }
  const color = { success: 'text-green', error: 'text-red', info: 'text-accent' }
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        <AnimatePresence>
          {items.map((t) => {
            const I = Icon[t.kind]
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[12px] border border-border-strong bg-surface-2 py-2 pl-4 pr-2 text-sm shadow-2xl">
                <I className={`h-4 w-4 shrink-0 ${color[t.kind]}`} strokeWidth={1.5} aria-hidden />
                <span className="flex-1 text-text">{t.msg}</span>
                <button onClick={() => dismiss(t.id)} className="grid h-9 w-9 place-items-center rounded-md text-faint hover:text-text" aria-label="Dismiss notification">
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast outside provider')
  return c
}
