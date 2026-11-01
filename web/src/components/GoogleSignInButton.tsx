import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'

/**
 * Vouch-styled sign-in button. The real Google Identity button is rendered on top at opacity 0,
 * so the click still runs Google's own flow (and returns the ID token) while the visible button
 * matches the flat dark UI instead of Google's white frame.
 */
export function GoogleSignInButton({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { gsiReady, renderButton } = useAuth()
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)

  useEffect(() => {
    if (!host.current) return
    const measure = () => setW(Math.round(host.current?.getBoundingClientRect().width || 0))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (gsiReady && overlay.current && w > 0) {
      renderButton(overlay.current, { type: compact ? 'icon' : 'standard', shape: 'rectangular', size: 'large', width: Math.min(400, Math.max(40, w)), text: 'signin_with', theme: 'outline' })
    }
  }, [gsiReady, renderButton, w, compact])

  return (
    <div ref={host} className={`relative inline-flex ${className}`}>
      <span
        aria-hidden
        className={`inline-flex min-h-[44px] items-center gap-2 border border-border-strong bg-surface px-3 text-sm font-medium text-text ${compact ? 'min-w-[44px] justify-center px-0' : ''}`}
      >
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.9 38 46.5 31.8 46.5 24.5z" />
          <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {!compact && <span>Sign in with Google</span>}
      </span>
      <div
        ref={overlay}
        className="absolute inset-0 overflow-hidden opacity-0"
        style={{ colorScheme: 'light' }}
        aria-label="Sign in with Google"
      />
      {!gsiReady && <span className="absolute inset-0 cursor-wait" aria-hidden />}
    </div>
  )
}
