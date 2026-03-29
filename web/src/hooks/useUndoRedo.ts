import { useState, useCallback } from 'react'
import type { Person, Pod } from '../api/types'

export interface UndoRedoState {
  working: Person[]
  pods: Pod[]
}

const MAX_HISTORY = 50

export function useUndoRedo() {
  const [undoStack, setUndoStack] = useState<UndoRedoState[]>([])
  const [redoStack, setRedoStack] = useState<UndoRedoState[]>([])

  const pushUndo = useCallback((state: UndoRedoState) => {
    setUndoStack(prev => [...prev.slice(-(MAX_HISTORY - 1)), state])
    setRedoStack([]) // clear redo on new action
  }, [])

  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  return { undoStack, redoStack, pushUndo, canUndo, canRedo, setUndoStack, setRedoStack }
}
