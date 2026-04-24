import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { type OrgNode, type Pod, type AutosaveData, type MappedColumn, type SnapshotInfo, type Settings } from '../api/types'
import * as api from '../api/client'
import { setOnApiError } from '../api/client'
import type { OrgDataStateValue, OrgMutationsValue } from './orgTypes'
import { AUTOSAVE_STORAGE_KEY } from '../constants'
import { useUI } from './UIContext'
import { useDirtyTracking } from './useDirtyTracking'
import { useOrgMutations as useMutationCallbacks } from './useOrgMutations'
import { useUndoRedo } from '../hooks/useUndoRedo'

export interface OrgDataState {
  original: OrgNode[]
  working: OrgNode[]
  recycled: OrgNode[]
  pods: Pod[]
  originalPods: Pod[]
  settings: Settings
  loaded: boolean
  pendingMapping: {
    headers: string[]
    mapping: Record<string, MappedColumn>
    preview: string[][]
  } | null
  snapshots: SnapshotInfo[]
  currentSnapshotName: string | null
  autosaveAvailable: AutosaveData | null
}

export const OrgDataStateContext = createContext<OrgDataStateValue | null>(null)
export const OrgMutationsContext = createContext<OrgMutationsValue | null>(null)

export function useOrgData(): OrgDataStateValue {
  const ctx = useContext(OrgDataStateContext)
  if (!ctx) throw new Error('useOrgData must be used within an OrgDataProvider')
  return ctx
}
export function useOrgMutations(): OrgMutationsValue {
  const ctx = useContext(OrgMutationsContext)
  if (!ctx) throw new Error('useOrgMutations must be used within an OrgDataProvider')
  return ctx
}

export function OrgDataProvider({ children }: { children: ReactNode }) {
  const { setError } = useUI()

  useEffect(() => {
    return setOnApiError((msg) => setError(msg))
  }, [setError])

  const [state, setState] = useState<OrgDataState>({
    original: [],
    working: [],
    recycled: [],
    pods: [],
    originalPods: [],
    settings: { disciplineOrder: [] },
    loaded: false,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
  })

  // Ref for synchronous latest-state access in reparent (needs to read working to find manager)
  const workingRef = useRef(state.working)
  workingRef.current = state.working

  const { undoStack, redoStack, pushUndo, canUndo, canRedo, setUndoStack, setRedoStack } = useUndoRedo()

  const captureForUndo = useCallback(() => {
    setState(s => {
      pushUndo({ working: s.working, pods: s.pods })
      return s
    })
  }, [pushUndo])

  // On mount: check for autosave first, then fall back to loading org data
  useEffect(() => {
    async function init() {
      // Check localStorage first
      let localRaw = localStorage.getItem(AUTOSAVE_STORAGE_KEY)
      if (localRaw) {
        try {
          const data = JSON.parse(localRaw) as AutosaveData
          setState((s) => ({ ...s, autosaveAvailable: data }))
        } catch {
          // Corrupt data — clear it so the app doesn't get stuck
          localStorage.removeItem(AUTOSAVE_STORAGE_KEY)
          localRaw = null
        }
      }

      // Check server autosave if nothing in localStorage
      if (!localRaw) {
        try {
          const serverAutosave = await api.readAutosave()
          if (serverAutosave) {
            setState((s) => ({ ...s, autosaveAvailable: serverAutosave }))
            // Still load org data in background so dismiss has data to fall back to
          }
        } catch { /* No server autosave — expected on fresh start */ }
      }
      // else: local autosave found — banner will show, but we still load org data
      // in the background so if the user dismisses, the app has data.

      // Load org data (whether or not autosave was found)
      try {
        const data = await api.getOrg()
        if (data) {
          // Only set loaded if no autosave banner is showing — otherwise the
          // banner handles the loaded transition via restoreAutosave/dismissAutosave
          setState((s) => ({
            ...s,
            original: data.original,
            working: data.working,
            pods: data.pods ?? [],
            settings: data.settings ?? { disciplineOrder: [] },
            loaded: s.autosaveAvailable ? s.loaded : true,
          }))
        }
      } catch { /* No existing data — stay in upload state */ }

      // Also load snapshots list
      try {
        const snapshots = await api.listSnapshots()
        setState((s) => ({ ...s, snapshots }))
      } catch { /* Snapshots unavailable — non-fatal, UI works without them */ }
    }
    init()
  }, [])

  /** Shared state update for fresh org data loads (upload, confirmMapping). */
  const applyOrgData = useCallback((data: { original: OrgNode[]; working: OrgNode[]; pods?: Pod[]; settings?: Settings }, extra?: Partial<OrgDataState>) => {
    setState((s) => ({
      ...s,
      original: data.original,
      working: data.working,
      recycled: [],
      pods: data.pods ?? [],
      originalPods: data.pods ?? [],
      settings: data.settings ?? { disciplineOrder: [] },
      loaded: true,
      pendingMapping: null,
      ...extra,
    }))
  }, [])

  const handleError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    setError(msg)
  }, [setError])

  const upload = useCallback(async (file: File) => {
    const isZip = file.name.toLowerCase().endsWith('.zip')
    let resp: Awaited<ReturnType<typeof api.uploadFile>>
    try {
      resp = isZip ? await api.uploadZipFile(file) : await api.uploadFile(file)
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (resp.status === 'ready' && resp.orgData) {
      applyOrgData(resp.orgData, { snapshots: resp.snapshots ?? [] })
      if (resp.persistenceWarning) {
        setError(`Warning: ${resp.persistenceWarning}`)
      }
    } else if (resp.status === 'needs_mapping') {
      setState((s) => ({
        ...s,
        pendingMapping: {
          headers: resp.headers!,
          mapping: resp.mapping!,
          preview: resp.preview!,
        },
      }))
    }
  }, [setError, applyOrgData])

  const createOrg = useCallback(async (name: string): Promise<string | undefined> => {
    try {
      const data = await api.createOrg(name)
      applyOrgData(data, { autosaveAvailable: null, snapshots: [] })
      return data.working[0]?.id
    } catch (err) {
      setError(`Create failed: ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    }
  }, [setError, applyOrgData])

  const confirmMapping = useCallback(async (mapping: Record<string, string>) => {
    try {
      const data = await api.confirmMapping(mapping)
      const snapshots = await api.listSnapshots()
      applyOrgData(data, { snapshots })
      if (data.persistenceWarning) {
        setError(`Warning: ${data.persistenceWarning}`)
      }
    } catch (err) { handleError(err) }
  }, [handleError, setError, applyOrgData])

  const cancelMapping = useCallback(() => {
    setState((s) => ({ ...s, pendingMapping: null }))
  }, [])

  const mutations = useMutationCallbacks({ setState, workingRef, handleError, setError, captureForUndo })

  const restoreAutosave = useCallback(() => {
    setState(s => {
      const ad = s.autosaveAvailable
      if (!ad) return s
      api.restoreState(ad).catch(() => {
        console.warn('Failed to sync restored state to backend')
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
  }, [])

  const dismissAutosave = useCallback(async () => {
    localStorage.removeItem(AUTOSAVE_STORAGE_KEY)
    try { await api.deleteAutosave() } catch { /* ignore */ }
    // Clear everything — go back to fresh upload state
    setState((s) => ({
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
  }, [])

  // Warn before navigating away with unsaved changes
  useDirtyTracking(state.loaded, state.working)

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setState(s => {
      setRedoStack(r => [...r, { working: s.working, pods: s.pods }])
      api.restoreState({
        original: s.original,
        working: prev.working,
        recycled: s.recycled,
        pods: prev.pods,
        originalPods: s.originalPods,
        settings: s.settings,
        snapshotName: '',
        timestamp: new Date().toISOString(),
      }).catch(() => {
        console.warn('Failed to sync undo state to backend')
      })
      return { ...s, working: prev.working, pods: prev.pods, currentSnapshotName: null }
    })
  }, [undoStack, setUndoStack, setRedoStack])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    setState(s => {
      setUndoStack(u => [...u, { working: s.working, pods: s.pods }])
      api.restoreState({
        original: s.original,
        working: next.working,
        recycled: s.recycled,
        pods: next.pods,
        originalPods: s.originalPods,
        settings: s.settings,
        snapshotName: '',
        timestamp: new Date().toISOString(),
      }).catch(() => {
        console.warn('Failed to sync redo state to backend')
      })
      return { ...s, working: next.working, pods: next.pods, currentSnapshotName: null }
    })
  }, [redoStack, setUndoStack, setRedoStack])

  const stateValue: OrgDataStateValue = useMemo(() => ({
    original: state.original, working: state.working, recycled: state.recycled,
    pods: state.pods, originalPods: state.originalPods, settings: state.settings,
    loaded: state.loaded, pendingMapping: state.pendingMapping,
    snapshots: state.snapshots, currentSnapshotName: state.currentSnapshotName,
    autosaveAvailable: state.autosaveAvailable,
  }), [state])

  const mutationsValue: OrgMutationsValue = useMemo(() => ({
    upload, createOrg, ...mutations, confirmMapping, cancelMapping,
    restoreAutosave, dismissAutosave, undo, redo, canUndo, canRedo,
  }), [upload, createOrg, mutations, confirmMapping, cancelMapping,
       restoreAutosave, dismissAutosave, undo, redo, canUndo, canRedo])

  return (
    <OrgDataStateContext.Provider value={stateValue}>
      <OrgMutationsContext.Provider value={mutationsValue}>
        {children}
      </OrgMutationsContext.Provider>
    </OrgDataStateContext.Provider>
  )
}
