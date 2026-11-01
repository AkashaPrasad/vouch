import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, getToken, GOOGLE_CLIENT_ID, setToken } from './api'
import type { User } from './types'
import { useToast } from '../components/Toast'

declare global {
  interface Window { google?: any }
}

interface AuthCtx {
  user: User | null
  token: string | null
  ready: boolean
  gsiReady: boolean
  signOut: () => void
  renderButton: (el: HTMLElement, opts?: Record<string, unknown>) => void
  prompt: () => void
}

const Ctx = createContext<AuthCtx | null>(null)
const USER_KEY = 'vouch_user'

function loadUser(): User | null {
  try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [token, setTok] = useState<string | null>(getToken())
  const [user, setUser] = useState<User | null>(() => (getToken() ? loadUser() : null))
  const [ready, setReady] = useState(false)
  const [gsiReady, setGsiReady] = useState(false)
  const initialized = useRef(false)

  const handleCredential = useCallback(async (resp: { credential?: string }) => {
    if (!resp?.credential) return
    try {
      const out = await api.googleAuth(resp.credential)
      setToken(out.token); setTok(out.token); setUser(out.user)
      try { localStorage.setItem(USER_KEY, JSON.stringify(out.user)) } catch { /* ignore */ }
      toast.show(`Signed in as ${out.user.name?.split(' ')[0] || out.user.email}`, 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Sign-in failed. Please try again.', 'error')
    }
  }, [toast])

  // Load Google Identity Services once.
  useEffect(() => {
    const init = () => {
      if (initialized.current || !window.google?.accounts?.id) return
      initialized.current = true
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential, auto_select: false, cancel_on_tap_outside: true })
      setGsiReady(true)
    }
    if (window.google?.accounts?.id) { init(); return }
    let s = document.querySelector<HTMLScriptElement>('script[data-gsi]')
    if (!s) {
      s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true; s.defer = true; s.dataset.gsi = '1'
      document.head.appendChild(s)
    }
    s.addEventListener('load', init)
    return () => s?.removeEventListener('load', init)
  }, [handleCredential])

  // Validate a stored token.
  useEffect(() => {
    if (!token) { setReady(true); return }
    api.me()
      .then((me) => { setUser(me); try { localStorage.setItem(USER_KEY, JSON.stringify(me)) } catch { /* ignore */ } })
      .catch((e) => { if (e?.status === 401 || e?.status === 403) { setToken(null); setTok(null); setUser(null) } })
      .finally(() => setReady(true))
  }, [token])

  const signOut = useCallback(() => {
    setToken(null); setTok(null); setUser(null)
    try { localStorage.removeItem(USER_KEY) } catch { /* ignore */ }
    window.google?.accounts?.id?.disableAutoSelect?.()
    toast.show('Signed out', 'info')
  }, [toast])

  const renderButton = useCallback((el: HTMLElement, opts: Record<string, unknown> = {}) => {
    if (!window.google?.accounts?.id) return
    el.innerHTML = ''
    window.google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', ...opts })
  }, [])

  const prompt = useCallback(() => { window.google?.accounts?.id?.prompt?.() }, [])

  return <Ctx.Provider value={{ user, token, ready, gsiReady, signOut, renderButton, prompt }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside provider')
  return c
}
