import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { History, LogOut } from 'lucide-react'
import { Logo } from '../brand/Logo'
import { useAuth } from '../lib/auth'

export function Nav() {
  const { user, gsiReady, renderButton, signOut } = useAuth()
  const btnRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!user && gsiReady && btnRef.current) {
      const narrow = window.innerWidth < 480
      renderButton(btnRef.current, narrow ? { type: 'icon', shape: 'circle' } : { text: 'signin_with' })
    }
  }, [user, gsiReady, renderButton])

  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [menu])

  const link = ({ isActive }: { isActive: boolean }) => `hidden min-h-[44px] items-center rounded-md px-3 text-sm sm:inline-flex ${isActive ? 'text-text' : 'text-muted hover:text-text'}`

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-bg/80 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <div className="container-x flex h-16 items-center gap-2">
        <Link to="/" className="mr-auto flex min-h-[44px] items-center rounded-md" aria-label="Vouch home"><Logo /></Link>
        <NavLink to="/how" className={link}>How it works</NavLink>
        {user && <NavLink to="/me" className={link}>My checks</NavLink>}
        {user ? (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
              className="flex h-11 w-11 items-center justify-center rounded-full" aria-label={`Account menu for ${user.name}`}>
              {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full border border-border-strong" />
                : <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-sm font-semibold">{(user.name || user.email)[0]?.toUpperCase()}</span>}
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-12 w-60 overflow-hidden rounded-[12px] border border-border bg-surface shadow-2xl">
                <div className="border-b border-border px-4 py-3">
                  <div className="truncate text-sm font-semibold">{user.name}</div>
                  <div className="truncate text-xs text-faint">{user.email}</div>
                </div>
                <button role="menuitem" onClick={() => { setMenu(false); nav('/me') }} className="flex min-h-[44px] w-full items-center gap-2 px-4 text-sm text-muted hover:bg-surface-2 hover:text-text">
                  <History className="h-4 w-4" strokeWidth={1.5} aria-hidden />My checks
                </button>
                <button role="menuitem" onClick={() => { setMenu(false); signOut() }} className="flex min-h-[44px] w-full items-center gap-2 px-4 text-sm text-muted hover:bg-surface-2 hover:text-text">
                  <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div ref={btnRef} className="flex min-h-[44px] min-w-[44px] items-center" aria-label="Sign in with Google">
            {!gsiReady && <span className="skeleton h-10 w-10 rounded-full sm:w-[180px]" aria-hidden />}
          </div>
        )}
      </div>
    </header>
  )
}
