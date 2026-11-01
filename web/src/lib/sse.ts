import { api } from './api'

export type SSEHandlers = Partial<Record<
  'check.created' | 'extraction.done' | 'signal.update' | 'agent.progress' | 'verdict.preliminary' | 'explanation.token' | 'verdict.final' | 'error' | 'done',
  (data: any) => void
>> & { onConnectionError?: () => void }

const EVENTS = ['check.created', 'extraction.done', 'signal.update', 'agent.progress', 'verdict.preliminary', 'explanation.token', 'verdict.final', 'error', 'done'] as const

/** Subscribe to a check's live stream. Returns an unsubscribe function. */
export function subscribeCheck(id: string, handlers: SSEHandlers): () => void {
  const es = new EventSource(api.streamUrl(id))
  let closed = false
  let finished = false
  const close = () => { if (!closed) { closed = true; es.close() } }

  for (const type of EVENTS) {
    es.addEventListener(type, (ev) => {
      const raw = (ev as MessageEvent).data
      let data: unknown = {}
      if (raw) { try { data = JSON.parse(raw) } catch { data = { message: String(raw) } } }
      if (type === 'done') { finished = true; handlers.done?.(data); close(); return }
      if (type === 'error' && raw === undefined) return // native connection error, handled below
      handlers[type]?.(data)
      if (type === 'verdict.final') finished = true
    })
  }
  es.onerror = () => {
    if (finished) { close(); return }
    // EventSource auto-reconnects while CONNECTING; only surface when it gives up.
    if (es.readyState === EventSource.CLOSED) { handlers.onConnectionError?.(); close() }
  }
  return close
}
