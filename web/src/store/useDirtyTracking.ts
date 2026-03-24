import { useEffect, useRef } from 'react'

/**
 * Tracks whether the org data has been mutated since loading,
 * and warns the user before navigating away with unsaved changes.
 */
export function useDirtyTracking(loaded: boolean, working: unknown[]) {
  const isDirtyRef = useRef(false)
  const initialWorkingRef = useRef<unknown[] | null>(null)

  // Capture the initial working state on first load
  useEffect(() => {
    if (loaded && initialWorkingRef.current === null) {
      initialWorkingRef.current = working
    }
    if (!loaded) {
      isDirtyRef.current = false
      initialWorkingRef.current = null
    }
  }, [loaded, working])

  // Mark dirty when working changes AFTER initial load
  useEffect(() => {
    if (loaded && initialWorkingRef.current !== null && working !== initialWorkingRef.current) {
      isDirtyRef.current = true
    }
  }, [loaded, working])

  // Warn before leaving when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
}
