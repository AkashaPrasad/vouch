import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, CreditCard, Eye, FileSearch, HelpCircle, History, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Search, Settings, X } from 'lucide-react'
import { Logo, LogoMark } from '../../brand/Logo'
import { useAuth } from '../../lib/auth'
import { GoogleSignInButton } from '../GoogleSignInButton'
import { api } from '../../lib/api'

const MONITOR = [
  { to: '/app', label: 'Overview', Icon: LayoutDashboard, end: true },
  { to: '/app/checks', label: 'Checks', Icon: ListChecks },
  { to: '/app/research', label: 'Research', Icon: FileSearch },
  { to: '/app/watches', label: 'Watches', Icon: Eye },
]
const ACCOUNT = [
  { to: '/app/settings', label: 'Settings', Icon: Settings },
  { to: '/app/billing', label: 'Billing', Icon: CreditCard },
  { to: '/app/help', label: 'Help', Icon: HelpCircle },
]
const CRUMB: Record<string, string> = { '': 'Overview', new: 'New check', checks: 'Checks', research: 'Research', watches: 'Watches', settings: 'Settings', billing: 'Billing', help: 'Help', c: 'Check' }

export function AppShell() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [today, setToday] = useState<number | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const loc = useLocation()
  const seg = loc.pathname.replace(/^\/app\/?/, '').split('/')[0]

  useEffect(() => { setOpen(false); setMenu(false) }, [loc.pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.current?.focus() } }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const load = user ? api.stats().then((s) => s.checks_today ?? null) : api.recent().then((r) => (r.items ?? []).filter((i) => Date.now() - Date.parse(i.created_at) < 86400e3).length)
    load.then(setToday).catch(() => setToday(null))
  }, [user, loc.pathname])

  const item = ({ isActive }: { isActive: boolean }) => `flex min-h-[40px] items-center gap-3 px-3 text-sm ${isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'}`
  const sidebar = (
    <nav aria-label="Dashboard" className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-border px-4"><Link to="/" aria-label="Vouch home"><Logo size="sm" /></Link><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center text-faint md:hidden" aria-label="Close menu"><X className="h-4 w-4" /></button></div>
      <div className="flex-1 overflow-y-auto py-3">
        <p className="label px-4 pb-1 pt-2">Monitor</p>
        {MONITOR.map((m) => <NavLink key={m.to} to={m.to} end={m.end} className={item}><m.Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />{m.label}</NavLink>)}
        <p className="label px-4 pb-1 pt-5">Account</p>
        {ACCOUNT.map((m) => <NavLink key={m.to} to={m.to} className={item}><m.Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />{m.label}</NavLink>)}
      </div>
      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between border border-border px-3 py-2 font-mono text-[11px]"><span className="text-muted">Free plan</span><span className="tnum text-text">checks today {today ?? '—'}</span></div>
        {user ? (
          <div className="relative mt-3">
            <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} className="flex w-full items-center gap-3 px-1 py-1 text-left">
              {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 border border-border-strong" /> : <span className="grid h-8 w-8 place-items-center border border-border-strong bg-surface-2 font-mono text-xs">{(user.name || user.email)[0]?.toUpperCase()}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{user.name}</span><span className="block truncate font-mono text-[11px] text-faint">{user.email}</span></span>
            </button>
            {menu && <div role="menu" className="absolute bottom-12 left-0 right-0 border border-border-strong bg-surface">
              <button role="menuitem" onClick={() => nav('/app/checks')} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"><History className="h-4 w-4" strokeWidth={1.5} />My checks</button>
              <button role="menuitem" onClick={signOut} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"><LogOut className="h-4 w-4" strokeWidth={1.5} />Sign out</button>
            </div>}
          </div>
        ) : (
          <div className="mt-3"><p className="mb-2 text-xs text-muted">Guest. Sign in to save history.</p><GoogleSignInButton /></div>
        )}
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="hidden w-60 shrink-0 border-r border-border md:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-[80] bg-black/60 md:hidden" onClick={() => setOpen(false)}><aside className="h-full w-72 border-r border-border bg-bg" onClick={(e) => e.stopPropagation()}>{sidebar}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-bg px-3 sm:px-5">
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center text-muted md:hidden" aria-label="Open menu"><Menu className="h-5 w-5" strokeWidth={1.5} /></button>
          <span className="md:hidden"><LogoMark size={22} /></span>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-1 font-mono text-xs text-faint sm:flex"><Link to="/app" className="hover:text-text">Overview</Link>{seg && <><ChevronRight className="h-3 w-3" aria-hidden /><span className="text-text">{CRUMB[seg] ?? seg}</span></>}</nav>
          <form className="ml-auto flex max-w-xs flex-1 items-center border border-border px-2" onSubmit={(e) => { e.preventDefault(); nav(`/app/checks?q=${encodeURIComponent(search.current?.value ?? '')}`) }}>
            <Search className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.5} aria-hidden />
            <input ref={search} type="search" placeholder="Search checks" aria-label="Search checks" className="h-9 w-full bg-transparent px-2 text-sm placeholder:text-faint" />
            <kbd className="hidden font-mono text-[10px] text-faint sm:block">Ctrl K</kbd>
          </form>
          <Link to="/app/new" className="btn-primary h-9 min-h-0 px-3"><Plus className="h-4 w-4" strokeWidth={2} aria-hidden /><span className="hidden sm:inline">New check</span></Link>
          <button className="grid h-10 w-10 place-items-center text-muted hover:text-text" aria-label="Notifications"><Bell className="h-4 w-4" strokeWidth={1.5} /></button>
        </header>
        {!user && <div className="border-b border-border bg-surface px-5 py-2 text-xs text-muted">You are using Vouch as a guest. Sign in with Google to save your history and settings.</div>}
        <main id="main" className="flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-8"><Outlet /></main>
        <nav aria-label="Dashboard tabs" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-bg md:hidden">
          {[...MONITOR.slice(0, 3), { to: '/app/new', label: 'New', Icon: Plus }, { to: '/app/settings', label: 'Settings', Icon: Settings }].map((m) => (
            <NavLink key={m.to} to={m.to} end={'end' in m && m.end} className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-[0.06em] ${isActive ? 'text-text' : 'text-faint'}`}><m.Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />{m.label}</NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
