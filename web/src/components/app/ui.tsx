import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PageHead({ label, title, sub, actions }: { label: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-end">
      <div><p className="label">{label}</p><h1 className="mt-1 text-xl font-semibold">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
export function Section({ label, title, right, children, className = '' }: { label: string; title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-end justify-between border-b border-border pb-2"><div><p className="label">{label}</p><h2 className="mt-1 text-base font-semibold">{title}</h2></div>{right}</div>
      {children}
    </section>
  )
}
export function StatCard({ label, value, hint, loading }: { label: string; value: ReactNode; hint?: ReactNode; loading?: boolean }) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="label">{label}</p>
      {loading ? <span className="skeleton mt-2 block h-8 w-16" /> : <p className="mt-2 font-mono text-[28px] font-semibold leading-none tnum">{value}</p>}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  )
}
export function Empty({ title, body, cta, to }: { title: string; body?: string; cta?: string; to?: string }) {
  return (
    <div className="border border-dashed border-border-strong p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {cta && to && <Link to={to} className="btn-primary mt-4">{cta}</Link>}
    </div>
  )
}
export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return <div role="alert" className="border-l-2 border-red py-2 pl-3 text-sm text-red">{msg}{onRetry && <button onClick={onRetry} className="ml-3 underline underline-offset-4">Retry</button>}</div>
}
export function Rows({ n = 5, cols = 3 }: { n?: number; cols?: number }) {
  return <table className="ledger-table" aria-busy="true"><tbody>{Array.from({ length: n }).map((_, i) => <tr key={i}>{Array.from({ length: cols }).map((__, j) => <td key={j} className={j === 0 ? 'pl-0' : j === cols - 1 ? 'pr-0' : ''}><span className="skeleton block h-4" style={{ width: `${70 - j * 15}%` }} /></td>)}</tr>)}</tbody></table>
}
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 border-b border-border py-2">
      <span><span className="block text-sm text-text">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 border ${checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-2'}`}>
        <span className={`absolute top-0.5 h-[18px] w-[18px] transition-transform ${checked ? 'left-0.5 translate-x-5 bg-accent-ink' : 'left-0.5 bg-text'}`} />
      </button>
    </label>
  )
}
/** Flat daily bar chart, pure SVG. */
export function BarChart({ data, label }: { data: { date: string; count: number }[]; label: string }) {
  const W = 1000, H = 160, PAD = 24
  const max = Math.max(1, ...data.map((d) => d.count))
  const bw = (W - PAD * 2) / Math.max(1, data.length)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block w-full" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
      {[0, 0.5, 1].map((f) => <line key={f} x1={PAD} x2={W - PAD} y1={PAD + (1 - f) * (H - PAD * 2 - 16)} y2={PAD + (1 - f) * (H - PAD * 2 - 16)} stroke="var(--border)" strokeWidth={1} />)}
      <text x={W - PAD} y={PAD - 6} fontSize={9} fill="var(--text-faint)" textAnchor="end">max {max}</text>
      {data.map((d, i) => {
        const h = (d.count / max) * (H - PAD * 2 - 16)
        const x = PAD + i * bw + bw * 0.15
        return (
          <g key={d.date}>
            <rect x={x} y={H - PAD - 16 - h} width={bw * 0.7} height={h} fill={d.count ? 'var(--accent)' : 'var(--border)'} />
            {(i === 0 || i === data.length - 1 || i % 7 === 0) && <text x={x + bw * 0.35} y={H - PAD + 4} fontSize={9} fill="var(--text-faint)" textAnchor="middle">{d.date.slice(5)}</text>}
          </g>
        )
      })}
    </svg>
  )
}
