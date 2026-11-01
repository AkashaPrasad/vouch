import type { Extraction } from '../lib/types'

const CAT: Record<string, string> = {
  company: 'company domain', job_board: 'job board', social: 'social', messaging: 'messaging', form_or_doc: 'form / doc',
  shortener: 'shortener', free_host: 'free host', payment: 'payment link', reference: 'reference', free_mail: 'free mail',
}
const RISKY = new Set(['shortener', 'free_host', 'payment', 'messaging', 'form_or_doc', 'free_mail'])

/** "Where this came from": every host in the message with its category, plus the known-brand note. */
export function HostsStrip({ extraction }: { extraction: Extraction | null }) {
  const hosts = extraction?.hosts ?? []
  const brand = extraction?.known_brand ?? null
  const claimed = extraction?.claimed_official_domain
  if (!hosts.length && !brand && !claimed) return null
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="label">Where this came from</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {hosts.length ? hosts.map((h) => (
          <li key={h.host} className="inline-flex items-center gap-2 font-mono text-xs">
            <span className="text-text">{h.host}</span>
            <span className={`uppercase tracking-[0.06em] text-[10px] ${RISKY.has(h.category) ? 'text-amber' : h.category === 'company' ? 'text-green' : 'text-faint'}`}>{CAT[h.category] ?? h.category}</span>
          </li>
        )) : claimed ? <li className="font-mono text-xs text-text">{claimed}</li> : null}
      </ul>
      {brand && (
        <p className="mt-2 text-sm text-muted">Claims to be <span className="text-text">{brand.name}</span>; official domain{brand.official_domains.length > 1 ? 's' : ''} <span className="font-mono text-text">{brand.official_domains.join(', ')}</span>.</p>
      )}
    </div>
  )
}
