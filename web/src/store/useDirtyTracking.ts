import { useEffect, useRef } from 'react'

/**
 * Tracks whether the org data has been mutated since loading,
 * and warns the user before navigating away with unsaved changes.
 */
export function useDirtyTracking(loaded: boolean, working: unknown[]) {
  const isDirtyRef = useRef(false)

  // Mark dirty after any mutation
  useEffect(() => {
    if (loaded && working.length > 0) {
      isDirtyRef.current = true
    }
  }, [working]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear dirty on fresh load
  useEffect(() => {
    if (!loaded) {
      isDirtyRef.current = false
    }
  }, [loaded])

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
