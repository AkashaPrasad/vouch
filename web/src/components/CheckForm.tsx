import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
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
      nav(`/app/c/${check_id}`)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not start the check. Please try again.')
      setBusy(false)
    }
  }

  const tab = (m: 'text' | 'url', label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(null) }}
      className={`-mb-px inline-flex min-h-[44px] items-center border-b-2 px-1 font-mono text-xs uppercase tracking-[0.08em] transition-colors ${mode === m ? 'border-accent text-text' : 'border-transparent text-faint hover:text-muted'}`}>
      {label}
    </button>
  )

  return (
    <form onSubmit={submit} noValidate className="border border-border bg-surface" aria-label="Check a job offer">
      <div role="tablist" aria-label="Input type" className="flex gap-6 border-b border-border px-4">
        {tab('text', '01 · Paste text')}
        {tab('url', '02 · Paste a link')}
      </div>
      <div className="p-4">
        {mode === 'text' ? (
          <>
            <label htmlFor={ids.text} className="label block">Message or offer letter</label>
            <textarea id={ids.text} value={text} onChange={(e) => setText(e.target.value)} rows={7}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit() }}
              placeholder="Paste the WhatsApp, Telegram or email text here."
              aria-invalid={!!err} aria-describedby={`${ids.help}${err ? ` ${ids.err}` : ''}`}
              className={`input mt-2 min-h-[160px] resize-y py-3 leading-relaxed ${err ? 'border-red' : ''}`} />
          </>
        ) : (
          <>
            <label htmlFor={ids.url} className="label block">Link to the job post, form or site</label>
            <input id={ids.url} type="url" inputMode="url" autoComplete="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://" aria-invalid={!!err} aria-describedby={`${ids.help}${err ? ` ${ids.err}` : ''}`}
              className={`input mt-2 min-h-[48px] font-mono text-[15px] ${err ? 'border-red' : ''}`} />
          </>
        )}
        {err && (
          <p id={ids.err} role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />{err}
          </p>
        )}
        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-between gap-3 sm:mr-auto sm:justify-start">
            <p id={ids.help} className="font-mono text-[11px] text-faint">Phone numbers and UPI ids are hashed, never stored in plain text.</p>
            {mode === 'text' && !text && (
              <button type="button" onClick={() => setText(SAMPLE)} className="min-h-[36px] shrink-0 whitespace-nowrap px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted underline decoration-border-strong underline-offset-4 hover:text-text">Load sample</button>
            )}
          </div>
          <button type="submit" disabled={busy} className="btn-primary h-12 whitespace-nowrap px-6 text-[15px] sm:h-11">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Starting…</> : <>Check this offer<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden /></>}
          </button>
        </div>
      </div>
    </form>
  )
}
