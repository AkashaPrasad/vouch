import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { RecentItem } from '../lib/types'
import { RecentList } from '../components/RecentWall'
import { useTitle } from '../lib/useTitle'
import { useToast } from '../components/Toast'

export default function Me() {
  useTitle('My checks')
  const { user, token, ready, gsiReady, prompt, renderButton } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<RecentItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const btn = useRef<HTMLDivElement>(null)
  const warned = useRef(false)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    api.myChecks().then((r) => setItems(r.items ?? [])).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your checks.')).finally(() => setLoading(false))
  }, [token])

  useEffect(() => { if (!token && gsiReady) { prompt(); if (btn.current) renderButton(btn.current) } }, [token, gsiReady, prompt, renderButton])

  if (!token && ready) {
    if (!warned.current) { warned.current = true; setTimeout(() => toast.show('Sign in with Google to see your checks.', 'info'), 0) }
    return <Navigate to="/" replace />
  }

  return (
    <div className="container-x pt-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">My checks</h1>
          <p className="mt-1 text-sm text-muted">{user ? `Signed in as ${user.email}` : <span className="skeleton inline-block h-4 w-48 align-middle" />}</p>
        </div>
        <Link to="/" className="btn-primary self-start sm:self-auto"><Plus className="h-4 w-4" strokeWidth={2} aria-hidden />New check</Link>
      </div>
      <div ref={btn} className="hidden" />
      <div className="mt-6">
        <RecentList items={items} loading={loading} error={error} empty={<>You haven’t checked any offers yet. <Link to="/" className="text-text underline underline-offset-4">Check your first one</Link>.</>} />
      </div>
    </div>
  )
}
