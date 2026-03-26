import { useCallback, useMemo, type ReactNode } from 'react'
import { OrgDataProvider, useOrgData } from './OrgDataContext'
import { UIProvider, useUI } from './UIContext'
import { SelectionProvider, useSelection } from './SelectionContext'
import type { OrgContextValue } from './orgTypes'

export function OrgProvider({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <SelectionProvider>
        <OrgDataProvider>
          {children}
        </OrgDataProvider>
      </SelectionProvider>
    </UIProvider>
  )
}

export function useOrg(): OrgContextValue {
  const data = useOrgData()
  const ui = useUI()
  const selection = useSelection()

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

    // Selection actions
    setSelectedId: selection.setSelectedId,
    toggleSelect: selection.toggleSelect,
    clearSelection: selection.clearSelection,
    selectPod: selection.selectPod,
    batchSelect: selection.batchSelect,
  }), [data, ui, selection, setBinOpen])
}
