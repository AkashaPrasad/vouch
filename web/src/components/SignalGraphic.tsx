import { AtSign, Briefcase, Building2, CalendarClock, FileText, Globe, IndianRupee, Link2, Mail, MessageCircle, MessageSquareWarning, Phone, Send, Server, ShieldAlert, Timer, type LucideIcon } from 'lucide-react'
import type { Extraction, Signal } from '../lib/types'
import { hostOf } from '../lib/format'
import { TAG_LABEL } from '../lib/signals'

export const SIGNAL_ICON: Record<string, LucideIcon> = {
  S1: IndianRupee, S2: AtSign, S3: CalendarClock, S4: Server, S5: MessageSquareWarning, S6: ShieldAlert,
  S7: Building2, S8: Briefcase, S9: MessageCircle, S10: Timer, S11: Globe, S12: Link2,
}
const STATUS_CLS: Record<Signal['status'], string> = { pass: 'border-green text-green', fail: 'border-red text-red', unknown: 'border-border-strong text-faint', pending: 'border-dashed border-border-strong text-faint' }

export function SignalIcon({ code, status }: { code: string; status: Signal['status'] }) {
  const I = SIGNAL_ICON[code] ?? Globe
  return <span className={`grid h-7 w-7 shrink-0 place-items-center border ${STATUS_CLS[status]}`} aria-hidden><I className="h-3.5 w-3.5" strokeWidth={1.75} /></span>
}

const Chip = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'red' | 'green' | 'amber' }) => (
  <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${tone === 'red' ? 'border-red text-red' : tone === 'green' ? 'border-green text-green' : tone === 'amber' ? 'border-amber text-amber' : 'border-border-strong text-muted'}`}>{children}</span>
)
const Tile = ({ k, v, on }: { k: string; v: string; on: boolean | null }) => (
  <span className={`inline-flex min-w-[64px] flex-col border px-2 py-1 font-mono ${on === true ? 'border-green' : on === false ? 'border-red' : 'border-border-strong'}`}>
    <span className="text-[9px] uppercase tracking-[0.08em] text-faint">{k}</span>
    <span className={`text-[11px] ${on === true ? 'text-green' : on === false ? 'text-red' : 'text-faint'}`}>{v}</span>
  </span>
)
const m = (re: RegExp, s: string) => s.match(re)?.[1] ?? ''
const DOM = String.raw`([a-z0-9][a-z0-9.-]*\.[a-z]{2,})`

function official(e: Extraction | null): string {
  return e?.known_brand?.official_domains?.[0] || (e?.claimed_official_domain as string) || ''
}
function diffUnderline(sender: string, off: string) {
  if (!sender) return null
  const sl = sender.split('.')[0], ol = off.split('.')[0]
  if (!off || sl === ol) return <span className="text-text">{sender}</span>
  return <span className="text-text underline decoration-red decoration-2 underline-offset-4">{sender}</span>
}

function ageDays(summary: string): number | null {
  const d = m(/registered (?:only )?(\d+) days ago/i, summary) || m(/new: registered (\d+) days/i, summary)
  if (d) return Number(d)
  const y = m(/existed for (\d+) years/i, summary)
  if (y) return Number(y) * 365
  return null
}
/** piecewise ruler: 0–30d → 0..25%, 30–180d → 25..55%, 180d–3y → 55..85%, 3y+ → 85..100% */
function agePos(days: number) {
  if (days <= 30) return (days / 30) * 25
  if (days <= 180) return 25 + ((days - 30) / 150) * 30
  if (days <= 1095) return 55 + ((days - 180) / 915) * 30
  return Math.min(100, 85 + ((days - 1095) / 3650) * 15)
}

const CH_ICON: Record<string, LucideIcon> = { whatsapp: MessageCircle, telegram: Send, google_form: FileText, email: Mail, phone: Phone, website: Globe }

export function SignalGraphic({ s, e, agentText }: { s: Signal; e: Extraction | null; agentText?: string }) {
  const tags = s.tags ?? []
  const sum = s.summary || ''
  const res = s.status === 'pass' || s.status === 'fail'
  switch (s.code) {
    case 'S1': {
      const mr = (e?.money_requested as { asked?: boolean; amount?: string; purpose?: string } | undefined) ?? {}
      const asked = s.status === 'fail' || !!mr.asked
      const amt = mr.amount || m(/\(([^)]*₹[^)]*|[^)]*Rs[^)]*)\)/, sum)
      if (!res) return null
      return <div className="mt-2 flex flex-wrap items-center gap-2"><Chip tone={asked ? 'red' : 'green'}>{asked ? `₹ ${amt?.replace(/^(₹|rs\.?|inr)\s*/i, '') || 'amount'} asked` : 'no payment asked'}</Chip>{asked && mr.purpose && <span className="font-mono text-[11px] text-muted">for {mr.purpose}</span>}</div>
    }
    case 'S2': {
      const sender = m(new RegExp(String.raw`free email \(${DOM}\)`, 'i'), sum) || m(new RegExp(String.raw`Sender domain ${DOM}`, 'i'), sum) || (tags.includes('free_mail') ? 'free mail' : '')
      const off = m(new RegExp(String.raw`official (?:site |the )?${DOM}`, 'i'), sum) || official(e)
      if (!res && s.status !== 'unknown') return null
      return (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
          <span className="text-faint">writes from</span>{diffUnderline(sender, off) ?? <span className="text-faint">—</span>}
          <span className="text-faint">⟷ official</span><span className={off ? 'text-text' : 'text-faint'}>{off || 'unknown'}</span>
          {tags.filter((t) => ['impersonation', 'lookalike', 'free_mail', 'platform_only', 'exact', 'mismatch'].includes(t)).map((t) => <Chip key={t} tone={t === 'exact' ? 'green' : 'red'}>{TAG_LABEL[t] ?? t}</Chip>)}
        </div>
      )
    }
    case 'S3': {
      const platform = tags.includes('platform_only')
      const hosts = (e?.hosts ?? []).filter((h) => h.category !== 'company').map((h) => h.host)
      const days = ageDays(sum)
      const none = /no registration record/i.test(sum)
      return (
        <div className="mt-2">
          <div className="relative h-6 max-w-sm">
            <div className={`absolute left-0 right-0 top-2 border-t ${platform ? 'border-border-strong' : 'border-border'}`} />
            {platform && <div className="absolute left-0 right-0 top-2 border-t border-red" style={{ transform: 'rotate(-2deg)' }} />}
            {[[0, '0'], [25, '30d'], [55, '180d'], [85, '3y+']].map(([p, l]) => <span key={l} className="absolute top-0 font-mono text-[9px] text-faint" style={{ left: `${p}%`, transform: 'translateX(-50%)' }}>|<br />{l}</span>)}
            {!platform && (days != null || none) && <span className={`absolute top-0 h-4 w-[3px] ${s.status === 'fail' ? 'bg-red' : s.weight_applied < 0 ? 'bg-green' : 'bg-text'}`} style={{ left: `${none ? 0 : agePos(days!)}%` }} aria-hidden />}
          </div>
          {platform && <p className="mt-1 font-mono text-[11px] text-amber">{hosts.join(', ') || 'platform host'} · platform, not employer</p>}
        </div>
      )
    }
    case 'S4': {
      const snip = s.evidence?.[0]?.snippet || ''
      const mx = /MX:\s*none/i.test(snip) || /no mail \(MX\)/i.test(sum) ? false : /MX:\s*\S/i.test(snip) || /working mail/i.test(sum) ? true : null
      const a = /A:\s*none/i.test(snip) || /no website/i.test(sum) ? false : /A:\s*\S/i.test(snip) ? true : null
      if (s.status === 'unknown' || !res) return null
      return <div className="mt-2 flex gap-2"><Tile k="MX" v={mx === true ? 'present' : mx === false ? 'absent' : '—'} on={mx} /><Tile k="A" v={a === true ? 'present' : a === false ? 'absent' : '—'} on={a} /></div>
    }
    case 'S5': {
      const n = Number(m(/Found (\d+)/i, sum) || 0)
      const hosts = [...new Set((s.evidence ?? []).map((x) => hostOf(x.url)))].slice(0, 3)
      if (!res) return null
      return <div className="mt-2 flex flex-wrap items-center gap-2"><Chip tone={n ? 'red' : 'green'}>{n} report{n === 1 ? '' : 's'}</Chip>{hosts.map((h) => <span key={h} className="font-mono text-[11px] text-muted">{h}</span>)}</div>
    }
    case 'S6': case 'S7': case 'S8': {
      const t = (agentText || '').toLowerCase()
      let step = s.status === 'pending' ? (t ? (/result|found|read|extract|return|match/.test(t) ? 2 : /search|enter|type|fill|select|click|submit/.test(t) ? 1 : 0) : -1) : res ? 3 : 2
      if (s.status === 'unknown' && /did not finish|could not complete|unavailable/i.test(sum)) step = -2
      const steps = ['open site', 'search', 'read result']
      return (
        <ol className="mt-2 flex flex-wrap items-center gap-1 font-mono text-[10px] uppercase tracking-[0.06em]" aria-label="Agent progress">
          {steps.map((l, i) => <li key={l} className="flex items-center gap-1"><span className={`inline-block h-2 w-5 border ${step >= i + 1 ? (s.status === 'fail' ? 'border-red bg-red' : s.status === 'pass' ? 'border-green bg-green' : 'border-text bg-text') : step === i ? 'border-accent' : step === -2 ? 'border-red' : 'border-border-strong'}`} aria-hidden /><span className={step >= i ? 'text-muted' : 'text-faint'}>{l}</span>{i < 2 && <span className="text-faint">→</span>}</li>)}
          {step === -2 && <li className="text-red">timed out</li>}
        </ol>
      )
    }
    case 'S9': {
      const ch = (e?.contact_channels as string[] | undefined) ?? []
      const noEmail = !ch.includes('email')
      if (!ch.length) return null
      return <div className="mt-2 flex flex-wrap gap-1.5">{ch.map((c) => { const I = CH_ICON[c] ?? Globe; return <Chip key={c} tone={['whatsapp', 'telegram', 'google_form'].includes(c) && noEmail ? 'red' : 'muted'}><I className="h-3 w-3" strokeWidth={1.75} aria-hidden />{c.replace('_', ' ')}</Chip> })}{noEmail && <Chip tone="red">no company email</Chip>}</div>
    }
    case 'S10': {
      const urg = (e?.urgency_phrases as string[] | undefined)?.[0] || m(/pressure: "([^"]+)"/, sum)
      const chips: [string, boolean][] = [['urgency', !!urg], ['no interview', /without an interview/i.test(sum)], ['task scam', tags.includes('task_scam')], ['money mule', tags.includes('money_mule')], ['overseas', tags.includes('overseas')], ['personal data', tags.includes('personal_data')], ['unrealistic pay', /unrealistic/i.test(sum)]]
      const on = chips.filter(([, v]) => v)
      if (!res || !on.length) return null
      return <div className="mt-2 flex flex-wrap items-center gap-1.5">{on.map(([l]) => <Chip key={l} tone="red">{l}</Chip>)}{urg && <span className="font-mono text-[11px] text-muted">“{urg}”</span>}</div>
    }
    case 'S11': {
      const linked = m(new RegExp(String.raw`Linked site ${DOM}`, 'i'), sum) || m(new RegExp(String.raw`Linked site is the official ${DOM}`, 'i'), sum)
      const off = m(new RegExp(String.raw`official ${DOM}`, 'i'), sum) || official(e)
      if (!linked && !off) return null
      const tone = s.status === 'pass' ? 'green' : s.status === 'fail' ? 'red' : 'muted'
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="border border-border-strong px-2 py-1"><span className="block text-[9px] uppercase tracking-[0.08em] text-faint">linked</span>{linked || '—'}</span>
          <span className={tone === 'green' ? 'text-green' : tone === 'red' ? 'text-red' : 'text-faint'}>{s.status === 'pass' ? '═ match' : s.status === 'fail' ? '≠ mismatch' : '? unverified'}</span>
          <span className="border border-border-strong px-2 py-1"><span className="block text-[9px] uppercase tracking-[0.08em] text-faint">official</span>{off || 'unknown'}</span>
        </div>
      )
    }
    case 'S12': {
      const urls = ((e?.urls as string[] | undefined) ?? []).slice(0, 4)
      const cat = new Map((e?.hosts ?? []).map((h) => [h.host, h.category]))
      if (!urls.length) return null
      return (
        <ul className="mt-2 flex flex-col gap-1 font-mono text-[11px]">
          {urls.map((u) => { const h = hostOf(u); const c = cat.get(h); return <li key={u} className="flex flex-wrap items-center gap-2"><span className="text-muted">{h}</span>{c === 'shortener' && <><span className="text-faint">→</span><span className="text-amber">destination hidden</span><Chip tone="amber">shortener</Chip></>}{c === 'payment' && <Chip tone="red">payment link</Chip>}{s.status === 'fail' && /listed/i.test(sum) && <Chip tone="red">abuse list</Chip>}</li> })}
        </ul>
      )
    }
    default: return null
  }
}
