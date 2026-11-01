import { useEffect } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { Screenshot } from '../lib/types'
import { api } from '../lib/api'

export interface AgentProgress { text: string; preview_url?: string | null; log: string[] }

/** Flat side panel: live TinyFish browser (sandboxed iframe), else the latest screenshot, else the step log. */
export function PreviewPanel({ code, name, progress, shot, onClose }: { code: string; name: string; progress?: AgentProgress; shot?: Screenshot; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  const url = progress?.preview_url || null
  const mode = url ? 'live' : shot ? 'shot' : 'log'
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-labelledby="pv-h" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-border-strong bg-bg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="font-mono text-xs text-muted">{code}</span>
          <h2 id="pv-h" className="text-sm font-semibold">{name}</h2>
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{mode === 'live' ? 'live browser' : mode === 'shot' ? 'screenshot' : 'step log'}</span>
          {(url || shot) && <a href={url || shot!.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-h-[36px] items-center gap-1 font-mono text-[11px] text-muted hover:text-text">open in new tab<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden /></a>}
          <button onClick={onClose} className={`grid h-10 w-10 place-items-center text-faint hover:text-text ${url || shot ? '' : 'ml-auto'}`} aria-label="Close preview"><X className="h-4 w-4" strokeWidth={1.5} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {mode === 'live' && (
            <div className="flex h-full flex-col">
              <iframe src={url!} title={`Live browser for ${name}`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" className="h-full min-h-[60vh] w-full flex-1 border-0 bg-surface" />
              <p className="border-t border-border px-4 py-2 font-mono text-[11px] text-faint">If the stream does not render here, use “open in new tab”.</p>
            </div>
          )}
          {mode === 'shot' && (
            <figure>
              <img src={api.imageUrl(shot!.image_url)} alt={`Screenshot of ${shot!.url}`} className="block w-full border-b border-border" />
              <figcaption className="px-4 py-2 font-mono text-[11px] text-faint">{shot!.url}{shot!.taken_at ? ` · ${shot!.taken_at}` : ''}</figcaption>
            </figure>
          )}
          {(mode === 'log' || (progress?.log.length ?? 0) > 0) && (
            <ol className="p-4 font-mono text-xs leading-relaxed text-muted" aria-live="polite" aria-label="Agent steps">
              {(progress?.log ?? []).map((l, i) => <li key={i} className="flex gap-3 border-b border-border py-1.5"><span className="tnum text-faint">{String(i + 1).padStart(2, '0')}</span><span>{l}</span></li>)}
              {!progress?.log.length && <li className="text-faint">No steps reported yet.</li>}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
