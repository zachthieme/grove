import { useRef, useState, useCallback } from 'react'
import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import { useOrgDiff } from './hooks/useOrgDiff'
import { useExport } from './hooks/useExport'
import { useManagerSet } from './hooks/useIsManager'
import { useAutosave } from './hooks/useAutosave'
import UploadPrompt from './components/UploadPrompt'
import Toolbar from './components/Toolbar'
import DetailSidebar from './components/DetailSidebar'
import RecycleBinDrawer from './components/RecycleBinDrawer'
import UnparentedBar from './components/UnparentedBar'
import AutosaveBanner from './components/AutosaveBanner'
import ColumnMappingModal from './components/ColumnMappingModal'
import ManagerInfoPopover from './components/ManagerInfoPopover'
import ColumnView from './views/ColumnView'
import ManagerView from './views/ManagerView'

function AppContent() {
  const { loaded, viewMode, dataView, selectedIds, toggleSelect, original, working, recycled, currentSnapshotName, add, remove, pendingMapping, confirmMapping, cancelMapping, layoutKey, error, clearError } = useOrg()
  useAutosave({ original, working, recycled, currentSnapshotName, loaded })
  const mainRef = useRef<HTMLElement>(null)
  const { exportPng, exportSvg } = useExport(mainRef)

  const people = dataView === 'original' ? original : working
  const changes = useOrgDiff(original, working)
  const showChanges = dataView === 'diff'
  const managerSet = useManagerSet(working)

  const ghostPeople = showChanges
    ? original.filter((o) => !working.find((w) => w.id === o.id))
    : []

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

  const handleAddToTeam = useCallback(async (parentId: string, team: string) => {
    await add({
      name: 'New Person',
      role: '',
      discipline: '',
      team,
      managerId: parentId,
      status: 'Active',
      additionalTeams: [],
    })
  }, [add])

  const handleDeletePerson = useCallback(async (personId: string) => {
    await remove(personId)
  }, [remove])

  const [infoPopoverId, setInfoPopoverId] = useState<string | null>(null)

  const handleShowInfo = useCallback((personId: string) => {
    setInfoPopoverId(personId)
  }, [])

  const hasSidebarSelection = selectedIds.size > 0

  return (
    <div className={styles.app}>
      <Toolbar onExportPng={exportPng} onExportSvg={exportSvg} />
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 20px', background: 'var(--grove-red-light)',
          borderBottom: '1px solid var(--grove-red)', fontSize: 13, color: 'var(--grove-red)',
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={clearError} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--grove-red)', fontSize: 16,
          }}>×</button>
        </div>
      )}
      <UnparentedBar />
      <AutosaveBanner />
      <div className={styles.body}>
        <main className={styles.main} ref={mainRef}>
          {!loaded ? (
            <UploadPrompt />
          ) : viewMode === 'manager' ? (
            <ManagerView
              key={layoutKey}
              people={people}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              changes={showChanges ? changes : undefined}
              managerSet={managerSet}
              onAddReport={handleAddReport}
              onDeletePerson={handleDeletePerson}
              onInfo={handleShowInfo}
            />
          ) : viewMode === 'detail' ? (
            <ColumnView
              key={layoutKey}
              people={people}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              changes={showChanges ? changes : undefined}
              ghostPeople={ghostPeople}
              managerSet={managerSet}
              onAddReport={handleAddReport}
              onAddToTeam={handleAddToTeam}
              onDeletePerson={handleDeletePerson}
              onInfo={handleShowInfo}
            />
          ) : null}
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
    </div>
  )
}

export default function App() {
  return (
    <OrgProvider>
      <AppContent />
    </OrgProvider>
  )
}
