import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { History, LogOut } from 'lucide-react'
import { Logo } from '../brand/Logo'
import { useAuth } from '../lib/auth'
import { GoogleSignInButton } from './GoogleSignInButton'

export function Nav() {
  const { user, signOut } = useAuth()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [menu])

  const link = ({ isActive }: { isActive: boolean }) => `hidden min-h-[44px] items-center px-3 font-mono text-xs uppercase tracking-[0.08em] sm:inline-flex ${isActive ? 'text-text' : 'text-faint hover:text-text'}`

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <div className="container-x flex h-14 items-center gap-2">
        <Link to="/" className="mr-auto flex min-h-[44px] items-center" aria-label="Vouch home"><Logo /></Link>
        <NavLink to="/how" className={link}>How it scores</NavLink>
        <Link to="/app" className="btn-primary h-9 min-h-0 px-3 text-xs">Open dashboard</Link>
        {user ? (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
              className="flex h-11 w-11 items-center justify-center" aria-label={`Account menu for ${user.name}`}>
              {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 border border-border-strong" />
                : <span className="grid h-8 w-8 place-items-center border border-border-strong bg-surface-2 font-mono text-xs font-semibold">{(user.name || user.email)[0]?.toUpperCase()}</span>}
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-12 w-60 border border-border-strong bg-surface">
                <div className="border-b border-border px-4 py-3">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate font-mono text-[11px] text-faint">{user.email}</div>
                </div>
                <button role="menuitem" onClick={() => { setMenu(false); nav('/app/checks') }} className="flex min-h-[44px] w-full items-center gap-2 px-4 text-sm text-muted hover:bg-surface-2 hover:text-text">
                  <History className="h-4 w-4" strokeWidth={1.5} aria-hidden />My checks
                </button>
                <button role="menuitem" onClick={() => { setMenu(false); signOut() }} className="flex min-h-[44px] w-full items-center gap-2 px-4 text-sm text-muted hover:bg-surface-2 hover:text-text">
                  <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <GoogleSignInButton compact={typeof window !== 'undefined' && window.innerWidth < 480} />
        )}
      </div>
    </header>
  )
}
