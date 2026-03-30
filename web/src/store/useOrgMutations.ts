import { useCallback, useMemo, type MutableRefObject } from 'react'
import type { Person, PersonUpdatePayload, PodUpdatePayload, Settings } from '../api/types'
import { ORIGINAL_SNAPSHOT } from '../constants'
import * as api from '../api/client'
import type { OrgDataState } from './OrgDataContext'

type SetState = React.Dispatch<React.SetStateAction<OrgDataState>>

interface MutationDeps {
  setState: SetState
  workingRef: MutableRefObject<Person[]>
  handleError: (err: unknown) => void
  setError: (msg: string | null) => void
  captureForUndo: () => void
}

export function useOrgMutations({ setState, workingRef, handleError, setError, captureForUndo }: MutationDeps) {
  const move = useCallback(async (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) => {
    captureForUndo()
    try {
      const resp = await api.movePerson({ personId, newManagerId, newTeam, newPod }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const reparent = useCallback(async (personId: string, newManagerId: string, correlationId?: string) => {
    captureForUndo()
    if (!newManagerId) {
      try {
        const resp = await api.updatePerson({ personId, fields: { managerId: '' } }, correlationId)
        setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
      } catch (err) { handleError(err) }
      return
    }
    const newManager = workingRef.current.find((p) => p.id === newManagerId)
    if (!newManager) {
      setError('Manager not found (may have been deleted)')
      return
    }
    try {
      const resp = await api.movePerson({ personId, newManagerId, newTeam: newManager.team }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setError, setState, workingRef])

  const reorder = useCallback(async (personIds: string[]) => {
    captureForUndo()
    try {
      const resp = await api.reorderPeople(personIds)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const update = useCallback(async (personId: string, fields: PersonUpdatePayload, correlationId?: string) => {
    captureForUndo()
    try {
      const resp = await api.updatePerson({ personId, fields }, correlationId)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const add = useCallback(async (person: Omit<Person, 'id'>) => {
    captureForUndo()
    try {
      const resp = await api.addPerson(person)
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const addParent = useCallback(async (childId: string, name: string) => {
    captureForUndo()
    try {
      const resp = await api.addParent({ childId, name })
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const remove = useCallback(async (personId: string) => {
    captureForUndo()
    try {
      const resp = await api.deletePerson({ personId })
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const restore = useCallback(async (personId: string) => {
    captureForUndo()
    try {
      const resp = await api.restorePerson(personId)
      setState((s) => ({ ...s, working: resp.working, recycled: resp.recycled, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const emptyBin = useCallback(async () => {
    captureForUndo()
    try {
      const resp = await api.emptyBin()
      setState((s) => ({ ...s, recycled: resp.recycled, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [captureForUndo, handleError, setState])

  const saveSnapshot = useCallback(async (name: string) => {
    try {
      const snapshots = await api.saveSnapshot(name)
      setState((s) => ({ ...s, snapshots, currentSnapshotName: name }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

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
  }, [handleError, setState])

  const deleteSnapshot = useCallback(async (name: string) => {
    try {
      const snapshots = await api.deleteSnapshot(name)
      setState((s) => ({ ...s, snapshots }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const updatePod = useCallback(async (podId: string, fields: PodUpdatePayload) => {
    try {
      const resp = await api.updatePod(podId, fields)
      setState(s => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const createPod = useCallback(async (managerId: string, name: string, team: string) => {
    try {
      const resp = await api.createPod(managerId, name, team)
      setState(s => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  const updateSettings = useCallback(async (newSettings: Settings) => {
    try {
      const result = await api.updateSettings(newSettings)
      setState(s => ({ ...s, settings: result }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])

  return useMemo(() => ({
    move, reparent, reorder, update, add, addParent, remove, restore, emptyBin,
    saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings,
  }), [
    move, reparent, reorder, update, add, addParent, remove, restore, emptyBin,
    saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings,
  ])
}
