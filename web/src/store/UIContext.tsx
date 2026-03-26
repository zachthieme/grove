import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { UIContextValue, ViewMode, DataView } from './orgTypes'

export const UIContext = createContext<UIContextValue | null>(null)

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return ctx
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('detail')
  const [dataView, setDataView] = useState<DataView>('working')
  const [binOpen, setBinOpen] = useState(false)
  const [hiddenEmploymentTypes, setHiddenEmploymentTypes] = useState<Set<string>>(new Set())
  const [headPersonId, setHeadPersonId] = useState<string | null>(null)
  const [layoutKey, setLayoutKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const reflow = useCallback(() => {
    setLayoutKey((k) => k + 1)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const toggleEmploymentTypeFilter = useCallback((type: string) => {
    setHiddenEmploymentTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const showAllEmploymentTypes = useCallback(() => {
    setHiddenEmploymentTypes(new Set())
  }, [])

  const hideAllEmploymentTypes = useCallback((types: string[]) => {
    setHiddenEmploymentTypes(new Set(types))
  }, [])

  const setHead = useCallback((id: string | null) => {
    setHeadPersonId(id)
  }, [])

  const value: UIContextValue = useMemo(() => ({
    viewMode,
    dataView,
    binOpen,
    hiddenEmploymentTypes,
    headPersonId,
    layoutKey,
    error,
    setViewMode,
    setDataView,
    setBinOpen,
    toggleEmploymentTypeFilter,
    showAllEmploymentTypes,
    hideAllEmploymentTypes,
    setHead,
    reflow,
    setError,
    clearError,
  }), [
    viewMode, dataView, binOpen, hiddenEmploymentTypes, headPersonId, layoutKey,
    error, toggleEmploymentTypeFilter, showAllEmploymentTypes,
    hideAllEmploymentTypes, setHead, reflow, clearError,
  ])

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}
