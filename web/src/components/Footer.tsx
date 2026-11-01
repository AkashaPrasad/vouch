import { Link } from 'react-router-dom'
import { ExternalLink, Phone } from 'lucide-react'
import { Logo } from '../brand/Logo'

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="container-x grid gap-8 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo size="sm" />
          <p className="mt-3 max-w-sm text-sm text-muted">Know before you say yes. Vouch shows risk signals with sources, so you can decide with evidence.</p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-faint">A clean result is not a guarantee. Vouch reports risk signals from public sources; it never accuses any company. Always verify through the company’s official channels.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col text-sm">
          <span className="eyebrow mb-2">Product</span>
          <Link to="/" className="py-2 text-muted hover:text-text">Check an offer</Link>
          <Link to="/how" className="py-2 text-muted hover:text-text">How it works</Link>
          <Link to="/me" className="py-2 text-muted hover:text-text">My checks</Link>
        </nav>
        <div className="flex flex-col text-sm">
          <span className="eyebrow mb-2">Got scammed?</span>
          <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 py-2 text-muted hover:text-text">
            Report at cybercrime.gov.in <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </a>
          <a href="tel:1930" className="inline-flex items-center gap-1.5 py-2 text-muted hover:text-text">
            <Phone className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />Call the 1930 helpline
          </a>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-faint">© {new Date().getFullYear()} Vouch</div>
    </footer>
  )
}
