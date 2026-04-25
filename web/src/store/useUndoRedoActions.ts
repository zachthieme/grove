import { useCallback, useRef } from 'react'
import * as api from '../api/client'
import type { OrgDataState } from './OrgDataContext'
import type { UndoRedoState } from '../hooks/useUndoRedo'

interface Args {
  setState: React.Dispatch<React.SetStateAction<OrgDataState>>
  undoStack: UndoRedoState[]
  redoStack: UndoRedoState[]
  setUndoStack: React.Dispatch<React.SetStateAction<UndoRedoState[]>>
  setRedoStack: React.Dispatch<React.SetStateAction<UndoRedoState[]>>
}

/**
 * Undo/redo callbacks that swap working/pods state and serialize backend syncs
 * via a single promise queue — so rapid undo/redo clicks send their restoreState
 * payloads in order and never race a newer click's payload over an older one.
 */
export function useUndoRedoActions({ setState, undoStack, redoStack, setUndoStack, setRedoStack }: Args) {
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve())
  const enqueueRestore = useCallback((label: string, payload: Parameters<typeof api.restoreState>[0]) => {
    syncQueueRef.current = syncQueueRef.current
      .then(() => api.restoreState(payload))
      .catch((err) => { api.reportLog('WARN', `Failed to sync ${label} state to backend`, { error: err }) })
  }, [])

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setState(s => {
      setRedoStack(r => [...r, { working: s.working, pods: s.pods }])
      enqueueRestore('undo', {
        original: s.original,
        working: prev.working,
        recycled: s.recycled,
        pods: prev.pods,
        originalPods: s.originalPods,
        settings: s.settings,
        snapshotName: '',
        timestamp: new Date().toISOString(),
      })
      return { ...s, working: prev.working, pods: prev.pods, currentSnapshotName: null }
    })
  }, [undoStack, setUndoStack, setRedoStack, setState, enqueueRestore])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    setState(s => {
      setUndoStack(u => [...u, { working: s.working, pods: s.pods }])
      enqueueRestore('redo', {
        original: s.original,
        working: next.working,
        recycled: s.recycled,
        pods: next.pods,
        originalPods: s.originalPods,
        settings: s.settings,
        snapshotName: '',
        timestamp: new Date().toISOString(),
      })
      return { ...s, working: next.working, pods: next.pods, currentSnapshotName: null }
    })
  }, [redoStack, setUndoStack, setRedoStack, setState, enqueueRestore])

  return { undo, redo }
}
