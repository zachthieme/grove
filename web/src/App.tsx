import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import { useOrgDiff } from './hooks/useOrgDiff'
import UploadPrompt from './components/UploadPrompt'
import Toolbar from './components/Toolbar'
import DetailSidebar from './components/DetailSidebar'
import UnparentedBar from './components/UnparentedBar'
import HeadcountView from './views/HeadcountView'
import TreeView from './views/TreeView'
import ColumnView from './views/ColumnView'

function AppContent() {
  const { loaded, viewMode, dataView, selectedId, setSelectedId, original, working } = useOrg()

  const people = dataView === 'original' ? original : working
  const changes = useOrgDiff(original, working)
  const showChanges = dataView === 'diff'

  const ghostPeople = showChanges
    ? original.filter((o) => !working.find((w) => w.id === o.id))
    : []

  return (
    <div className={styles.app}>
      <Toolbar />
      <UnparentedBar />
      <div className={styles.body}>
        <main className={styles.main}>
          {!loaded ? (
            <UploadPrompt />
          ) : viewMode === 'headcount' ? (
            <HeadcountView people={people} />
          ) : viewMode === 'tree' ? (
            <TreeView
              people={people}
              selectedId={selectedId}
              onSelect={setSelectedId}
              changes={showChanges ? changes : undefined}
              ghostPeople={ghostPeople}
            />
          ) : viewMode === 'columns' ? (
            <ColumnView
              people={people}
              selectedId={selectedId}
              onSelect={setSelectedId}
              changes={showChanges ? changes : undefined}
              ghostPeople={ghostPeople}
            />
          ) : null}
        </main>
        <DetailSidebar />
      </div>
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
