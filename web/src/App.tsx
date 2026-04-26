import { useRef, useCallback, useState } from 'react'
import styles from './App.module.css'
import { OrgProvider, useOrgData, useOrgMutations, useUI, useSelection } from './store/OrgContext'
import { ViewDataProvider, useActions } from './store/ViewDataContext'
import { useExport } from './hooks/useExport'
import { useSnapshotExport } from './hooks/useSnapshotExport'
import { useAutosave } from './hooks/useAutosave'
import { useUnifiedEscape } from './hooks/useUnifiedEscape'
import { useDeepLink } from './hooks/useDeepLink'
import { useVimNav } from './hooks/useVimNav'
import { useTheme } from './hooks/useTheme'
import { useVimMode } from './hooks/useVimMode'
import { useUndoRedoKeys } from './hooks/useUndoRedoKeys'
import { useLogging } from './hooks/useLogging'
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
import ErrorBoundary from './components/ErrorBoundary'
import VimCheatSheet from './components/VimCheatSheet'
import ColumnView from './views/ColumnView'
import ManagerView from './views/ManagerView'
import TableView from './views/TableView'

/** Toolbar wrapper — consumes org data context for undo/redo. */
function AppToolbar({ exportPng, exportSvg, exporting, exportAllSnapshots, loggingEnabled, toggleLogs, logPanelOpen, vimMode, toggleVimMode, themePref, changeTheme }: {
  exportPng: () => void
  exportSvg: () => void
  exporting: boolean
  exportAllSnapshots: (format: 'csv' | 'xlsx' | 'png' | 'svg') => void
  loggingEnabled: boolean
  toggleLogs: () => void
  logPanelOpen: boolean
  vimMode: boolean
  toggleVimMode: (on: boolean) => void
  themePref: 'system' | 'light' | 'dark'
  changeTheme: (pref: 'system' | 'light' | 'dark') => void
}) {
  const { snapshots } = useOrgData()
  return (
    <Toolbar
      onExportPng={exportPng}
      onExportSvg={exportSvg}
      exporting={exporting}
      hasSnapshots={snapshots.length > 0}
      onExportAllSnapshots={exportAllSnapshots}
      loggingEnabled={loggingEnabled}
      onToggleLogs={toggleLogs}
      logPanelOpen={logPanelOpen}
      vimMode={vimMode}
      onToggleVimMode={toggleVimMode}
      themePref={themePref}
      onChangeTheme={changeTheme}
    />
  )
}

/** Banners section — consumes contexts directly for error/view state. */
function AppBanners({ cutIds, exportError, clearExportError, serverSaveError }: {
  cutIds: string[]
  exportError: string | null
  clearExportError: () => void
  serverSaveError: boolean
}) {
  const { working } = useOrgData()
  const { viewMode, error, clearError } = useUI()
  return (
    <>
      {cutIds.length > 0 && (() => {
        const cutPeople = cutIds.map(id => working.find(p => p.id === id)).filter(Boolean)
        if (cutPeople.length === 0) return null
        const label = cutPeople.length === 1 ? cutPeople[0]!.name : `${cutPeople.length} people`
        return (
          <div className={styles.warnBanner} role="alert">
            <span className={styles.warnText}>Cut: <strong>{label}</strong> — navigate to new manager and press <strong>p</strong> to paste, or <strong>Esc</strong> to cancel</span>
          </div>
        )
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
    </>
  )
}

/** Main content area — consumes contexts for view/selection state. */
function AppWorkspace({ mainRef, snapshotExporting, snapshotProgress }: {
  mainRef: React.RefObject<HTMLElement | null>
  snapshotExporting: boolean
  snapshotProgress: { current: number; total: number }
}) {
  const { loaded } = useOrgData()
  const { viewMode, layoutKey } = useUI()
  const { selectedIds, clearSelection } = useSelection()

  const hasSidebarSelection = selectedIds.size > 0

  return (
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
        <DetailSidebar />
      )}
      <RecycleBinDrawer />
    </div>
  )
}

/** Modals and popovers — consumes contexts directly. */
function AppOverlays({ logPanelOpen, setLogPanelOpen }: {
  logPanelOpen: boolean
  setLogPanelOpen: (open: boolean) => void
}) {
  const { working, pendingMapping } = useOrgData()
  const { confirmMapping, cancelMapping } = useOrgMutations()
  const { infoPopoverId, clearInfoPopover } = useActions()
  return (
    <>
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
    </>
  )
}

/** Thin layout shell — coordinates cross-cutting hooks, delegates rendering to sub-components. */
function AppContent() {
  const { working, pods, loaded, snapshots } = useOrgData()
  const { remove, move, reparent, canUndo, canRedo, undo, redo, saveSnapshot, loadSnapshot, deleteSnapshot } = useOrgMutations()
  const { viewMode, headPersonId, setHead, showAllEmploymentTypes } = useUI()
  const { selectedIds, clearSelection, batchSelect } = useSelection()
  const { infoPopoverId, clearInfoPopover, handleAddParent, handleAddReport, handleAddProduct, handleAddToTeam } = useActions()

  const { themePref, changeTheme } = useTheme()
  const { vimMode, toggleVimMode } = useVimMode()
  const { loggingEnabled, logPanelOpen, toggleLogs, setLogPanelOpen } = useLogging()
  useUndoRedoKeys({ canUndo, canRedo, undo, redo })
  useDeepLink()

  const mainRef = useRef<HTMLElement>(null)
  const { exportPng, exportSvg, exporting, exportError, clearExportError } = useExport(mainRef)
  const { exportAllSnapshots, exporting: snapshotExporting, progress: snapshotProgress, suppressAutosaveRef } = useSnapshotExport({
    snapshots, mainRef, loadSnapshot, saveSnapshot, deleteSnapshot, showAllEmploymentTypes, setHead,
  })
  const { serverSaveError } = useAutosave(suppressAutosaveRef)

  const clearHead = useCallback(() => setHead(null), [setHead])
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null

  const [cheatSheetOpen, setCheatSheetOpen] = useState(false)
  const showCheatSheet = useCallback(() => setCheatSheetOpen(true), [])
  const hideCheatSheet = useCallback(() => setCheatSheetOpen(false), [])

  const { cutIds, cancelCut } = useVimNav({
    working, pods, selectedId, selectedIds, batchSelect,
    onDelete: remove, onAddReport: handleAddReport, onAddProduct: handleAddProduct, onAddToTeam: handleAddToTeam, onAddParent: handleAddParent, onShowHelp: showCheatSheet, move, reparent,
    enabled: vimMode && loaded && viewMode !== 'table',
  })

  useUnifiedEscape({
    infoPopoverOpen: !!infoPopoverId, onCloseInfoPopover: clearInfoPopover,
    cutActive: cutIds.length > 0, onCancelCut: cancelCut,
    hasSelection: selectedIds.size > 0, onClearSelection: clearSelection,
    hasHead: !!headPersonId, onClearHead: clearHead,
    enabled: true,
  })

  return (
    <div className={styles.app}>
      <AppToolbar
        exportPng={exportPng} exportSvg={exportSvg}
        exporting={exporting || snapshotExporting}
        exportAllSnapshots={exportAllSnapshots}
        loggingEnabled={loggingEnabled} toggleLogs={toggleLogs} logPanelOpen={logPanelOpen}
        vimMode={vimMode} toggleVimMode={toggleVimMode}
        themePref={themePref} changeTheme={changeTheme}
      />
      <AppBanners cutIds={cutIds} exportError={exportError} clearExportError={clearExportError} serverSaveError={serverSaveError} />
      <AppWorkspace
        mainRef={mainRef}
        snapshotExporting={snapshotExporting} snapshotProgress={snapshotProgress}
      />
      <AppOverlays logPanelOpen={logPanelOpen} setLogPanelOpen={setLogPanelOpen} />
      {cheatSheetOpen && <VimCheatSheet onClose={hideCheatSheet} />}
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
