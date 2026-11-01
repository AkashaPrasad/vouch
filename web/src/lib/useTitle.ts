import { useEffect } from 'react'
export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · Vouch` : 'Vouch — Know before you say yes' }, [title])
}
