import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bot, Check, ChevronDown, CircleHelp, ExternalLink, Loader2, X } from 'lucide-react'
import type { Signal } from '../lib/types'
import { hostOf } from '../lib/format'

const STYLE = {
  pass: { ring: 'border-green/30', icon: Check, iconCls: 'bg-[var(--green-soft)] text-green', label: 'Pass' },
  fail: { ring: 'border-red/35', icon: X, iconCls: 'bg-[var(--red-soft)] text-red', label: 'Risk' },
  unknown: { ring: 'border-border', icon: CircleHelp, iconCls: 'bg-surface-2 text-faint', label: 'Unknown' },
} as const

function WeightChip({ w }: { w: number }) {
  if (!w) return <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-faint">0</span>
  const risk = w > 0
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${risk ? 'bg-[var(--red-soft)] text-red' : 'bg-[var(--green-soft)] text-green'}`}
      title={risk ? 'Adds to risk score' : 'Lowers risk score'}>
      {risk ? `+${w}` : `−${Math.abs(w)}`}
    </span>
  )
}

export function SignalCard({ signal, agentText, isAgent }: { signal: Signal; agentText?: string; isAgent?: boolean }) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const pending = signal.status === 'pending'
  const st = pending ? null : STYLE[signal.status as keyof typeof STYLE] ?? STYLE.unknown
  const hasEvidence = !pending && signal.evidence?.length > 0
  const showAgent = isAgent && agentText && (pending || signal.status === 'unknown')

  return (
    <motion.article
      key={pending ? 'p' : signal.status}
      initial={reduce || pending ? false : { rotateX: -90, opacity: 0.4 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformPerspective: 800 }}
      className={`card relative flex min-h-[132px] flex-col overflow-hidden p-4 ${st ? st.ring : 'border-border'}`}
      aria-label={`${signal.code} ${signal.name}: ${pending ? 'checking' : st?.label}`}
    >
      {pending && <div className="pointer-events-none absolute inset-0 skeleton opacity-40" style={{ borderRadius: 0 }} aria-hidden />}
      <div className="relative flex items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${st ? st.iconCls : 'bg-surface-2 text-faint'}`}>
          {st ? <st.icon className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-faint">{signal.code}</span>
            {isAgent && <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted"><Bot className="h-3 w-3" strokeWidth={1.5} aria-hidden />Agent</span>}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-text">{signal.name}</h3>
        </div>
        {!pending && <WeightChip w={signal.weight_applied} />}
      </div>

      <div className="relative mt-3 flex-1 text-[13px] leading-relaxed">
        {pending ? (
          showAgent ? <p className="font-mono text-xs text-accent/90 animate-pulse-soft">{agentText}</p>
            : <p className="text-faint">{isAgent ? 'Browsing the source…' : 'Checking…'}</p>
        ) : (
          <>
            <p className="text-muted">{signal.summary || (signal.status === 'unknown' ? 'Could not confirm either way.' : '')}</p>
            {showAgent && <p className="mt-1 font-mono text-xs text-accent/80">{agentText}</p>}
          </>
        )}
      </div>

      {!pending && (
        <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
          <span className="font-mono text-[11px] text-faint">{signal.elapsed_ms != null ? `${signal.elapsed_ms.toLocaleString()} ms` : ''}{signal.source ? ` · ${signal.source.replace('tinyfish_', 'tinyfish ')}` : ''}</span>
          {hasEvidence && (
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
              className="-mr-2 inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:text-text">
              {signal.evidence.length} source{signal.evidence.length > 1 ? 's' : ''}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && hasEvidence && (
          <motion.ul id={panelId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="relative space-y-2 overflow-hidden">
            {signal.evidence.map((e, i) => (
              <li key={i} className="first:mt-2">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="group block rounded-lg border border-border bg-bg p-2.5 hover:border-border-strong">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-text">
                    <span className="truncate">{e.title || hostOf(e.url)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-faint group-hover:text-accent" strokeWidth={1.5} aria-hidden />
                    <span className="sr-only">(opens in new tab)</span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-faint">{hostOf(e.url)}</span>
                  {e.snippet && <span className="mt-1 line-clamp-3 block text-xs text-muted">{e.snippet}</span>}
                </a>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.article>
  )
}
