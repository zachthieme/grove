import { useEffect, useRef } from 'react'

// Scenarios: AUTO-005
/**
 * Tracks whether the org data has been mutated since loading,
 * and warns the user before navigating away with unsaved changes.
 *
 * IMPORTANT: Reference equality contract
 * ─────────────────────────────────────────
 * This hook detects changes by comparing `working` with `===` (reference equality).
 * It relies on the invariant that every mutation produces a NEW array reference
 * (i.e., the array is replaced, never mutated in-place). If any code path mutates
 * the working array in-place without replacing the reference, this hook will fail
 * to detect the change and the user will not be warned about unsaved work.
 *
 * This contract is currently upheld because:
 * 1. All API mutation responses return a fresh `working` array from the server.
 * 2. OrgDataContext replaces its state via setWorking(newArray), never .push()/.splice().
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
