import { useEffect, useSyncExternalStore } from 'react'
import { api, ApiError } from './api'

/** Tiny shared store for the unread-alerts badge (sidebar, header bell, Overview). */
let unread: number | null = null
let unavailable = false
const subs = new Set<() => void>()
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const snapshot = () => unread

export function setUnread(n: number | null) { unread = n; subs.forEach((f) => f()) }
export function bumpUnread(delta: number) { if (unread != null) setUnread(Math.max(0, unread + delta)) }

export async function refreshUnread() {
  if (unavailable) return
  try { const r = await api.unreadAlerts(); setUnread(typeof r.count === 'number' ? r.count : 0) }
  catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 501 || e.status === 401)) { unavailable = e.status !== 401; setUnread(null) } }
}

/** Read the current unread count (null = unknown or not available). */
export function useUnreadAlerts() { return useSyncExternalStore(subscribe, snapshot) }

/** Mount once (AppShell): fetches now and every 60 s while signed in. */
export function useUnreadPoller(enabled: boolean) {
  useEffect(() => {
    if (!enabled) { setUnread(null); return }
    unavailable = false
    void refreshUnread()
    const t = window.setInterval(() => { void refreshUnread() }, 60_000)
    return () => window.clearInterval(t)
  }, [enabled])
}
