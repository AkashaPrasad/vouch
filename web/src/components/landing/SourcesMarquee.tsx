import './landing.css'

const SOURCES = ['RDAP', 'DNS over HTTPS', 'cybercrime.gov.in', 'MCA company registry', 'Official careers pages', 'AmbitionBox', 'Reddit', 'Glassdoor', 'Blind', 'URLhaus', 'Greenhouse and Lever boards', 'LinkedIn company pages', 'News']

function Row({ dup }: { dup?: boolean }) {
  return (
    <ul className={`flex shrink-0 items-center ${dup ? 'vl-marquee-dup' : ''}`} aria-hidden={dup || undefined}>
      {SOURCES.map((s) => (
        <li key={s} className="flex items-center whitespace-nowrap px-4 font-mono text-sm text-muted sm:px-6">
          <span className="mr-4 h-1.5 w-1.5 bg-accent sm:mr-6" aria-hidden />{s}
        </li>
      ))}
    </ul>
  )
}

/** Slow marquee of evidence sources. Pauses on hover; wraps statically under reduced motion. */
export function SourcesMarquee() {
  return (
    <section aria-label="Evidence sources" className="border-y border-border bg-surface">
      <div className="container-x flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-6">
        <p className="shrink-0 font-mono text-sm uppercase tracking-[0.08em] text-text">Evidence from</p>
        <div className="vl-marquee min-w-0 flex-1" tabIndex={0} aria-label="Sources Vouch reads, hover or focus to pause">
          <div className="vl-marquee-track"><Row /><Row dup /></div>
        </div>
      </div>
    </section>
  )
}
