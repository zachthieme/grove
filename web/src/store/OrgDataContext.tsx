import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { type OrgNode, type Pod, type AutosaveData, type MappedColumn, type SnapshotInfo, type Settings } from '../api/types'
import * as api from '../api/client'
import { setOnApiError } from '../api/client'
import type { OrgDataStateValue, OrgMutationsValue } from './orgTypes'
import { useUI } from './UIContext'
import { useDirtyTracking } from './useDirtyTracking'
import { useOrgMutations as useMutationCallbacks } from './useOrgMutations'
import { useUndoRedo } from '../hooks/useUndoRedo'
import { useInitialBootstrap } from './useInitialBootstrap'
import { useUndoRedoActions } from './useUndoRedoActions'
import { useAutosaveActions } from './useAutosaveActions'

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

const INITIAL_STATE: OrgDataState = {
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
}

export function OrgDataProvider({ children }: { children: ReactNode }) {
  const { setError } = useUI()

  useEffect(() => setOnApiError((msg) => setError(msg)), [setError])

  const [state, setState] = useState<OrgDataState>(INITIAL_STATE)

  // Sync ref for callbacks that need latest working without re-binding (reparent).
  const workingRef = useRef(state.working)
  workingRef.current = state.working
  const podsRef = useRef(state.pods)
  podsRef.current = state.pods

  const { undoStack, redoStack, pushUndo, canUndo, canRedo, setUndoStack, setRedoStack } = useUndoRedo()

  const captureForUndo = useCallback(() => {
    setState(s => {
      pushUndo({ working: s.working, pods: s.pods })
      return s
    })
  }, [pushUndo])

  useInitialBootstrap({
    onAutosaveFound: useCallback((data: AutosaveData) => {
      setState(s => ({ ...s, autosaveAvailable: data }))
    }, []),
    onOrgLoaded: useCallback((data, hasAutosave) => {
      setState(s => ({
        ...s,
        original: data.original,
        working: data.working,
        pods: data.pods ?? [],
        settings: data.settings ?? { disciplineOrder: [] },
        loaded: hasAutosave ? s.loaded : true,
      }))
    }, []),
    onSnapshotsLoaded: useCallback((snapshots) => {
      setState(s => ({ ...s, snapshots }))
    }, []),
  })

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
    setError(err instanceof Error ? err.message : String(err))
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

  const mutations = useMutationCallbacks({ setState, workingRef, podsRef, handleError, setError, captureForUndo })

  const { restoreAutosave, dismissAutosave } = useAutosaveActions({ setState })
  const { undo, redo } = useUndoRedoActions({ setState, undoStack, redoStack, setUndoStack, setRedoStack })

  // Warn before navigating away with unsaved changes
  useDirtyTracking(state.loaded, state.working)

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
