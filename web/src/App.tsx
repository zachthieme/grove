import { useRef, useState, useCallback, useEffect } from 'react'
import styles from './App.module.css'
import { OrgProvider, useOrgData, useUI, useSelection } from './store/OrgContext'
import { ViewDataProvider, useActions } from './store/ViewDataContext'
import { useExport } from './hooks/useExport'
import { useSnapshotExport } from './hooks/useSnapshotExport'
import { useAutosave } from './hooks/useAutosave'
import { useUnifiedEscape } from './hooks/useUnifiedEscape'
import { useDeepLink } from './hooks/useDeepLink'
import { useVimNav } from './hooks/useVimNav'
import UploadPrompt from './components/UploadPrompt'
import Toolbar from './components/Toolbar'
import DetailSidebar from './components/DetailSidebar'
import RecycleBinDrawer from './components/RecycleBinDrawer'
import UnparentedBar from './components/UnparentedBar'
import AutosaveBanner from './components/AutosaveBanner'
import Breadcrumbs from './components/Breadcrumbs'
import ColumnMappingModal from './components/ColumnMappingModal'
import ManagerInfoPopover from './components/ManagerInfoPopover'
import LogPanel from './components/LogPanel'
import { getConfig, setLoggingEnabled as setClientLogging } from './api/client'
import ErrorBoundary from './components/ErrorBoundary'
import ColumnView from './views/ColumnView'
import ManagerView from './views/ManagerView'
import TableView from './views/TableView'

function AppContent() {
  const { loaded, original, working, recycled, pods, originalPods, settings, currentSnapshotName, pendingMapping, confirmMapping, cancelMapping, snapshots, saveSnapshot, loadSnapshot, deleteSnapshot, undo, redo, canUndo, canRedo, remove, add, reparent } = useOrgData()
  const { viewMode, layoutKey, error, clearError, headPersonId, setHead, showAllEmploymentTypes, setViewMode } = useUI()
  const { selectedIds, selectedPodId, clearSelection, setSelectedId, interactionMode, enterEditing, revertEdits } = useSelection()
  const { infoPopoverId, clearInfoPopover, handleAddParent } = useActions()

  useDeepLink({
    viewMode,
    selectedId: selectedIds.size === 1 ? [...selectedIds][0] : null,
    headPersonId,
    setViewMode,
    setSelectedId,
    setHead,
  })

  const mainRef = useRef<HTMLElement>(null)
  const { exportPng, exportSvg, exporting, exportError, clearExportError } = useExport(mainRef)
  const { exportAllSnapshots, exporting: snapshotExporting, progress: snapshotProgress, suppressAutosaveRef } = useSnapshotExport({
    snapshots,
    mainRef,
    loadSnapshot,
    saveSnapshot,
    deleteSnapshot,
    showAllEmploymentTypes,
    setHead,
  })
  const { serverSaveError } = useAutosave({ original, working, recycled, pods, originalPods, settings, currentSnapshotName, loaded, suppressAutosaveRef })

  const clearHead = useCallback(() => setHead(null), [setHead])

  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null
  const vimAddReport = useCallback((parentId: string) => {
    const parent = working.find(p => p.id === parentId)
    if (!parent) return
    add({ name: 'New Person', role: '', discipline: '', team: parent.team, managerId: parent.id, status: 'Active' as const, additionalTeams: [] })
  }, [working, add])

  const [vimMode, setVimMode] = useState(() => localStorage.getItem('grove-vim-mode') === '1')
  const toggleVimMode = useCallback((on: boolean) => {
    setVimMode(on)
    localStorage.setItem('grove-vim-mode', on ? '1' : '0')
  }, [])

  type ThemePref = 'system' | 'light' | 'dark'
  const [themePref, setThemePref] = useState<ThemePref>(() => (localStorage.getItem('grove-theme') as ThemePref) || 'system')

  useEffect(() => {
    const apply = (pref: ThemePref) => {
      if (pref === 'system') {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', pref)
      }
    }
    apply(themePref)
    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => apply('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [themePref])

  const changeTheme = useCallback((pref: ThemePref) => {
    setThemePref(pref)
    localStorage.setItem('grove-theme', pref)
  }, [])

  const { cutId, cancelCut } = useVimNav({
    working,
    selectedId,
    setSelectedId,
    onDelete: remove,
    onAddReport: vimAddReport,
    onAddParent: handleAddParent,
    onReparent: reparent,
    onSidebarEdit: () => {
      const person = selectedId ? working.find(p => p.id === selectedId) : null
      if (person) enterEditing(person)
    },
    enabled: vimMode && loaded && viewMode !== 'table',
  })

  useUnifiedEscape({
    infoPopoverOpen: !!infoPopoverId,
    onCloseInfoPopover: clearInfoPopover,
    cutActive: !!cutId,
    onCancelCut: cancelCut,
    sidebarEditMode: interactionMode === 'editing',
    onExitSidebarEdit: () => { revertEdits(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur() },
    hasSelection: selectedIds.size > 0,
    onClearSelection: clearSelection,
    hasHead: !!headPersonId,
    onClearHead: clearHead,
    enabled: true,
  })

  const [loggingEnabled, setLoggingEnabled] = useState(false)
  const [logPanelOpen, setLogPanelOpen] = useState(false)

  useEffect(() => {
    getConfig().then((cfg) => {
      setLoggingEnabled(cfg.logging)
      setClientLogging(cfg.logging)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo) undo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (canRedo) redo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [canUndo, canRedo, undo, redo])

  const hasSidebarSelection = selectedIds.size > 0 || !!selectedPodId

  return (
    <div className={styles.app}>
      <Toolbar
        onExportPng={exportPng}
        onExportSvg={exportSvg}
        exporting={exporting || snapshotExporting}
        hasSnapshots={snapshots.length > 0}
        onExportAllSnapshots={exportAllSnapshots}
        loggingEnabled={loggingEnabled}
        onToggleLogs={() => setLogPanelOpen((o) => !o)}
        logPanelOpen={logPanelOpen}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        vimMode={vimMode}
        onToggleVimMode={toggleVimMode}
        themePref={themePref}
        onChangeTheme={changeTheme}
      />
      {cutId && (() => {
        const cutPerson = working.find(p => p.id === cutId)
        return cutPerson ? (
          <div className={styles.warnBanner}>
            <span className={styles.warnText}>Cut: <strong>{cutPerson.name}</strong> — navigate to new manager and press <strong>p</strong> to paste, or <strong>Esc</strong> to cancel</span>
          </div>
        ) : null
      })()}
      {error && (
        <div className={styles.errorBanner} role="alert">
          <span className={styles.errorText}>{error}</span>
          <button onClick={clearError} className={styles.errorClose}>×</button>
        </div>
      )}
      {exportError && (
        <div className={styles.errorBanner} role="alert">
          <span className={styles.errorText}>Export failed: {exportError}</span>
          <button onClick={clearExportError} className={styles.errorClose}>×</button>
        </div>
      )}
      {serverSaveError && (
        <div className={styles.warnBanner} role="alert">
          <span className={styles.warnText}>Server autosave unavailable — data saved locally only</span>
        </div>
      )}
      {viewMode !== 'table' && <UnparentedBar />}
      <Breadcrumbs />
      <AutosaveBanner />
      <div className={styles.body}>
        <main className={styles.main} ref={mainRef} data-tour="main-content" onClick={(e) => { if (e.target === e.currentTarget && selectedIds.size > 0) clearSelection() }}>
          {!loaded ? (
            <UploadPrompt />
          ) : viewMode === 'table' ? (
            <TableView />
          ) : viewMode === 'manager' ? (
            <ManagerView key={layoutKey} />
          ) : viewMode === 'detail' ? (
            <ColumnView key={layoutKey} />
          ) : null}
          {snapshotExporting && (
            <div className={styles.exportOverlay}>
              <div className={styles.exportOverlayText}>
                Exporting snapshot {snapshotProgress.current} of {snapshotProgress.total}...
              </div>
            </div>
          )}
        </main>
        {hasSidebarSelection && (
          <DetailSidebar
            mode={interactionMode === 'editing' ? 'edit' : 'view'}
            onSetMode={(mode) => {
              if (mode === 'edit') {
                const person = working.find(p => p.id === selectedId)
                if (person) enterEditing(person)
              } else {
                revertEdits()
              }
            }}
          />
        )}
        <RecycleBinDrawer />
      </div>
      {infoPopoverId && (
        <ManagerInfoPopover
          personId={infoPopoverId}
          working={working}
          onClose={clearInfoPopover}
        />
      )}
      {pendingMapping && (
        <ColumnMappingModal
          headers={pendingMapping.headers}
          mapping={pendingMapping.mapping}
          preview={pendingMapping.preview}
          onConfirm={confirmMapping}
          onCancel={cancelMapping}
        />
      )}
      {logPanelOpen && <LogPanel onClose={() => setLogPanelOpen(false)} />}
    </div>
  )
}

function AppShell() {
  return (
    <ViewDataProvider>
      <AppContent />
    </ViewDataProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <OrgProvider>
        <AppShell />
      </OrgProvider>
    </ErrorBoundary>
  )
}
