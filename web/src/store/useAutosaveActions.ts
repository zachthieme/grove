import { useCallback } from 'react'
import * as api from '../api/client'
import { AUTOSAVE_STORAGE_KEY } from '../constants'
import type { OrgDataState } from './OrgDataContext'

interface Args {
  setState: React.Dispatch<React.SetStateAction<OrgDataState>>
}

/**
 * Restore-from-autosave and dismiss-autosave callbacks. Restore syncs the
 * frontend's saved snapshot up to the backend; dismiss wipes both sides and
 * returns the app to the upload-prompt state.
 */
export function useAutosaveActions({ setState }: Args) {
  const restoreAutosave = useCallback(() => {
    setState(s => {
      const ad = s.autosaveAvailable
      if (!ad) return s
      api.restoreState(ad).catch((err) => {
        api.reportLog('WARN', 'Failed to sync restored state to backend', { error: err })
      })
      return {
        ...s,
        original: ad.original,
        working: ad.working,
        recycled: ad.recycled,
        pods: ad.pods ?? [],
        originalPods: ad.originalPods ?? [],
        settings: ad.settings ?? { disciplineOrder: [] },
        currentSnapshotName: ad.snapshotName || null,
        loaded: true,
        autosaveAvailable: null,
      }
    })
  }, [setState])

  const dismissAutosave = useCallback(async () => {
    localStorage.removeItem(AUTOSAVE_STORAGE_KEY)
    try { await api.deleteAutosave() } catch { /* ignore — best-effort */ }
    setState(s => ({
      ...s,
      autosaveAvailable: null,
      original: [],
      working: [],
      recycled: [],
      pods: [],
      originalPods: [],
      settings: { disciplineOrder: [] },
      loaded: false,
      snapshots: [],
      currentSnapshotName: null,
    }))
  }, [setState])

  return { restoreAutosave, dismissAutosave }
}
