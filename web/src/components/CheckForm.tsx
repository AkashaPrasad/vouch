import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Link2, Loader2, Lock, MessageSquareText } from 'lucide-react'
import { api } from '../lib/api'

const SAMPLE = `Dear Candidate, Congratulations! You have been shortlisted for the Work From Home Data Entry Executive role at Infosys Solutions Pvt Ltd. Salary: Rs 45,000/month. No interview required. To confirm your seat, pay a refundable registration fee of Rs 1,999 to UPI hr.infosys@ybl within 24 hours. Contact HR on WhatsApp +91 98XXXXXX21. Offer valid today only.`

export function CheckForm() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'text' | 'url'>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ids = { text: useId(), url: useId(), err: useId(), help: useId() }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    setErr(null)
    const body: { text?: string; url?: string } = {}
    if (mode === 'text') {
      if (text.trim().length < 20) { setErr('Paste a bit more of the message, at least a sentence or two.'); return }
      body.text = text.trim()
    } else {
      let u = url.trim()
      if (!u) { setErr('Paste the link to the job post, form or website.'); return }
      if (!/^https?:\/\//i.test(u)) u = `https://${u}`
      try { new URL(u) } catch { setErr('That doesn’t look like a valid link.'); return }
      body.url = u
    }
    setBusy(true)
    try {
      const { check_id } = await api.createCheck(body)
      nav(`/c/${check_id}`)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not start the check. Please try again.')
      setBusy(false)
    }
  }

  const tab = (m: 'text' | 'url', label: string, Icon: typeof Link2) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(null) }}
      className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none ${mode === m ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border-strong)]' : 'text-muted hover:text-text'}`}>
      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />{label}
    </button>
  )

  return (
    <form onSubmit={submit} noValidate className="card relative p-3 text-left sm:p-4" aria-label="Check a job offer">
      <div role="tablist" aria-label="Input type" className="flex gap-1 rounded-[10px] border border-border bg-bg p-1 sm:inline-flex">
        {tab('text', 'Paste text', MessageSquareText)}
        {tab('url', 'Paste a link', Link2)}
      </div>

      <div className="mt-3">
        {mode === 'text' ? (
          <>
            <label htmlFor={ids.text} className="mb-1.5 block text-sm font-medium text-text">Paste the message or offer letter</label>
            <textarea id={ids.text} value={text} onChange={(e) => setText(e.target.value)} rows={6}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit() }}
              placeholder="e.g. “Congratulations! You’re selected for a WFH role… pay ₹1,999 refundable fee to confirm…”"
              aria-invalid={!!err} aria-describedby={`${ids.help}${err ? ` ${ids.err}` : ''}`}
              className={`input min-h-[150px] resize-y py-3 leading-relaxed ${err ? 'border-red/60' : ''}`} />
          </>
        ) : (
          <>
            <label htmlFor={ids.url} className="mb-1.5 block text-sm font-medium text-text">Link to the job post, form or company site</label>
            <input id={ids.url} type="url" inputMode="url" autoComplete="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://careers.example.com/job/123" aria-invalid={!!err} aria-describedby={`${ids.help}${err ? ` ${ids.err}` : ''}`}
              className={`input min-h-[48px] font-mono text-[15px] ${err ? 'border-red/60' : ''}`} />
          </>
        )}
        {err && (
          <p id={ids.err} role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />{err}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center justify-between gap-3 sm:mr-auto sm:justify-start">
          <p id={ids.help} className="flex items-center gap-1.5 text-xs text-faint">
            <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />We never store phone numbers in plain text.
          </p>
          {mode === 'text' && !text && (
            <button type="button" onClick={() => setText(SAMPLE)} className="min-h-[36px] shrink-0 whitespace-nowrap rounded px-1 text-xs text-muted underline decoration-border-strong underline-offset-4 hover:text-text">Try a sample</button>
          )}
        </div>
        <button type="submit" disabled={busy} className="btn-primary group relative h-12 overflow-hidden px-6 text-[15px] sm:h-11">
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.45)_50%,transparent_65%)] bg-[length:200%_100%] animate-shine opacity-60" />
          {busy ? <><Loader2 className="relative h-4 w-4 animate-spin" aria-hidden />Starting check…</> : <><span className="relative">Check this offer</span><ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} aria-hidden /></>}
        </button>
      </div>
    </form>
  )
}
