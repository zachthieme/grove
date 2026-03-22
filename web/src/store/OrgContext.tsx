import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Person, MappedColumn, SnapshotInfo, AutosaveData } from '../api/types'
import * as api from '../api/client'

type ViewMode = 'detail' | 'manager'
type DataView = 'original' | 'working' | 'diff'

interface OrgState {
  original: Person[]
  working: Person[]
  recycled: Person[]
  loaded: boolean
  viewMode: ViewMode
  dataView: DataView
  selectedIds: Set<string>
  binOpen: boolean
  layoutKey: number
  pendingMapping: {
    headers: string[]
    mapping: Record<string, MappedColumn>
    preview: string[][]
  } | null
  snapshots: SnapshotInfo[]
  currentSnapshotName: string | null
  autosaveAvailable: AutosaveData | null
  error: string | null
}

interface OrgActions {
  setViewMode: (mode: ViewMode) => void
  setDataView: (view: DataView) => void
  /** @deprecated Use toggleSelect / clearSelection instead */
  setSelectedId: (id: string | null) => void
  toggleSelect: (id: string, multi: boolean) => void
  clearSelection: () => void
  upload: (file: File) => Promise<void>
  move: (personId: string, newManagerId: string, newTeam: string) => Promise<void>
  reorder: (personIds: string[]) => Promise<void>
  update: (personId: string, fields: Record<string, string>) => Promise<void>
  add: (person: Omit<Person, 'id'>) => Promise<void>
  remove: (personId: string) => Promise<void>
  restore: (personId: string) => Promise<void>
  emptyBin: () => Promise<void>
  setBinOpen: (open: boolean) => void
  confirmMapping: (mapping: Record<string, string>) => Promise<void>
  cancelMapping: () => void
  reflow: () => void
  pendingMapping: OrgState['pendingMapping']
  saveSnapshot: (name: string) => Promise<void>
  loadSnapshot: (name: string) => Promise<void>
  deleteSnapshot: (name: string) => Promise<void>
  restoreAutosave: () => void
  dismissAutosave: () => Promise<void>
  clearError: () => void
}

type OrgContextValue = OrgState & OrgActions & {
  /** Backward compat: returns the single selected ID when exactly one is selected, null otherwise */
  selectedId: string | null
}

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
    binOpen: false,
    layoutKey: 0,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
    error: null,
  })

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
    let resp: Awaited<ReturnType<typeof api.uploadFile>>
    try {
      resp = await api.uploadFile(file)
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
    setState((s) => ({
      ...s,
      original: data.original,
      working: data.working,
      recycled: [],
      loaded: true,
      pendingMapping: null,
    }))
  }, [])

  const cancelMapping = useCallback(() => {
    setState((s) => ({ ...s, pendingMapping: null }))
  }, [])

  const move = useCallback(async (personId: string, newManagerId: string, newTeam: string) => {
    const working = await api.movePerson({ personId, newManagerId, newTeam })
    setState((s) => ({ ...s, working, currentSnapshotName: null }))
  }, [])

  const reorder = useCallback(async (personIds: string[]) => {
    const working = await api.reorderPeople(personIds)
    setState((s) => ({ ...s, working, currentSnapshotName: null }))
  }, [])

  const update = useCallback(async (personId: string, fields: Record<string, string>) => {
    const working = await api.updatePerson({ personId, fields })
    setState((s) => ({ ...s, working, currentSnapshotName: null }))
  }, [])

  const add = useCallback(async (person: Omit<Person, 'id'>) => {
    const working = await api.addPerson(person)
    setState((s) => ({ ...s, working, currentSnapshotName: null }))
  }, [])

  const remove = useCallback(async (personId: string) => {
    const resp = await api.deletePerson({ personId })
    setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, currentSnapshotName: null }))
  }, [])

  const restore = useCallback(async (personId: string) => {
    const resp = await api.restorePerson(personId)
    setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, currentSnapshotName: null }))
  }, [])

  const emptyBinAction = useCallback(async () => {
    const resp = await api.emptyBin()
    setState((s) => ({ ...s, recycled: resp.recycled, currentSnapshotName: null }))
  }, [])

  const setBinOpen = useCallback((binOpen: boolean) => {
    setState((s) => ({ ...s, binOpen, selectedIds: binOpen ? new Set() : s.selectedIds }))
  }, [])

  const saveSnapshot = useCallback(async (name: string) => {
    const snapshots = await api.saveSnapshot(name)
    setState((s) => ({ ...s, snapshots, currentSnapshotName: name }))
  }, [])

  const loadSnapshotAction = useCallback(async (name: string) => {
    if (name === '__original__') {
      const data = await api.resetToOriginal()
      setState((s) => ({
        ...s,
        original: data.original,
        working: data.working,
        recycled: [],
        currentSnapshotName: '__original__',
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
  }, [])

  const deleteSnapshotAction = useCallback(async (name: string) => {
    const snapshots = await api.deleteSnapshot(name)
    setState((s) => ({ ...s, snapshots }))
  }, [])

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

  // Warn before leaving when there are unsaved changes
  useEffect(() => {
    const hasChanges = state.loaded && state.working.length > 0 && (
      state.working.length !== state.original.length ||
      JSON.stringify(state.working.map(p => [p.id, p.name, p.role, p.discipline, p.team, p.managerId, p.status, p.employmentType]))
      !== JSON.stringify(state.original.map(p => [p.id, p.name, p.role, p.discipline, p.team, p.managerId, p.status, p.employmentType]))
    )
    if (!hasChanges) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [state.loaded, state.working, state.original])

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
    clearError,
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}
