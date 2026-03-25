import { useEffect, useRef, useState } from 'react'
import type { Person, Pod, AutosaveData } from '../api/types'
import * as api from '../api/client'

const AUTOSAVE_DEBOUNCE_MS = 2000

export function useAutosave(state: {
  original: Person[]
  working: Person[]
  recycled: Person[]
  pods: Pod[]
  originalPods: Pod[]
  currentSnapshotName: string | null
  loaded: boolean
  suppressAutosaveRef?: React.RefObject<boolean>
}) {
  const timerRef = useRef<number>(undefined)
  const [serverSaveError, setServerSaveError] = useState(false)

  useEffect(() => {
    if (!state.loaded || state.working.length === 0 || state.suppressAutosaveRef?.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const data: AutosaveData = {
        original: state.original,
        working: state.working,
        recycled: state.recycled,
        pods: state.pods,
        originalPods: state.originalPods,
        snapshotName: state.currentSnapshotName ?? '',
        timestamp: new Date().toISOString(),
      }
      try {
        localStorage.setItem('grove-autosave', JSON.stringify(data))
      } catch (e) {
        console.warn('localStorage autosave failed:', e)
      }
      api.writeAutosave(data)
        .then(() => setServerSaveError(false))
        .catch((err) => {
          console.warn('Server autosave failed:', err)
          setServerSaveError(true)
        })
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state.original, state.working, state.recycled, state.pods, state.originalPods, state.currentSnapshotName, state.loaded])

  return { serverSaveError }
}
