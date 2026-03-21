import styles from './App.module.css'
import { OrgProvider, useOrg } from './store/OrgContext'
import UploadPrompt from './components/UploadPrompt'
import Toolbar from './components/Toolbar'
import HeadcountView from './views/HeadcountView'

function AppContent() {
  const { loaded, viewMode, dataView, original, working } = useOrg()

  const people = dataView === 'original' ? original : working

  return (
    <div className={styles.app}>
      <Toolbar />
      <div className={styles.body}>
        <div className={styles.main}>
          {!loaded ? (
            <UploadPrompt />
          ) : viewMode === 'headcount' ? (
            <HeadcountView people={people} />
          ) : viewMode === 'tree' ? (
            <div className={styles.placeholder}>Tree view coming soon</div>
          ) : (
            <div className={styles.placeholder}>Column view coming soon</div>
          )}
        </div>
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
