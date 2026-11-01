import { useState } from 'react'
import { Bot, ChevronDown, ExternalLink, MonitorPlay } from 'lucide-react'
import { AGENT_CODES, TAG_LABEL } from '../lib/signals'
import type { Signal } from '../lib/types'
import { hostOf } from '../lib/format'
import { SignalGraphic, SignalIcon } from './SignalGraphic'
import type { Extraction } from '../lib/types'

const STATUS: Record<Signal['status'], { text: string; cls: string; bar: string }> = {
  pass: { text: 'pass', cls: 'text-green', bar: 'bg-green' },
  fail: { text: 'fail', cls: 'text-red', bar: 'bg-red' },
  unknown: { text: 'unknown', cls: 'text-faint', bar: 'bg-border-strong' },
  pending: { text: 'checking', cls: 'text-faint', bar: 'bg-transparent' },
}

function Weight({ s }: { s: Signal }) {
  const resolved = s.status === 'pass' || s.status === 'fail'
  if (!resolved) return <span className="font-mono text-xs text-faint">—</span>
  const w = s.weight_applied
  const cls = w > 0 ? 'text-red' : w < 0 ? 'text-green' : 'text-faint'
  return <span className={`tnum font-mono text-xs font-semibold ${cls}`}>{w > 0 ? `+${w}` : w < 0 ? `−${Math.abs(w)}` : '0'}</span>
}

function Tags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {tags.map((t) => <span key={t} className="border border-border-strong px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">{TAG_LABEL[t] ?? t}</span>)}
    </span>
  )
}

function Row({ s, e, agentText, preview, onPreview }: { s: Signal; e: Extraction | null; agentText?: string; preview?: 'live' | 'shot' | 'log'; onPreview?: () => void }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[s.status]
  const hasEv = s.evidence?.length > 0
  const agent = AGENT_CODES.has(s.code)
  return (
    <>
      <tr id={`sig-${s.code}`} className="scroll-mt-24 align-top">
        <td className="w-0 whitespace-nowrap pl-0 pr-3"><span className="flex items-center gap-2"><span className={`inline-block h-7 w-[3px] ${st.bar} ${s.status === 'pending' ? 'border border-dashed border-border-strong' : ''}`} aria-hidden /><SignalIcon code={s.code} status={s.status} /><span className="font-mono text-xs text-muted">{s.code}</span></span></td>
        <td>
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium text-text">{s.name}</span>
            {agent && <Bot className="h-3.5 w-3.5 text-faint" strokeWidth={1.5} aria-label="Browsing agent" />}
            <Tags tags={s.tags} />
            {agent && preview && onPreview && (
              <button onClick={onPreview} className={`inline-flex min-h-[32px] items-center gap-1 border px-1.5 font-mono text-[10px] uppercase tracking-[0.06em] hover:text-text ${preview === 'live' ? 'border-accent text-accent' : 'border-border-strong text-muted'}`}>
                <MonitorPlay className="h-3 w-3" strokeWidth={1.5} aria-hidden />{preview === 'live' ? 'Watch live' : preview === 'shot' ? 'Screenshot' : 'Steps'}
              </button>
            )}
          </div>
          <p className={`mt-1 text-sm leading-relaxed ${s.status === 'pending' ? 'text-faint' : 'text-muted'}`}>
            {s.status === 'pending' ? (agent && agentText ? <span className="font-mono text-xs">{agentText}</span> : <span className="skeleton inline-block h-3.5 w-48 align-middle" />) : s.summary}
          </p>
          <SignalGraphic s={s} e={e} agentText={agentText} />
          {open && hasEv && (
            <ul className="mt-2 border-l border-border pl-3">
              {s.evidence.map((e, i) => (
                <li key={i} className="py-1.5 text-xs">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[32px] items-center gap-1 font-mono text-muted underline decoration-border-strong underline-offset-4 hover:text-text">
                    {hostOf(e.url)}<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden /><span className="sr-only">(opens in new tab)</span>
                  </a>
                  <span className="ml-2 text-text">{e.title}</span>
                  {e.snippet && <p className="mt-0.5 text-faint">{e.snippet}</p>}
                </li>
              ))}
            </ul>
          )}
        </td>
        <td className="hidden whitespace-nowrap sm:table-cell"><span className={`font-mono text-xs uppercase tracking-[0.06em] ${st.cls}`}>{st.text}</span></td>
        <td className="whitespace-nowrap text-right"><Weight s={s} /></td>
        <td className="hidden whitespace-nowrap font-mono text-[11px] text-faint md:table-cell">{s.source ?? ''}</td>
        <td className="hidden whitespace-nowrap text-right font-mono text-[11px] text-faint md:table-cell tnum">{s.elapsed_ms != null && s.status !== 'pending' ? `${(s.elapsed_ms / 1000).toFixed(1)}s` : ''}</td>
        <td className="w-0 pr-0 text-right">
          {hasEv && (
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`ev-${s.code}`} className="inline-flex min-h-[36px] items-center gap-1 px-1 font-mono text-[11px] text-muted hover:text-text">
              {s.evidence.length}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} aria-hidden /><span className="sr-only">sources</span>
            </button>
          )}
        </td>
      </tr>
    </>
  )
}

/** Flat ledger table of the 12 signals. Stacks naturally on mobile by hiding secondary columns. */
const rank = (s: { status: string; weight_applied?: number; tags?: string[] }) => {
  if (s.status === 'fail') return 0
  if (s.status === 'pass' && (s.weight_applied || 0) < 0) return 1
  if (s.status === 'pass') return 2
  if (s.status === 'pending') return 3
  return (s.tags || []).includes('platform_only') ? 5 : 4
}

export function SignalLedger({ signals, extraction, agentText, previewFor, onPreview }: { signals: Signal[]; extraction: Extraction | null; agentText: Record<string, string>; previewFor?: (code: string) => 'live' | 'shot' | 'log' | undefined; onPreview?: (code: string) => void }) {
  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th scope="col" className="pl-0">Code</th>
          <th scope="col">Signal · result</th>
          <th scope="col" className="hidden sm:table-cell">Status</th>
          <th scope="col" className="text-right">Weight</th>
          <th scope="col" className="hidden md:table-cell">Source</th>
          <th scope="col" className="hidden text-right md:table-cell">Time</th>
          <th scope="col" className="pr-0 text-right">Src</th>
        </tr>
      </thead>
      <tbody>{[...signals].sort((a, b) => rank(a) - rank(b) || (b.weight_applied || 0) - (a.weight_applied || 0)).map((s) => <Row key={s.code} s={s} e={extraction} agentText={agentText[s.code]} preview={previewFor?.(s.code)} onPreview={onPreview ? () => onPreview(s.code) : undefined} />)}</tbody>
    </table>
  )
}
