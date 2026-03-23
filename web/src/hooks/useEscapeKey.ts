import { useEffect } from 'react'

/**
 * Calls the callback when Escape is pressed, unless focus is in an input/select/textarea.
 * Only active when `enabled` is true.
 */
export function useEscapeKey(callback: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (el?.isContentEditable) return
      if (e.key === 'Escape') {
        callback()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [callback, enabled])
}
