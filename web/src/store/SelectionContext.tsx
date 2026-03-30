import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { SelectionContextValue } from './orgTypes'
import { useInteractionState } from './useInteractionState'
import type { Person } from '../api/types'

export const SelectionContext = createContext<SelectionContextValue | null>(null)

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext)
  if (!ctx) {
    throw new Error('useSelection must be used within a SelectionProvider')
  }
  return ctx
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null)
  const interaction = useInteractionState()

  const selectedId = useMemo(() => {
    return selectedIds.size === 1 ? [...selectedIds][0] : null
  }, [selectedIds])

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set())
    if (id) {
      interaction.enterSelected()
    } else {
      interaction.exitToIdle()
    }
  }, [interaction])

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedPodId(null)
    setSelectedIds((prev) => {
      if (multi) {
        if (interaction.mode === 'editing') {
          interaction.commitEdits()
        }
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        if (next.size === 0) {
          interaction.exitToIdle()
        } else {
          interaction.enterSelected()
        }
        return next
      }
      if (prev.size === 1 && prev.has(id)) {
        return prev // no-op
      }
      // If was editing, commit before switching
      if (interaction.mode === 'editing') {
        interaction.commitEdits()
      }
      interaction.enterSelected()
      return new Set([id])
    })
  }, [interaction])

  const clearSelection = useCallback(() => {
    if (interaction.mode === 'editing') {
      interaction.commitEdits()
    }
    setSelectedIds(new Set())
    interaction.exitToIdle()
  }, [interaction])

  const selectPod = useCallback((id: string | null) => {
    if (interaction.mode === 'editing') {
      interaction.commitEdits()
    }
    setSelectedPodId(id)
    setSelectedIds(new Set())
    if (id) {
      interaction.enterSelected()
    } else {
      interaction.exitToIdle()
    }
  }, [interaction])

  const batchSelect = useCallback((ids: Set<string>) => {
    if (interaction.mode === 'editing') {
      interaction.commitEdits()
    }
    setSelectedPodId(null)
    setSelectedIds(ids)
    if (ids.size > 0) {
      interaction.enterSelected()
    } else {
      interaction.exitToIdle()
    }
  }, [interaction])

  const enterEditing = useCallback((person: Person) => {
    interaction.enterEditing(person)
  }, [interaction])

  const value: SelectionContextValue = useMemo(() => ({
    selectedIds,
    selectedId,
    selectedPodId,
    interactionMode: interaction.mode,
    editBuffer: interaction.editBuffer,
    editingPersonId: interaction.editingPersonId,
    setSelectedId,
    toggleSelect,
    clearSelection,
    selectPod,
    batchSelect,
    enterEditing,
    commitEdits: interaction.commitEdits,
    revertEdits: interaction.revertEdits,
    updateBuffer: interaction.updateBuffer,
  }), [selectedIds, selectedId, selectedPodId, interaction.mode, interaction.editBuffer, interaction.editingPersonId, setSelectedId, toggleSelect, clearSelection, selectPod, batchSelect, enterEditing, interaction.commitEdits, interaction.revertEdits, interaction.updateBuffer])

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}
