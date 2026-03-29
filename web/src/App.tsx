import { useRef, useState, useCallback, useEffect } from 'react'
import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import { ViewDataProvider, useActions } from './store/ViewDataContext'
import { useExport } from './hooks/useExport'
import { useSnapshotExport } from './hooks/useSnapshotExport'
import { useAutosave } from './hooks/useAutosave'
import { useEscapeKey } from './hooks/useEscapeKey'
import { useDeepLink } from './hooks/useDeepLink'
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
  const { loaded, viewMode, selectedIds, selectedPodId, clearSelection, original, working, recycled, pods, originalPods, settings, currentSnapshotName, pendingMapping, confirmMapping, cancelMapping, layoutKey, error, clearError, headPersonId, setHead, snapshots, saveSnapshot, loadSnapshot, deleteSnapshot, showAllEmploymentTypes, setViewMode, setSelectedId } = useOrg()
  const { infoPopoverId, clearInfoPopover } = useActions()

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
  useEscapeKey(clearHead, !!headPersonId)
  useEscapeKey(clearSelection, selectedIds.size > 0)

  const [loggingEnabled, setLoggingEnabled] = useState(false)
  const [logPanelOpen, setLogPanelOpen] = useState(false)

  useEffect(() => {
    getConfig().then((cfg) => {
      setLoggingEnabled(cfg.logging)
      setClientLogging(cfg.logging)
    }).catch(() => {})
  }, [])

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
      />
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
        <main className={styles.main} ref={mainRef} data-tour="main-content">
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
        {hasSidebarSelection && <DetailSidebar />}
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

export default function App() {
  return (
    <ErrorBoundary>
      <OrgProvider>
        <ViewDataProvider>
          <AppContent />
        </ViewDataProvider>
      </OrgProvider>
    </ErrorBoundary>
  )
}
