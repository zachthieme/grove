import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ORIGINAL_SNAPSHOT, type Person, type AutosaveData } from '../api/types'
import * as api from '../api/client'
import type { OrgState, OrgContextValue, ViewMode, DataView } from './orgTypes'
import { useDirtyTracking } from './useDirtyTracking'

const OrgContext = createContext<OrgContextValue | null>(null)

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error('useOrg must be used within an OrgProvider')
  }
  return ctx
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrgState>({
    original: [],
    working: [],
    recycled: [],
    loaded: false,
    viewMode: 'detail',
    dataView: 'working',
    selectedIds: new Set(),
    hiddenEmploymentTypes: new Set(),
    headPersonId: null,
    binOpen: false,
    layoutKey: 0,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
    error: null,
  })

  // Ref to access latest state in callbacks without re-creating them
  const stateRef = useRef(state)
  stateRef.current = state

  // Backward compat getter
  const selectedId = useMemo(() => {
    return state.selectedIds.size === 1 ? [...state.selectedIds][0] : null
  }, [state.selectedIds])

  // On mount: check for autosave first, then fall back to loading org data
  useEffect(() => {
    async function init() {
      // Check localStorage first
      const localRaw = localStorage.getItem('grove-autosave')
      if (localRaw) {
        try {
          const data = JSON.parse(localRaw) as AutosaveData
          setState((s) => ({ ...s, autosaveAvailable: data }))
        } catch { /* ignore corrupt data */ }
      }

      // Check server autosave if nothing in localStorage
      if (!localRaw) {
        try {
          const serverAutosave = await api.readAutosave()
          if (serverAutosave) {
            setState((s) => ({ ...s, autosaveAvailable: serverAutosave }))
            return
          }
        } catch { /* ignore */ }
      } else {
        // We found a local autosave — still need to load org data in the background
        // so if the user dismisses, the app has data. But we show the banner first.
        return
      }

      // No autosave — load org data normally
      try {
        const data = await api.getOrg()
        if (data) {
          setState((s) => ({
            ...s,
            original: data.original,
            working: data.working,
            loaded: true,
          }))
        }
      } catch { /* No existing data — stay in upload state */ }

      // Also load snapshots list
      try {
        const snapshots = await api.listSnapshots()
        setState((s) => ({ ...s, snapshots }))
      } catch { /* ignore */ }
    }
    init()
  }, [])

  const setViewMode = useCallback((viewMode: ViewMode) => {
    setState((s) => ({ ...s, viewMode }))
  }, [])

  const setDataView = useCallback((dataView: DataView) => {
    setState((s) => ({ ...s, dataView }))
  }, [])

  const setSelectedId = useCallback((id: string | null) => {
    setState((s) => ({ ...s, selectedIds: id ? new Set([id]) : new Set() }))
  }, [])

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setState((s) => {
      if (multi) {
        const next = new Set(s.selectedIds)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return { ...s, selectedIds: next }
      }
      // Single select: if already selected alone, deselect; otherwise select just this one
      if (s.selectedIds.size === 1 && s.selectedIds.has(id)) {
        return { ...s, selectedIds: new Set() }
      }
      return { ...s, selectedIds: new Set([id]) }
    })
  }, [])

  const clearSelection = useCallback(() => {
    setState((s) => ({ ...s, selectedIds: new Set() }))
  }, [])

  const upload = useCallback(async (file: File) => {
    const isZip = file.name.toLowerCase().endsWith('.zip')
    let resp: Awaited<ReturnType<typeof api.uploadFile>>
    try {
      resp = isZip ? await api.uploadZipFile(file) : await api.uploadFile(file)
    } catch (err) {
      setState((s) => ({ ...s, error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }))
      return
    }
    if (resp.status === 'ready' && resp.orgData) {
      setState((s) => ({
        ...s,
        original: resp.orgData!.original,
        working: resp.orgData!.working,
        recycled: [],
        loaded: true,
        pendingMapping: null,
        snapshots: resp.snapshots ?? [],
      }))
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
  }, [])

  const confirmMappingAction = useCallback(async (mapping: Record<string, string>) => {
    const data = await api.confirmMapping(mapping)
    const snapshots = await api.listSnapshots()
    setState((s) => ({
      ...s,
      original: data.original,
      working: data.working,
      recycled: [],
      loaded: true,
      pendingMapping: null,
      snapshots,
    }))
  }, [])

  const cancelMapping = useCallback(() => {
    setState((s) => ({ ...s, pendingMapping: null }))
  }, [])

  const setError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    setState((s) => ({ ...s, error: msg }))
  }, [])

  const move = useCallback(async (personId: string, newManagerId: string, newTeam: string) => {
    try {
      const working = await api.movePerson({ personId, newManagerId, newTeam })
      setState((s) => ({ ...s, working, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const reparent = useCallback(async (personId: string, newManagerId: string) => {
    const currentWorking = stateRef.current.working
    const newManager = currentWorking.find((p) => p.id === newManagerId)
    if (!newManager) {
      setState((s) => ({ ...s, error: `Manager not found (may have been deleted)` }))
      return
    }
    try {
      const working = await api.movePerson({ personId, newManagerId, newTeam: newManager.team })
      setState((s) => ({ ...s, working, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const reorder = useCallback(async (personIds: string[]) => {
    try {
      const working = await api.reorderPeople(personIds)
      setState((s) => ({ ...s, working, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const update = useCallback(async (personId: string, fields: Record<string, string>) => {
    try {
      const working = await api.updatePerson({ personId, fields })
      setState((s) => ({ ...s, working, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const add = useCallback(async (person: Omit<Person, 'id'>) => {
    try {
      const working = await api.addPerson(person)
      setState((s) => ({ ...s, working, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const remove = useCallback(async (personId: string) => {
    try {
      const resp = await api.deletePerson({ personId })
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const restore = useCallback(async (personId: string) => {
    try {
      const resp = await api.restorePerson(personId)
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const emptyBinAction = useCallback(async () => {
    try {
      const resp = await api.emptyBin()
      setState((s) => ({ ...s, recycled: resp.recycled, currentSnapshotName: null }))
    } catch (err) { setError(err) }
  }, [setError])

  const setBinOpen = useCallback((binOpen: boolean) => {
    setState((s) => ({ ...s, binOpen, selectedIds: binOpen ? new Set() : s.selectedIds }))
  }, [])

  const saveSnapshot = useCallback(async (name: string) => {
    try {
      const snapshots = await api.saveSnapshot(name)
      setState((s) => ({ ...s, snapshots, currentSnapshotName: name }))
    } catch (err) { setError(err) }
  }, [setError])

  const loadSnapshotAction = useCallback(async (name: string) => {
    try {
      if (name === ORIGINAL_SNAPSHOT) {
        const data = await api.resetToOriginal()
        setState((s) => ({
          ...s,
          original: data.original,
          working: data.working,
          recycled: [],
          currentSnapshotName: ORIGINAL_SNAPSHOT,
        }))
      } else {
        const data = await api.loadSnapshot(name)
        setState((s) => ({
          ...s,
          original: data.original,
          working: data.working,
          recycled: [],
          currentSnapshotName: name,
          loaded: true,
        }))
      }
    } catch (err) { setError(err) }
  }, [setError])

  const deleteSnapshotAction = useCallback(async (name: string) => {
    try {
      const snapshots = await api.deleteSnapshot(name)
      setState((s) => ({ ...s, snapshots }))
    } catch (err) { setError(err) }
  }, [setError])

  const restoreAutosave = useCallback(() => {
    setState((s) => {
      if (!s.autosaveAvailable) return s
      const ad = s.autosaveAvailable
      return {
        ...s,
        original: ad.original,
        working: ad.working,
        recycled: ad.recycled,
        currentSnapshotName: ad.snapshotName || null,
        loaded: true,
        autosaveAvailable: null,
      }
    })
  }, [])

  const dismissAutosave = useCallback(async () => {
    localStorage.removeItem('grove-autosave')
    try { await api.deleteAutosave() } catch { /* ignore */ }
    // Clear everything — go back to fresh upload state
    setState((s) => ({
      ...s,
      autosaveAvailable: null,
      original: [],
      working: [],
      recycled: [],
      loaded: false,
      snapshots: [],
      currentSnapshotName: null,
    }))
  }, [])

  const reflow = useCallback(() => {
    setState((s) => ({ ...s, layoutKey: s.layoutKey + 1 }))
  }, [])

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  const toggleEmploymentTypeFilter = useCallback((type: string) => {
    setState((s) => {
      const next = new Set(s.hiddenEmploymentTypes)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return { ...s, hiddenEmploymentTypes: next }
    })
  }, [])

  const showAllEmploymentTypes = useCallback(() => {
    setState((s) => ({ ...s, hiddenEmploymentTypes: new Set() }))
  }, [])

  const hideAllEmploymentTypes = useCallback((types: string[]) => {
    setState((s) => ({ ...s, hiddenEmploymentTypes: new Set(types) }))
  }, [])

  const setHead = useCallback((id: string | null) => {
    setState((s) => ({ ...s, headPersonId: id }))
  }, [])

  // Warn before navigating away with unsaved changes
  useDirtyTracking(state.loaded, state.working)

  const value: OrgContextValue = {
    ...state,
    selectedId,
    setViewMode,
    setDataView,
    setSelectedId,
    toggleSelect,
    clearSelection,
    upload,
    move,
    reparent,
    reorder,
    update,
    add,
    remove,
    restore,
    emptyBin: emptyBinAction,
    setBinOpen,
    confirmMapping: confirmMappingAction,
    cancelMapping,
    reflow,
    pendingMapping: state.pendingMapping,
    saveSnapshot,
    loadSnapshot: loadSnapshotAction,
    deleteSnapshot: deleteSnapshotAction,
    restoreAutosave,
    dismissAutosave,
    toggleEmploymentTypeFilter,
    showAllEmploymentTypes,
    hideAllEmploymentTypes,
    setHead,
    clearError,
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}
