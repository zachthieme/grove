import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { OrgDataProvider, OrgDataContext, useOrgData as useOrgDataDirect } from './OrgDataContext'
import { UIProvider, UIContext, useUI as useUIDirect } from './UIContext'
import { SelectionProvider, SelectionContext, useSelection as useSelectionDirect } from './SelectionContext'
import type { OrgContextValue, OrgDataContextValue, UIContextValue, SelectionContextValue } from './orgTypes'

const OrgOverrideContext = createContext<OrgContextValue | null>(null)

/** Test-only provider: bypasses real sub-contexts, supplies OrgContextValue directly. */
export function OrgOverrideProvider({ value, children }: { value: OrgContextValue; children: ReactNode }) {
  return <OrgOverrideContext.Provider value={value}>{children}</OrgOverrideContext.Provider>
}

/** Prunes selectedIds that no longer exist in working (e.g. after deletion). */
function SelectionPruner() {
  const { working } = useOrgDataDirect()
  const { selectedIds, batchSelect, clearSelection } = useSelectionDirect()
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  useEffect(() => {
    const current = selectedIdsRef.current
    if (current.size === 0) return
    const workingIds = new Set(working.map(p => p.id))
    let needsPrune = false
    for (const id of current) {
      if (!workingIds.has(id)) { needsPrune = true; break }
    }
    if (!needsPrune) return
    const pruned = new Set([...current].filter(id => workingIds.has(id)))
    if (pruned.size === 0) {
      clearSelection()
    } else {
      batchSelect(pruned)
    }
  }, [working, batchSelect, clearSelection])

  return null
}

export function OrgProvider({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <SelectionProvider>
        <OrgDataProvider>
          <SelectionPruner />
          {children}
        </OrgDataProvider>
      </SelectionProvider>
    </UIProvider>
  )
}

/**
 * Granular hook: OrgData state and actions.
 * Falls back to OrgOverrideContext (test provider) when no OrgDataProvider is present.
 */
export function useOrgData(): OrgDataContextValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(OrgDataContext)
  if (real) return real
  if (override) return override as unknown as OrgDataContextValue
  throw new Error('useOrgData must be used within an OrgDataProvider or OrgOverrideProvider')
}

/**
 * Granular hook: UI state and actions.
 * Falls back to OrgOverrideContext (test provider) when no UIProvider is present.
 */
export function useUI(): UIContextValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(UIContext)
  if (real) return real
  if (override) return override as unknown as UIContextValue
  throw new Error('useUI must be used within a UIProvider or OrgOverrideProvider')
}

/**
 * Granular hook: Selection state and actions.
 * Falls back to OrgOverrideContext (test provider) when no SelectionProvider is present.
 */
export function useSelection(): SelectionContextValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(SelectionContext)
  if (real) return real
  if (override) return override as unknown as SelectionContextValue
  throw new Error('useSelection must be used within a SelectionProvider or OrgOverrideProvider')
}

/**
 * @deprecated Use granular hooks instead: useOrgData(), useUI(), useSelection().
 * This mega-hook causes unnecessary re-renders — every property change triggers
 * all consumers. Only use in components that genuinely need all three contexts
 * (App.tsx, RecycleBinDrawer).
 */
export function useOrg(): OrgContextValue {
  const override = useContext(OrgOverrideContext)
  if (override) return override

  const data = useOrgDataDirect()
  const ui = useUIDirect()
  const selection = useSelectionDirect()

  // Cross-context concern: opening the bin clears selection
  const setBinOpen = useCallback((open: boolean) => {
    ui.setBinOpen(open)
    if (open) {
      selection.clearSelection()
    }
  }, [ui, selection])

  return useMemo<OrgContextValue>(() => ({
    // OrgData state
    original: data.original,
    working: data.working,
    recycled: data.recycled,
    pods: data.pods,
    originalPods: data.originalPods,
    settings: data.settings,
    loaded: data.loaded,
    pendingMapping: data.pendingMapping,
    snapshots: data.snapshots,
    currentSnapshotName: data.currentSnapshotName,
    autosaveAvailable: data.autosaveAvailable,

    // UI state
    viewMode: ui.viewMode,
    dataView: ui.dataView,
    binOpen: ui.binOpen,
    hiddenEmploymentTypes: ui.hiddenEmploymentTypes,
    headPersonId: ui.headPersonId,
    layoutKey: ui.layoutKey,
    error: ui.error,
    showPrivate: ui.showPrivate,

    // Selection state
    selectedIds: selection.selectedIds,
    selectedId: selection.selectedId,
    selectedPodId: selection.selectedPodId,

    // OrgData actions
    upload: data.upload,
    move: data.move,
    reparent: data.reparent,
    reorder: data.reorder,
    update: data.update,
    add: data.add,
    remove: data.remove,
    restore: data.restore,
    emptyBin: data.emptyBin,
    confirmMapping: data.confirmMapping,
    cancelMapping: data.cancelMapping,
    saveSnapshot: data.saveSnapshot,
    loadSnapshot: data.loadSnapshot,
    deleteSnapshot: data.deleteSnapshot,
    restoreAutosave: data.restoreAutosave,
    dismissAutosave: data.dismissAutosave,
    updatePod: data.updatePod,
    createPod: data.createPod,
    updateSettings: data.updateSettings,

    // UI actions
    setViewMode: ui.setViewMode,
    setDataView: ui.setDataView,
    setBinOpen,
    toggleEmploymentTypeFilter: ui.toggleEmploymentTypeFilter,
    showAllEmploymentTypes: ui.showAllEmploymentTypes,
    hideAllEmploymentTypes: ui.hideAllEmploymentTypes,
    setHead: ui.setHead,
    reflow: ui.reflow,
    clearError: ui.clearError,
    setShowPrivate: ui.setShowPrivate,

    // Selection actions
    setSelectedId: selection.setSelectedId,
    toggleSelect: selection.toggleSelect,
    clearSelection: selection.clearSelection,
    selectPod: selection.selectPod,
    batchSelect: selection.batchSelect,
  }), [data, ui, selection, setBinOpen])
}
