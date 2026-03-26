import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { SelectionContextValue } from './orgTypes'

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

  const selectedId = useMemo(() => {
    return selectedIds.size === 1 ? [...selectedIds][0] : null
  }, [selectedIds])

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set())
  }, [])

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedPodId(null)
    setSelectedIds((prev) => {
      if (multi) {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      }
      // Single select: if already selected alone, deselect; otherwise select just this one
      if (prev.size === 1 && prev.has(id)) {
        return new Set()
      }
      return new Set([id])
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const selectPod = useCallback((id: string | null) => {
    setSelectedPodId(id)
    setSelectedIds(new Set())
  }, [])

  const batchSelect = useCallback((ids: Set<string>) => {
    setSelectedPodId(null)
    setSelectedIds(ids)
  }, [])

  const value: SelectionContextValue = useMemo(() => ({
    selectedIds,
    selectedId,
    selectedPodId,
    setSelectedId,
    toggleSelect,
    clearSelection,
    selectPod,
    batchSelect,
  }), [selectedIds, selectedId, selectedPodId, setSelectedId, toggleSelect, clearSelection, selectPod, batchSelect])

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}
