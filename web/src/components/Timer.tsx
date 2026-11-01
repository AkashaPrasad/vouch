import { useEffect, useRef, useState } from 'react'

/** Live mono timer. Counts from `startedAt` until `stoppedMs` is provided. */
export function Timer({ startedAt, stoppedMs, className = '' }: { startedAt: number | null; stoppedMs?: number | null; className?: string }) {
  const [now, setNow] = useState(Date.now())
  const raf = useRef<number | null>(null)
  const running = startedAt != null && stoppedMs == null
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => { window.clearInterval(id); if (raf.current) cancelAnimationFrame(raf.current) }
  }, [running])
  const ms = stoppedMs != null ? stoppedMs : startedAt != null ? Math.max(0, now - startedAt) : 0
  return (
    <span className={`font-mono tabular-nums ${className}`} aria-label={`${(ms / 1000).toFixed(1)} seconds elapsed`}>
      {(ms / 1000).toFixed(1)}<span className="ml-0.5 text-faint">s</span>
    </span>
  )
}
