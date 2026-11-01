import { forwardRef } from 'react'
import { LogoMark } from '../brand/Logo'
import type { Band, Receipt } from '../lib/types'
import { BAND } from './VerdictBadge'

interface Props { band: Band; label: string; score: number; company?: string | null; receipts: Receipt[]; headline?: string }

/** 1080x1080-ish card rendered off-screen and exported as PNG via html-to-image. Inline styles only so the export is faithful. */
export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard({ band, label, score, company, receipts, headline }, ref) {
  const b = BAND[band] ?? BAND.amber
  return (
    <div ref={ref} style={{ width: 600, padding: 40, background: '#09090B', color: '#FAFAFA', fontFamily: 'Inter, system-ui, sans-serif', border: '1px solid #27272A', borderRadius: 24, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoMark size={34} />
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.04em' }}>vouch</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#71717A' }}>Job offer check</span>
      </div>
      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ width: 120, height: 120, borderRadius: 999, border: `8px solid ${b.hex}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: b.hex, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, color: '#71717A', letterSpacing: '0.14em', marginTop: 4 }}>RISK / 100</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 999, border: `1px solid ${b.hex}66`, background: `${b.hex}1f`, color: b.hex, fontWeight: 700, fontSize: 15, letterSpacing: '0.04em' }}>{label}</div>
          <div style={{ marginTop: 12, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{company || 'Unknown company'}</div>
          {headline && <div style={{ marginTop: 6, fontSize: 14, color: '#A1A1AA', lineHeight: 1.45 }}>{headline}</div>}
        </div>
      </div>
      {receipts.length > 0 && (
        <div style={{ marginTop: 28, borderTop: '1px solid #27272A', paddingTop: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#71717A', marginBottom: 12 }}>RECEIPTS</div>
          {receipts.slice(0, 3).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 14, lineHeight: 1.45 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', color: '#C6F135', fontSize: 12, paddingTop: 2, flexShrink: 0 }}>{r.signal}</span>
              <span style={{ color: '#E4E4E7' }}>{r.finding}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#71717A' }}>
        <span>Check yours at <span style={{ color: '#C6F135', fontWeight: 600 }}>vouch.spacesdrive.cc</span></span>
        <span>Risk signals, not a guarantee</span>
      </div>
    </div>
  )
})
