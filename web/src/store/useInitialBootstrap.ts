import { useEffect, useRef } from 'react'
import * as api from '../api/client'
import type { AutosaveData, OrgNode, Pod, Settings, SnapshotInfo } from '../api/types'
import { AUTOSAVE_STORAGE_KEY } from '../constants'

export interface BootstrapHandlers {
  onAutosaveFound: (data: AutosaveData) => void
  onOrgLoaded: (data: { original: OrgNode[]; working: OrgNode[]; pods?: Pod[]; settings?: Settings }, hasAutosave: boolean) => void
  onSnapshotsLoaded: (snapshots: SnapshotInfo[]) => void
}

/**
 * Phased on-mount bootstrap: localStorage autosave → server autosave → /api/org → /api/snapshots.
 * Each phase fires its handler synchronously when data lands so the provider can
 * batch React state updates without sharing a setState shape across phases.
 *
 * Runs once per provider instance; handlers are read from a ref so callers can
 * pass freshly-bound functions without retriggering the effect.
 */
export function useInitialBootstrap(handlers: BootstrapHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const h = handlersRef.current

      const localAutosave = readLocalAutosave()
      let hasAutosave = false
      if (localAutosave) {
        hasAutosave = true
        if (!cancelled) h.onAutosaveFound(localAutosave)
      } else {
        try {
          const serverAutosave = await api.readAutosave()
          if (!cancelled && serverAutosave) {
            hasAutosave = true
            h.onAutosaveFound(serverAutosave)
          }
        } catch (err) {
          api.reportLog('WARN', 'readAutosave failed', { error: err })
        }
      }

      try {
        const data = await api.getOrg()
        if (!cancelled && data) h.onOrgLoaded(data, hasAutosave)
      } catch (err) {
        api.reportLog('WARN', 'getOrg failed', { error: err })
      }

      try {
        const snapshots = await api.listSnapshots()
        if (!cancelled) h.onSnapshotsLoaded(snapshots)
      } catch (err) {
        api.reportLog('WARN', 'listSnapshots failed', { error: err })
      }
    })()

    return () => { cancelled = true }
  }, [])
}

function readLocalAutosave(): AutosaveData | null {
  const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AutosaveData
  } catch {
    localStorage.removeItem(AUTOSAVE_STORAGE_KEY)
    return null
  }
}
