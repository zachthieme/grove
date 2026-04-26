import { useCallback, useMemo, type MutableRefObject } from 'react'
import type { OrgNode, OrgNodeUpdatePayload, Pod, PodUpdatePayload, Settings } from '../api/types'
import { ORIGINAL_SNAPSHOT } from '../constants'
import * as api from '../api/client'
import type { OrgDataState } from './OrgDataContext'
import { applyUpdate, applyMove, applyReorder } from './optimistic'

type SetState = React.Dispatch<React.SetStateAction<OrgDataState>>

interface MutationDeps {
  setState: SetState
  workingRef: MutableRefObject<OrgNode[]>
  podsRef: MutableRefObject<Pod[]>
  handleError: (err: unknown) => void
  setError: (msg: string | null) => void
  captureForUndo: () => void
}

export function useOrgMutations({ setState, workingRef, podsRef, handleError, setError, captureForUndo }: MutationDeps) {
  // Single dispatch helper for all mutations:
  //   1. Optionally capture undo before the call.
  //   2. Apply an optimistic patch synchronously (if provided), snapshotting pre-state from refs.
  //   3. Run the API call.
  //   4. Merge a state slice derived from the response (server truth on success).
  //   5. On failure, revert to pre-mutation snapshot and route error through handleError.
  // Replaces a per-mutation try/catch + setState boilerplate.
  const dispatch = useCallback(
    async <T>(
      call: () => Promise<T>,
      apply: (result: T) => Partial<OrgDataState>,
      opts: {
        undo?: boolean
        optimistic?: (s: OrgDataState) => Partial<OrgDataState>
      } = {},
    ) => {
      if (opts.undo) captureForUndo()
      const snapshot = opts.optimistic
        ? { working: workingRef.current, pods: podsRef.current }
        : null
      if (opts.optimistic) {
        const patch = opts.optimistic
        setState((s) => ({ ...s, ...patch(s) }))
      }
      try {
        const result = await call()
        setState((s) => ({ ...s, ...apply(result) }))
      } catch (err) {
        if (snapshot) {
          setState((s) => ({ ...s, working: snapshot.working, pods: snapshot.pods }))
        }
        handleError(err)
      }
    },
    [captureForUndo, handleError, setState, workingRef, podsRef],
  )

  const move = useCallback(
    (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) =>
      dispatch(
        () => api.moveNode({ personId, newManagerId, newTeam, newPod }, correlationId),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
        {
          undo: true,
          optimistic: (s) => ({ working: applyMove(s.working, personId, newManagerId, newTeam, newPod) }),
        },
      ),
    [dispatch],
  )

  const reparent = useCallback(
    async (personId: string, newManagerId: string, correlationId?: string) => {
      if (!newManagerId) {
        return dispatch(
          () => api.updateNode({ personId, fields: { managerId: '' } }, correlationId),
          (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
          {
            undo: true,
            optimistic: (s) => ({ working: applyUpdate(s.working, personId, { managerId: '' }) }),
          },
        )
      }
      const newManager = workingRef.current.find((p) => p.id === newManagerId)
      if (!newManager) {
        setError('Manager not found (may have been deleted)')
        return
      }
      const newTeam = newManager.team
      return dispatch(
        () => api.moveNode({ personId, newManagerId, newTeam }, correlationId),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
        {
          undo: true,
          optimistic: (s) => ({ working: applyMove(s.working, personId, newManagerId, newTeam) }),
        },
      )
    },
    [dispatch, setError, workingRef],
  )

  const reorder = useCallback(
    (personIds: string[]) =>
      dispatch(
        () => api.reorderPeople(personIds),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
        {
          undo: true,
          optimistic: (s) => ({ working: applyReorder(s.working, personIds) }),
        },
      ),
    [dispatch],
  )

  const update = useCallback(
    (personId: string, fields: OrgNodeUpdatePayload, correlationId?: string) =>
      dispatch(
        () => api.updateNode({ personId, fields }, correlationId),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
        {
          undo: true,
          optimistic: (s) => ({ working: applyUpdate(s.working, personId, fields) }),
        },
      ),
    [dispatch],
  )

  const add = useCallback(
    (person: Omit<OrgNode, 'id'>) =>
      dispatch(
        () => api.addNode(person),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
        { undo: true },
      ),
    [dispatch],
  )

  const addParent = useCallback(
    (childId: string, name: string) =>
      dispatch(
        () => api.addParent({ childId, name }),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
        { undo: true },
      ),
    [dispatch],
  )

  const remove = useCallback(
    (personId: string) =>
      dispatch(
        () => api.deleteNode({ personId }),
        (resp) => ({
          working: resp.working,
          recycled: resp.recycled,
          pods: resp.pods,
          currentSnapshotName: null,
        }),
        { undo: true },
      ),
    [dispatch],
  )

  const restore = useCallback(
    (personId: string) =>
      dispatch(
        () => api.restoreNode(personId),
        (resp) => ({
          working: resp.working,
          recycled: resp.recycled,
          pods: resp.pods,
          currentSnapshotName: null,
        }),
        { undo: true },
      ),
    [dispatch],
  )

  const emptyBin = useCallback(
    () =>
      dispatch(
        () => api.emptyBin(),
        (resp) => ({ recycled: resp.recycled, currentSnapshotName: null }),
        { undo: true },
      ),
    [dispatch],
  )

  const saveSnapshot = useCallback(
    (name: string) =>
      dispatch(
        () => api.saveSnapshot(name),
        (snapshots) => ({ snapshots, currentSnapshotName: name }),
      ),
    [dispatch],
  )

  const loadSnapshot = useCallback(
    (name: string) => {
      if (name === ORIGINAL_SNAPSHOT) {
        return dispatch(
          () => api.resetToOriginal(),
          (data) => ({
            original: data.original,
            working: data.working,
            recycled: [],
            pods: data.pods ?? [],
            settings: data.settings ?? { disciplineOrder: [] },
            currentSnapshotName: ORIGINAL_SNAPSHOT,
          }),
        )
      }
      return dispatch(
        () => api.loadSnapshot(name),
        (data) => ({
          original: data.original,
          working: data.working,
          recycled: [],
          pods: data.pods ?? [],
          settings: data.settings ?? { disciplineOrder: [] },
          currentSnapshotName: name,
          loaded: true,
        }),
      )
    },
    [dispatch],
  )

  const deleteSnapshot = useCallback(
    (name: string) =>
      dispatch(
        () => api.deleteSnapshot(name),
        (snapshots) => ({ snapshots }),
      ),
    [dispatch],
  )

  const updatePod = useCallback(
    (podId: string, fields: PodUpdatePayload) =>
      dispatch(
        () => api.updatePod(podId, fields),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
      ),
    [dispatch],
  )

  const createPod = useCallback(
    (managerId: string, name: string, team: string) =>
      dispatch(
        () => api.createPod(managerId, name, team),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
      ),
    [dispatch],
  )

  const updateSettings = useCallback(
    (newSettings: Settings) =>
      dispatch(
        () => api.updateSettings(newSettings),
        (settings) => ({ settings }),
      ),
    [dispatch],
  )

  return useMemo(() => ({
    move, reparent, reorder, update, add, addParent, remove, restore, emptyBin,
    saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings,
  }), [
    move, reparent, reorder, update, add, addParent, remove, restore, emptyBin,
    saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings,
  ])
}
