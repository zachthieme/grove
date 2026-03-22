import { useEffect, useRef } from 'react'
import type { Person, AutosaveData } from '../api/types'
import * as api from '../api/client'

export function useAutosave(state: {
  original: Person[]
  working: Person[]
  recycled: Person[]
  currentSnapshotName: string | null
  loaded: boolean
}) {
  const timerRef = useRef<number>(undefined)

  useEffect(() => {
    if (!state.loaded || state.working.length === 0) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const data: AutosaveData = {
        original: state.original,
        working: state.working,
        recycled: state.recycled,
        snapshotName: state.currentSnapshotName ?? '',
        timestamp: new Date().toISOString(),
      }
      localStorage.setItem('grove-autosave', JSON.stringify(data))
      api.writeAutosave(data).catch(() => {}) // fire-and-forget
    }, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state.original, state.working, state.recycled, state.currentSnapshotName, state.loaded])
}
