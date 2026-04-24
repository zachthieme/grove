import { useState, useCallback, useMemo, useRef } from 'react'
import type { OrgNode } from '../api/types'
import { type NodeFormValues, nodeToForm, computeDirtyFields } from '../utils/nodeFormUtils'

export type InteractionMode = 'idle' | 'selected' | 'editing'

/** @deprecated Use NodeFormValues from utils/nodeFormUtils instead */
export type EditBuffer = NodeFormValues

export function useInteractionState() {
  const [mode, setMode] = useState<InteractionMode>('idle')
  const [editBuffer, setEditBuffer] = useState<NodeFormValues | null>(null)
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const originalRef = useRef<NodeFormValues | null>(null)

  const enterSelected = useCallback(() => {
    setMode('selected')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null
  }, [])

  const enterEditing = useCallback((person: OrgNode) => {
    const buf = nodeToForm(person)
    setMode('editing')
    setEditBuffer(buf)
    setEditingPersonId(person.id)
    originalRef.current = { ...buf }
  }, [])

  const updateBuffer = useCallback((field: keyof NodeFormValues, value: string | boolean) => {
    setEditBuffer(prev => prev ? { ...prev, [field]: value } : prev)
  }, [])

  const commitEdits = useCallback((): Record<string, string | boolean | number> | null => {
    const orig = originalRef.current
    const buf = editBuffer
    if (!orig || !buf) {
      setMode('selected')
      setEditBuffer(null)
      setEditingPersonId(null)
      originalRef.current = null
      return null
    }

    const dirty = computeDirtyFields(orig, buf)

    setMode('selected')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null

    return dirty
  }, [editBuffer])

  const revertEdits = useCallback(() => {
    setMode('selected')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null
  }, [])

  const exitToIdle = useCallback(() => {
    setMode('idle')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null
  }, [])

  return useMemo(() => ({
    mode,
    editBuffer,
    editingPersonId,
    enterSelected,
    enterEditing,
    updateBuffer,
    commitEdits,
    revertEdits,
    exitToIdle,
  }), [mode, editBuffer, editingPersonId, enterSelected, enterEditing, updateBuffer, commitEdits, revertEdits, exitToIdle])
}
