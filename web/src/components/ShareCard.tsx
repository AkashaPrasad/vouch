import { forwardRef } from 'react'
import { LogoMark } from '../brand/Logo'
import type { Band, Receipt } from '../lib/types'
import { BAND } from './VerdictBadge'

interface Props { band: Band; label: string; score: number; company?: string | null; receipts: Receipt[]; headline?: string }

/** Flat 600px share card, inline styles only (html-to-image). */
export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard({ band, label, score, company, receipts, headline }, ref) {
  const b = BAND[band] ?? BAND.amber
  const mono = '"JetBrains Mono", ui-monospace, monospace'
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div ref={ref} style={{ width: 600, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'Inter, system-ui, sans-serif', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <LogoMark size={26} />
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.04em' }}>vouch</span>
        <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>JOB OFFER CHECK</span>
      </div>
      <div style={{ display: 'flex', gap: 24, padding: 24 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>RISK / 100</div>
          <div style={{ fontFamily: mono, fontSize: 64, fontWeight: 700, lineHeight: 1, color: b.hex, marginTop: 6 }}>{score}</div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'inline-block', padding: '5px 10px', border: `1px solid ${b.hex}`, color: b.hex, fontFamily: mono, fontWeight: 600, fontSize: 12, letterSpacing: '0.06em' }}>{label}</div>
          <div style={{ marginTop: 12, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{company || 'Unknown company'}</div>
          {headline && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>{headline}</div>}
        </div>
      </div>
      <div style={{ margin: '0 24px', height: 10, display: 'flex', border: '1px solid var(--border)' }}>
        <div style={{ width: '30%', background: 'var(--green-soft)' }} />
        <div style={{ width: '30%', background: 'var(--amber-soft)' }} />
        <div style={{ width: '40%', background: 'var(--red-soft)' }} />
      </div>
      <div style={{ position: 'relative', margin: '0 24px', height: 14 }}>
        <div style={{ position: 'absolute', left: `${pct}%`, top: -12, width: 2, height: 22, background: b.hex, transform: 'translateX(-1px)' }} />
      </div>
      {receipts.length > 0 && (
        <div style={{ margin: '12px 24px 0', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: 10 }}>RECEIPTS</div>
          {receipts.slice(0, 3).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 13, lineHeight: 1.45 }}>
              <span style={{ fontFamily: mono, color: 'var(--text-muted)', fontSize: 11, paddingTop: 2, flexShrink: 0, width: 28 }}>{r.signal}</span>
              <span style={{ color: 'var(--text)' }}>{r.finding}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 11, color: 'var(--text-faint)' }}>
        <span>vouch.spacesdrive.cc</span>
        <span>risk signals · not a guarantee</span>
      </div>
    </div>
  )
})
