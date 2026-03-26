import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { type Person, type Pod, type AutosaveData, type MappedColumn, type SnapshotInfo, type Settings } from '../api/types'
import { ORIGINAL_SNAPSHOT } from '../constants'
import * as api from '../api/client'
import type { OrgDataContextValue } from './orgTypes'
import { useUI } from './UIContext'
import { useDirtyTracking } from './useDirtyTracking'

interface OrgDataState {
  original: Person[]
  working: Person[]
  recycled: Person[]
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

const OrgDataContext = createContext<OrgDataContextValue | null>(null)

export function useOrgData(): OrgDataContextValue {
  const ctx = useContext(OrgDataContext)
  if (!ctx) {
    throw new Error('useOrgData must be used within an OrgDataProvider')
  }
  return ctx
}

export function OrgDataProvider({ children }: { children: ReactNode }) {
  const { setError } = useUI()

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

  // Ref to access latest state in callbacks without re-creating them
  const stateRef = useRef(state)
  stateRef.current = state

  // On mount: check for autosave first, then fall back to loading org data
  useEffect(() => {
    async function init() {
      // Check localStorage first
      let localRaw = localStorage.getItem('grove-autosave')
      if (localRaw) {
        try {
          const data = JSON.parse(localRaw) as AutosaveData
          setState((s) => ({ ...s, autosaveAvailable: data }))
        } catch {
          // Corrupt data — clear it so the app doesn't get stuck
          localStorage.removeItem('grove-autosave')
          localRaw = null
        }
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
            pods: data.pods ?? [],
            settings: data.settings ?? { disciplineOrder: [] },
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
      setState((s) => ({
        ...s,
        original: resp.orgData!.original,
        working: resp.orgData!.working,
        recycled: [],
        pods: resp.orgData!.pods ?? [],
        originalPods: resp.orgData!.pods ?? [],
        settings: resp.orgData!.settings ?? { disciplineOrder: [] },
        loaded: true,
        pendingMapping: null,
        snapshots: resp.snapshots ?? [],
      }))
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
  }, [setError])

  const confirmMapping = useCallback(async (mapping: Record<string, string>) => {
    try {
      const data = await api.confirmMapping(mapping)
      const snapshots = await api.listSnapshots()
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
        snapshots,
      }))
      if (data.persistenceWarning) {
        setError(`Warning: ${data.persistenceWarning}`)
      }
    } catch (err) { handleError(err) }
  }, [handleError, setError])

  const cancelMapping = useCallback(() => {
    setState((s) => ({ ...s, pendingMapping: null }))
  }, [])

  const move = useCallback(async (personId: string, newManagerId: string, newTeam: string, correlationId?: string) => {
    try {
      const resp = await api.movePerson({ personId, newManagerId, newTeam }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const reparent = useCallback(async (personId: string, newManagerId: string, correlationId?: string) => {
    if (!newManagerId) {
      // Clearing manager — use update, not move
      try {
        const resp = await api.updatePerson({ personId, fields: { managerId: '' } }, correlationId)
        setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
      } catch (err) { handleError(err) }
      return
    }
    const currentWorking = stateRef.current.working
    const newManager = currentWorking.find((p) => p.id === newManagerId)
    if (!newManager) {
      setError('Manager not found (may have been deleted)')
      return
    }
    try {
      const resp = await api.movePerson({ personId, newManagerId, newTeam: newManager.team }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setError])

  const reorder = useCallback(async (personIds: string[]) => {
    try {
      const resp = await api.reorderPeople(personIds)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const update = useCallback(async (personId: string, fields: Record<string, string>, correlationId?: string) => {
    try {
      const resp = await api.updatePerson({ personId, fields }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const add = useCallback(async (person: Omit<Person, 'id'>) => {
    try {
      const resp = await api.addPerson(person)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const remove = useCallback(async (personId: string) => {
    try {
      const resp = await api.deletePerson({ personId })
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const restore = useCallback(async (personId: string) => {
    try {
      const resp = await api.restorePerson(personId)
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const emptyBin = useCallback(async () => {
    try {
      const resp = await api.emptyBin()
      setState((s) => ({ ...s, recycled: resp.recycled, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const saveSnapshot = useCallback(async (name: string) => {
    try {
      const snapshots = await api.saveSnapshot(name)
      setState((s) => ({ ...s, snapshots, currentSnapshotName: name }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const loadSnapshot = useCallback(async (name: string) => {
    try {
      if (name === ORIGINAL_SNAPSHOT) {
        const data = await api.resetToOriginal()
        setState((s) => ({
          ...s,
          original: data.original,
          working: data.working,
          recycled: [],
          pods: data.pods ?? [],
          settings: data.settings ?? { disciplineOrder: [] },
          currentSnapshotName: ORIGINAL_SNAPSHOT,
        }))
      } else {
        const data = await api.loadSnapshot(name)
        setState((s) => ({
          ...s,
          original: data.original,
          working: data.working,
          recycled: [],
          pods: data.pods ?? [],
          settings: data.settings ?? { disciplineOrder: [] },
          currentSnapshotName: name,
          loaded: true,
        }))
      }
    } catch (err) { handleError(err) }
  }, [handleError])

  const deleteSnapshot = useCallback(async (name: string) => {
    try {
      const snapshots = await api.deleteSnapshot(name)
      setState((s) => ({ ...s, snapshots }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const restoreAutosave = useCallback(() => {
    const ad = stateRef.current.autosaveAvailable
    if (!ad) return
    // Sync restored state to backend so mutations work
    api.restoreState(ad).catch(() => {
      // If backend sync fails, data is still shown but mutations may fail
      console.warn('Failed to sync restored state to backend')
    })
    setState((s) => ({
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
    }))
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
      pods: [],
      originalPods: [],
      settings: { disciplineOrder: [] },
      loaded: false,
      snapshots: [],
      currentSnapshotName: null,
    }))
  }, [])

  const updatePod = useCallback(async (podId: string, fields: Record<string, string>) => {
    try {
      const resp = await api.updatePod(podId, fields)
      setState(s => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const createPod = useCallback(async (managerId: string, name: string, team: string) => {
    try {
      const resp = await api.createPod(managerId, name, team)
      setState(s => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError])

  const updateSettings = useCallback(async (newSettings: Settings) => {
    try {
      const result = await api.updateSettings(newSettings)
      setState(s => ({ ...s, settings: result }))
    } catch (err) { handleError(err) }
  }, [handleError])

  // Warn before navigating away with unsaved changes
  useDirtyTracking(state.loaded, state.working)

  const value: OrgDataContextValue = useMemo(() => ({
    original: state.original,
    working: state.working,
    recycled: state.recycled,
    pods: state.pods,
    originalPods: state.originalPods,
    settings: state.settings,
    loaded: state.loaded,
    pendingMapping: state.pendingMapping,
    snapshots: state.snapshots,
    currentSnapshotName: state.currentSnapshotName,
    autosaveAvailable: state.autosaveAvailable,
    upload,
    move,
    reparent,
    reorder,
    update,
    add,
    remove,
    restore,
    emptyBin,
    confirmMapping,
    cancelMapping,
    saveSnapshot,
    loadSnapshot,
    deleteSnapshot,
    restoreAutosave,
    dismissAutosave,
    updatePod,
    createPod,
    updateSettings,
  }), [
    state, upload, move, reparent, reorder, update, add, remove,
    restore, emptyBin, confirmMapping, cancelMapping,
    saveSnapshot, loadSnapshot, deleteSnapshot,
    restoreAutosave, dismissAutosave, updatePod, createPod,
    updateSettings,
  ])

  return <OrgDataContext.Provider value={value}>{children}</OrgDataContext.Provider>
}
