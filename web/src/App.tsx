import { useRef, useState, useCallback, useEffect } from 'react'
import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import { useOrgDiff } from './hooks/useOrgDiff'
import { useExport } from './hooks/useExport'
import { useSnapshotExport } from './hooks/useSnapshotExport'
import { useManagerSet } from './hooks/useIsManager'
import { useAutosave } from './hooks/useAutosave'
import { useHeadSubtree } from './hooks/useHeadSubtree'
import { useFilteredPeople } from './hooks/useFilteredPeople'
import { useSortedPeople } from './hooks/useSortedPeople'
import { useEscapeKey } from './hooks/useEscapeKey'
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
  const { loaded, viewMode, dataView, selectedIds, toggleSelect, batchSelect, original, working, recycled, pods, originalPods, settings, currentSnapshotName, add, remove, pendingMapping, confirmMapping, cancelMapping, layoutKey, error, clearError, hiddenEmploymentTypes, headPersonId, setHead, snapshots, saveSnapshot, loadSnapshot, deleteSnapshot, showAllEmploymentTypes, selectPod } = useOrg()
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

  const rawPeople = dataView === 'original' ? original : working
  const changes = useOrgDiff(original, working)
  const showChanges = dataView === 'diff'
  const managerSet = useManagerSet(working)

  const headSubtree = useHeadSubtree(headPersonId, working)
  const { people, ghostPeople } = useFilteredPeople(rawPeople, original, working, hiddenEmploymentTypes, headSubtree, showChanges)
  const sortedPeople = useSortedPeople(people, settings.disciplineOrder)
  const clearHead = useCallback(() => setHead(null), [setHead])
  useEscapeKey(clearHead, !!headPersonId)

  const handleSelect = useCallback((id: string, event?: React.MouseEvent) => {
    const multi = !!(event && (event.shiftKey || event.metaKey || event.ctrlKey))
    toggleSelect(id, multi)
  }, [toggleSelect])

  const handleAddReport = useCallback(async (parentId: string) => {
    const parent = working.find((p) => p.id === parentId)
    if (!parent) return
    await add({
      name: 'New Person',
      role: '',
      discipline: '',
      team: parent.team,
      managerId: parent.id,
      status: 'Active',
      additionalTeams: [],
    })
  }, [working, add])

  const handleAddToTeam = useCallback(async (parentId: string, team: string, podName?: string) => {
    await add({
      name: 'New Person',
      role: '',
      discipline: '',
      team,
      managerId: parentId,
      status: 'Active',
      additionalTeams: [],
      pod: podName,
    })
  }, [add])

  const handleDeletePerson = useCallback(async (personId: string) => {
    await remove(personId)
  }, [remove])

  const [loggingEnabled, setLoggingEnabled] = useState(false)
  const [logPanelOpen, setLogPanelOpen] = useState(false)

  useEffect(() => {
    getConfig().then((cfg) => {
      setLoggingEnabled(cfg.logging)
      setClientLogging(cfg.logging)
    }).catch(() => {})
  }, [])

  const [infoPopoverId, setInfoPopoverId] = useState<string | null>(null)

  const handleShowInfo = useCallback((personId: string) => {
    setInfoPopoverId(personId)
  }, [])

  const handleFocus = useCallback((personId: string) => {
    setHead(personId)
  }, [setHead])

  const hasSidebarSelection = selectedIds.size > 0

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
        <main className={styles.main} ref={mainRef}>
          {!loaded ? (
            <UploadPrompt />
          ) : viewMode === 'table' ? (
            <TableView
              people={sortedPeople}
              changes={showChanges ? changes : undefined}
              readOnly={dataView === 'original'}
            />
          ) : viewMode === 'manager' ? (
            <ManagerView
              key={layoutKey}
              people={sortedPeople}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              changes={showChanges ? changes : undefined}
              managerSet={managerSet}
              pods={pods}
              onAddReport={handleAddReport}
              onDeletePerson={handleDeletePerson}
              onInfo={handleShowInfo}
              onFocus={handleFocus}
              onPodSelect={selectPod}
              onBatchSelect={batchSelect}
            />
          ) : viewMode === 'detail' ? (
            <ColumnView
              key={layoutKey}
              people={sortedPeople}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onBatchSelect={batchSelect}
              changes={showChanges ? changes : undefined}
              ghostPeople={ghostPeople}
              managerSet={managerSet}
              pods={pods}
              onAddReport={handleAddReport}
              onAddToTeam={handleAddToTeam}
              onDeletePerson={handleDeletePerson}
              onInfo={handleShowInfo}
              onFocus={handleFocus}
              onPodSelect={selectPod}
            />
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
          onClose={() => setInfoPopoverId(null)}
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
        <AppContent />
      </OrgProvider>
    </ErrorBoundary>
  )
}
